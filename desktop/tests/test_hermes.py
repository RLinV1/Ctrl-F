"""Hermes boundary tests: no agent, paid API, S3, or database is contacted."""

import json
from dataclasses import replace
from datetime import UTC, datetime

import httpx
import pytest

from hermes import HermesClient, HermesConfig, HermesError, PhotoContext, validate_scene

PHOTO = PhotoContext("incoming/test.jpg", datetime(2026, 10, 25, tzinfo=UTC), 1280, 720)
CATALOG = {"keys": ["keyring"], "wallet": ["billfold"]}
JPEG = b"\xff\xd8\xfftest-image"
CONFIG = HermesConfig("http://127.0.0.1:8642/v1", "secret-token")


def observation(item="keys"):
    return {"item": item, "bbox": {"x": 0.1, "y": 0.2, "w": 0.3, "h": 0.4},
            "location_description": "On the desk, beside the red mug"}


def scene(observations=None):
    return {"status": "complete", "photo": PHOTO.as_dict(),
            "observations": [observation()] if observations is None else observations}


def reply(raw=None, reason="stop"):
    return {"choices": [{"finish_reason": reason,
                         "message": {"content": json.dumps(scene() if raw is None else raw)}}]}


def client(handler):
    return HermesClient(CONFIG, transport=httpx.MockTransport(handler))


@pytest.mark.parametrize("missing", ["HERMES_BASE_URL", "HERMES_API_KEY"])
def test_missing_settings_name_only(missing):
    env = {"HERMES_BASE_URL": CONFIG.base_url, "HERMES_API_KEY": CONFIG.api_key}
    del env[missing]
    with pytest.raises(HermesError, match=missing) as exc:
        HermesConfig.from_env(env)
    assert CONFIG.api_key not in str(exc.value)


@pytest.mark.parametrize("url", ["", "ftp://localhost/v1", "http://example.com/v1", "https://x/",
                                 "https://u:password@x/v1", "https://x/v1?key=secret", "https://x/v1#fragment", "http://localhost:bad/v1", "http://[bad/v1"])
def test_invalid_endpoint(url):
    with pytest.raises(HermesError):
        replace(CONFIG, base_url=url)


@pytest.mark.parametrize("timeout", ["bad", "nan", "inf", "0", "-1", "121"])
def test_bad_timeout(timeout):
    with pytest.raises(HermesError, match="HERMES_TIMEOUT_SECONDS"):
        HermesConfig.from_env({"HERMES_BASE_URL": CONFIG.base_url,
                               "HERMES_API_KEY": CONFIG.api_key, "HERMES_TIMEOUT_SECONDS": timeout})


def test_trailing_slash_and_secret_repr():
    config = HermesConfig.from_env({"HERMES_BASE_URL": CONFIG.base_url + "/", "HERMES_API_KEY": CONFIG.api_key})
    assert config.completions_url == CONFIG.base_url + "/chat/completions"
    assert CONFIG.api_key not in repr(config)


def test_request_auth_image_and_incidental_item():
    def handler(request):
        assert str(request.url) == CONFIG.base_url + "/chat/completions"
        assert request.headers["Authorization"] == "Bearer " + CONFIG.api_key
        payload = json.loads(request.content)
        prompt = json.loads(payload["messages"][0]["content"][0]["text"])
        assert set(prompt["catalog"]) == {"keys", "wallet"}
        assert prompt["targets"] == ["keys"]
        assert payload["messages"][0]["content"][1]["image_url"]["url"].startswith("data:image/jpeg;base64,")
        return httpx.Response(200, json=reply(scene([observation("keys"), observation("billfold")])))
    result = client(handler).analyze(JPEG, PHOTO, CATALOG, ["keys"])
    assert [o.item for o in result.observations] == ["keys", "wallet"]
    assert result.observations[0].confidence is None
    assert result.photo == PHOTO


def test_empty_scene_is_explicit_success():
    assert validate_scene(scene([]), PHOTO, CATALOG, "hermes-agent").observations == ()


@pytest.mark.parametrize("mutation", [
    lambda s: s.pop("observations"),
    lambda s: s.update(status="partial"),
    lambda s: s["photo"].update(width=99),
    lambda s: s["observations"][0].update(item="unknown"),
    lambda s: s["observations"][0].update(location_description=""),
    lambda s: s["observations"][0].update(location_description="x" * 501),
    lambda s: s["observations"][0].update(confidence=True),
    lambda s: s["observations"][0].update(confidence=1.2),
    lambda s: s["observations"][0]["bbox"].update(w=0),
    lambda s: s["observations"][0]["bbox"].update(x=-0.1),
    lambda s: s["observations"][0]["bbox"].update(w=1),
    lambda s: s["observations"][0]["bbox"].update(x=float("nan")),
    lambda s: s["observations"][0]["bbox"].update(x=True),
])
def test_reject_whole_invalid_scene(mutation):
    raw = scene()
    mutation(raw)
    with pytest.raises(HermesError):
        validate_scene(raw, PHOTO, CATALOG, "hermes-agent")


def test_alias_collision_rejected_before_network():
    with pytest.raises(HermesError, match="Ambiguous"):
        client(lambda r: pytest.fail("unexpected API call")).analyze(JPEG, PHOTO, {"keys": ["wallet"], "wallet": []})


@pytest.mark.parametrize("reason", ["length", "error", "cancelled", "tool_calls", None])
def test_incomplete_completion_fails(reason):
    with pytest.raises(HermesError, match="did not finish"):
        client(lambda r: httpx.Response(200, json=reply(reason=reason))).analyze(JPEG, PHOTO, CATALOG)


@pytest.mark.parametrize("status", [301, 302, 400, 401, 403])
def test_no_redirect_or_retry_for_auth_and_client_errors(status):
    requests = []
    def handler(request):
        requests.append(request)
        return httpx.Response(status, headers={"location": "https://untrusted.example/v1"}, text=CONFIG.api_key)
    with pytest.raises(HermesError, match=f"HTTP {status}") as exc:
        client(handler).analyze(JPEG, PHOTO, CATALOG)
    assert len(requests) == 1
    assert CONFIG.api_key not in str(exc.value)


@pytest.mark.parametrize("status", [429, 502, 503, 504])
def test_retry_once_on_temporary_failure(status):
    requests = []
    def handler(request):
        requests.append(request)
        return httpx.Response(status) if len(requests) == 1 else httpx.Response(200, json=reply())
    assert client(handler).analyze(JPEG, PHOTO, CATALOG).observations
    assert len(requests) == 2


def test_transport_failure_is_bounded_and_redacted():
    requests = []
    def handler(request):
        requests.append(request)
        raise httpx.ReadTimeout(CONFIG.api_key, request=request)
    with pytest.raises(HermesError) as exc:
        client(handler).analyze(JPEG, PHOTO, CATALOG)
    assert len(requests) == 2
    assert CONFIG.api_key not in str(exc.value)
    assert exc.value.__suppress_context__


def test_json_failure_is_redacted():
    with pytest.raises(HermesError, match="invalid analysis JSON") as exc:
        client(lambda r: httpx.Response(200, text=CONFIG.api_key)).analyze(JPEG, PHOTO, CATALOG)
    assert CONFIG.api_key not in str(exc.value)


def test_reject_huge_reply():
    with pytest.raises(HermesError, match="size or time"):
        client(lambda r: httpx.Response(200, content=b"x" * (1024 * 1024 + 1))).analyze(JPEG, PHOTO, CATALOG)


def test_reject_non_jpeg_without_network():
    with pytest.raises(HermesError, match="JPEG"):
        client(lambda r: pytest.fail("unexpected API call")).analyze(b"not an image", PHOTO, CATALOG)


def test_deadline_prevents_another_attempt(monkeypatch):
    times = iter([0.0, 0.0, 31.0])
    monkeypatch.setattr("hermes.time.monotonic", lambda: next(times))
    requests = []
    def handler(request):
        requests.append(request)
        return httpx.Response(503)
    with pytest.raises(HermesError, match="deadline"):
        client(handler).analyze(JPEG, PHOTO, CATALOG)
    assert len(requests) == 1


def test_memory_request_requires_explicit_status():
    def handler(request):
        payload = json.loads(request.content)
        prompt = json.loads(payload["messages"][0]["content"])
        assert prompt["arguments"]["item_id"] == "item-id"
        return httpx.Response(200, json={"choices":[{"finish_reason":"stop","message":{"content":'{"status":"never_seen"}'}}]})
    assert client(handler).recall("item-id", PHOTO.taken_at) == {"status":"never_seen"}


def test_invalid_memory_response_fails():
    with pytest.raises(HermesError, match="Invalid memory"):
        client(lambda r: httpx.Response(200, json=reply())).recall("id", PHOTO.taken_at)
