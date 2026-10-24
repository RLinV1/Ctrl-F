# Licenses and Terms Audit

Audit date: 2026-10-24. This is an engineering review, not legal advice. Items marked **verify** rest on third-party summaries or my memory, not on the primary license text.

## Bottom line

| Area | Status | Action |
| --- | --- | --- |
| Ultralytics YOLO (AGPL-3.0) | **Blocker for closed or commercial use** | Decide: open-source the repo under AGPL-3.0, buy an Ultralytics Enterprise license, or swap the detector |
| Appliance dataset (Open Images, CC BY) | OK with attribution | Keep `datasets/appliances/ATTRIBUTION.csv`; credit if the images are ever redistributed |
| ElevenLabs | OK for development; **verify** commercial terms | Free tier is non-commercial and needs attribution; use a paid plan before any commercial launch |
| Gemini | OK; **verify** data-use terms for your tier | Send text only, never photos |
| Other dependencies | OK | All permissive (MIT, BSD, Apache-2.0, PSF) |
| This repo | **No LICENSE file** | Add one that matches the Ultralytics decision |
| Secrets | OK | `.env` is ignored; no keys in tracked files or git history |
| Privacy | Needs a decision before going live | Photos of a home and voice recordings leave the machine |

## 1. Ultralytics YOLO is AGPL-3.0

`ultralytics` (and `ultralytics-thop`) are AGPL-3.0. Ultralytics states that using its code, models, training pipelines, or trained or fine-tuned models requires either releasing the whole project under AGPL-3.0 or buying an Enterprise License, including for models trained from scratch and for internal use. The pretrained `yolo11n.pt` weights carry the same license. Source: [ultralytics.com/license](https://ultralytics.com/license).

What that means here:
- **Personal use, learning, local testing:** fine.
- **Public open-source project:** fine if the repo is licensed AGPL-3.0.
- **Hosted service or closed product:** AGPL section 13 means users who use it over a network must be offered the source. A closed product needs the Enterprise License.

Options if AGPL does not fit: Ultralytics Enterprise License (priced per deployment), or a permissively licensed detector such as YOLOX (Apache-2.0) or an Apache-2.0 RT-DETR implementation (**verify** each license and weights before switching). Detection sits behind one module (`desktop/`), so a swap is contained.

## 2. Training data

- **Open Images V7** (used by `training/prepare_appliances.py`): annotations are CC BY 4.0. Images carry their own license, listed as CC BY 2.0, and Google makes no guarantee per image. The script keeps only images whose metadata says CC BY (not NC, ND, or SA). All 440 images in the current dataset are `creativecommons.org/licenses/by/2.0`. Author and source for each are in `datasets/appliances/ATTRIBUTION.csv` (git-ignored with the data).
- **Attribution:** required when redistributing the images. Training on them and shipping only weights is the common practice, but whether weights count as a derivative is unsettled. **verify** if you publish the weights.
- **COCO (pretrained weights):** `yolo11n.pt` was trained on COCO. COCO annotations are CC BY 4.0 and its images come from Flickr with varied licenses (**verify**; I could not load the terms page).
- **Your own webcam photos** (`collect.py`, the React Camera panel): you own them, but they may show people or private spaces. Do not commit them (`datasets/` is git-ignored).
- **HomeObjects-3K** (Ultralytics): considered and not used. It has no appliances, and its page lists AGPL-3.0 (**verify**).

## 3. Services

- **ElevenLabs:** third-party summaries say the free plan has no commercial license and requires attribution, and paid plans include a commercial license (**verify** on elevenlabs.io/terms). Voice audio and your mic recordings are sent to ElevenLabs. The `George` voice is a premade voice; check that your plan allows it commercially. The API key needs only the Text to Speech and Speech to Text scopes.
- **Gemini:** governed by Google's Gemini API terms. Free-tier prompts may be used to improve Google products, while paid-tier prompts are not (**verify**). The narrator only receives a short text result, so no photos or recordings go to Gemini. Keep it that way.
- **Docker Desktop:** free for personal use and small businesses; larger companies need a paid subscription (**verify** current thresholds).

## 4. Dependencies

Python (from the installed environment):

| Package | License |
| --- | --- |
| torch | BSD-style, Apache-2.0 components |
| torchvision | BSD |
| opencv-python | Apache-2.0 |
| numpy | BSD-3-Clause and others |
| requests | Apache-2.0 |
| pillow | MIT-CMU |
| pyyaml | MIT |
| psutil | BSD-3-Clause |
| matplotlib | PSF-based |
| polars | MIT |

Web (`dev-test/ui-react`): react, react-dom, vite, @vitejs/plugin-react are MIT. typescript is Apache-2.0.

Infrastructure images: PostgreSQL (PostgreSQL License), SeaweedFS (Apache-2.0, **verify**). OpenSpec tooling is dev-only (**verify** license).

## 5. Secrets and repo hygiene

- Scan of tracked files and full git history found no API keys or tokens. `.env.example` has empty names only.
- `.gitignore` covers `.env`, `datasets/`, `runs/`, weights (`*.pt`, `*.onnx`), `.venv/`, `node_modules/`.
- Rotate the ElevenLabs key if the machine or `.env` is ever shared.
- No `LICENSE` file exists yet.

## 6. Privacy

- Camera photos show the inside of a home. They stay local while running locally. For go-live they go to a private bucket with signed URLs and a login (see `docs/TECH_STACK_LIVE.md`).
- Recorded speech is sent to ElevenLabs for transcription. Tell anyone who uses the app.
- The collect tool can capture people. Delete or exclude photos of other people.

## Action items

- [ ] Decide AGPL-3.0 vs Enterprise License vs swapping the detector, then add a matching `LICENSE`
- [ ] Add a short "Third-party data and attribution" note to the README if the repo is public
- [ ] Confirm ElevenLabs plan and commercial terms before any launch
- [ ] Confirm which Gemini tier you use and its data terms
- [ ] Add a privacy notice to the UI before sharing it with other people
