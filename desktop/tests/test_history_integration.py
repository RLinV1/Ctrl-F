"""The supplied-history adapter and processing path with isolated real Postgres."""
import json
from datetime import UTC, datetime

import httpx
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ctrlf_db.models import Detection, Item, Photo
from ctrlf_db.repo import Box, save_result
from ctrlf_db.seed import add_items
from hermes import HermesClient, HermesConfig
from processing import process_photo
from .test_server_db import jpeg


def test_local_history_alias_retry_and_fresh_sessions(session):
    add_items(session, ["keys", "wallet"])
    with session.begin():
        session.scalar(select(Item).where(Item.name == "wallet")).aliases = ["billfold"]
    first = datetime(2026, 10, 24, 9, tzinfo=UTC)
    cutoff = datetime(2026, 10, 24, 10, tzinfo=UTC)
    save_result(session, s3_key="incoming/earlier.jpg", taken_at=first, width=100, height=80,
                boxes=[Box("wallet", None, {"x":.1,"y":.2,"w":.2,"h":.2}, "Beside the mug")])
    bind = session.get_bind()
    prompts = []
    def handler(request):
        content = json.loads(request.content)["messages"][-1]["content"]
        if isinstance(content, list):
            photo = json.loads(content[0]["text"])["photo"]
            answer = {"status":"complete", "photo":photo, "observations":[]}
        else:
            prompt = json.loads(content); prompts.append(prompt)
            assert prompt["sighting"]["location_description"] == "Beside the mug"
            assert prompt["sighting"]["seen_at"] == first.isoformat()
            answer = {"status":"available", "detection_id":prompt["sighting"]["detection_id"]}
        return httpx.Response(200, json={"choices":[{"finish_reason":"stop","message":{"content":json.dumps(answer)}}]})
    def fresh_agent():
        return HermesClient(HermesConfig("http://127.0.0.1:8642/v1", "mock"),transport=httpx.MockTransport(handler))
    for _ in range(2):
        facts, _ = process_photo(jpeg(), "incoming/absent.jpg", cutoff, ["billfold"], fresh_agent(), lambda: Session(bind))
        assert facts["history_status"] == "available"
        assert facts["last_sighting"]["location_description"] == "Beside the mug"
        assert facts["target"] == "wallet"
    with Session(bind) as check:
        assert check.scalar(select(func.count()).select_from(Photo)) == 2
        assert check.scalar(select(func.count()).select_from(Detection)) == 1
        assert check.scalar(select(Item.lost_count).where(Item.name == "wallet")) == 1
    assert len(prompts) == 2


def test_new_categories_persist_and_recall_after_restart_without_reanalysis(session):
    bind = session.get_bind()
    first = datetime(2026, 10, 25, 9, tzinfo=UTC)
    later = datetime(2026, 10, 25, 10, tzinfo=UTC)
    analyses = []
    def handler(request):
        content = json.loads(request.content)["messages"][-1]["content"]
        if isinstance(content, list):
            prompt = json.loads(content[0]["text"]); analyses.append(prompt)
            visible = prompt["photo"]["taken_at"] == first.isoformat()
            observations = [{"item":name,"bbox":{"x":.1,"y":.2,"w":.2,"h":.3},
                             "location_description":"On the desk beside the lamp"} for name in ("bottle","notebook")] if visible else []
            answer = {"status":"complete","photo":prompt["photo"],"observations":observations}
        else:
            prompt = json.loads(content)
            answer = {"status":"available","detection_id":prompt["sighting"]["detection_id"]} if prompt["sighting"] else {"status":"never_seen"}
        return httpx.Response(200,json={"choices":[{"finish_reason":"stop","message":{"content":json.dumps(answer)}}]})
    def agent():
        return HermesClient(HermesConfig("http://127.0.0.1:8642/v1","mock"),transport=httpx.MockTransport(handler))
    found, _ = process_photo(jpeg(),"incoming/bottle-first.jpg",first,["bottle"],agent(),lambda:Session(bind))
    assert found["status"] == "found"
    assert set(found["known"]) == {"bottle","notebook"}
    for _ in range(2):
        absent, _ = process_photo(jpeg(),"incoming/bottle-later.jpg",later,["bottle","umbrella"],agent(),lambda:Session(bind))
        assert absent["history_status"] == "available"
        assert absent["last_sighting"]["seen_at"] == first.isoformat()
        assert absent["items"][1]["history_status"] == "never_seen"
    assert len(analyses) == 2
    with Session(bind) as check:
        assert check.scalar(select(func.count()).select_from(Photo)) == 2
        assert check.scalar(select(func.count()).select_from(Detection)) == 2
        assert check.scalar(select(func.count()).select_from(Item)) == 3
        assert check.scalar(select(Item.lost_count).where(Item.name == "bottle")) == 1
        assert check.scalar(select(Detection.item_id).where(Detection.label == "notebook")) is not None
