# Licenses and Terms Audit

Audit date: 2026-10-24. This is an engineering review, not legal advice. Items marked **verify** rest on third-party summaries or my memory, not on the primary license text.

## Bottom line

| Area | Status | Action |
| --- | --- | --- |
| Ultralytics YOLO (AGPL-3.0) | **Blocker for closed or commercial use** | Decide: open-source the repo under AGPL-3.0, buy an Ultralytics Enterprise license, or swap the detector |
| Appliance dataset (Open Images, CC BY) | OK with attribution | Keep `training/datasets/personal/ATTRIBUTION.csv`; credit if the images are ever redistributed |
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

- **Open Images V7** (used by `training/prepare_openimages.py`): annotations are CC BY 4.0. Images carry their own license, listed as CC BY 2.0, and Google makes no guarantee per image. The script keeps only images whose metadata says CC BY (not NC, ND, or SA). All 1,098 images in the current dataset are `creativecommons.org/licenses/by/2.0`. Author and source for each are in `training/datasets/personal/ATTRIBUTION.csv` (git-ignored with the data).
- **Attribution:** required when redistributing the images. Training on them and shipping only weights is the common practice, but whether weights count as a derivative is unsettled. **verify** if you publish the weights.
- **Roboflow Universe datasets** (chosen 2026-10-24 for keys, AirPods, wallets and headphones; downloaded to `training/datasets/` and merged into `training/datasets/personal`). Licenses below are from each download's `data.yaml`:

  | Item class | Dataset | License | Notes |
  | --- | --- | --- | --- |
  | keys | [python-jomkr/key-detection-project](https://universe.roboflow.com/python-jomkr/key-detection-project) | CC BY 4.0 (from its data.yaml) | Single `Keys` class; 246 images (234 train, 10 valid, 2 test) |
  | airpods, airpods case | [tomato-bm2ne/airpods-practice, version 5](https://universe.roboflow.com/tomato-bm2ne/airpods-practice/dataset/5) | CC BY 4.0 (from its data.yaml) | 127 images (65 train, 23 valid, 39 test); classes Airpods case closed, Airpods case opened, Earbud |
  | wallet | [valuable-object-detection/wallet-mjzrc](https://universe.roboflow.com/valuable-object-detection/wallet-mjzrc) | CC BY 4.0 (from its data.yaml) | 306 images (215 train, 58 valid, 33 test); class wallet |
  | headphones | [yolov8workspace/headphones-detection-rx2oj, version 2](https://universe.roboflow.com/yolov8workspace/headphones-detection-rx2oj/dataset/2) | CC BY 4.0 (from its data.yaml) | 212 images (205 train, 5 valid, 2 test); class headphone. Re-split 80/10/10 on import |

  CC BY 4.0 needs attribution if the images are redistributed. Keep the downloaded exports under `training/datasets/` (git-ignored).

  Added for models 3 and 4 (2026-10-24). `python training/audit_licenses.py` checked each against Roboflow's own license field, and all are free to use:

  | Item class | Dataset | License | Model |
  | --- | --- | --- | --- |
  | airpods | [project-uzwxb/airpods-7mme5 v7](https://universe.roboflow.com/project-uzwxb/airpods-7mme5/dataset/7) | CC BY 4.0 | 3 |
  | wallet | [project-qysdi/wallet-iiyy3 v1](https://universe.roboflow.com/project-qysdi/wallet-iiyy3/dataset/1) | CC BY 4.0 | 3 |
  | charger | [training-6xyil/charger-kaaid v6](https://universe.roboflow.com/training-6xyil/charger-kaaid/dataset/6) | CC BY 4.0 | 3 |
  | headphones | [workspace-w5tce/headphones-746cn v1](https://universe.roboflow.com/workspace-w5tce/headphones-746cn) | CC BY 4.0 | 3 |
  | keys | [samples-x5zfd/keys-jcx6v v1](https://universe.roboflow.com/samples-x5zfd/keys-jcx6v/dataset/1) | Public Domain | 4 |
  | keys | [keychain/key_detector-frzkk v3](https://universe.roboflow.com/keychain/key_detector-frzkk) | CC BY 4.0 | 4 |
  | keys | [paz/keychain-finder v1](https://universe.roboflow.com/paz/keychain-finder) | CC BY 4.0 | 4 |
  | keys, charger | [hilcps/yolo-based-fine-tuning v1](https://universe.roboflow.com/hilcps/yolo-based-fine-tuning) | CC BY 4.0 | 4 |
  | watch | [k-utryg/watch-waoqs v1](https://universe.roboflow.com/k-utryg/watch-waoqs) | CC BY 4.0 | 4 |
  | watch | [d110/watch-yhzpo v2](https://universe.roboflow.com/d110/watch-yhzpo) | CC BY 4.0 | 4 |
  | watch | [ashveen/yolo-project-5deak v1](https://universe.roboflow.com/ashveen/yolo-project-5deak) | CC BY 4.0 | 4 |
  | glasses | [salian-crizmar-e/eyeglasses-detection-gpmhh v1](https://universe.roboflow.com/salian-crizmar-e/eyeglasses-detection-gpmhh) | CC BY 4.0 | 4 |
  | airpods | [fazryans-workspace/detect-airpod-yc68z v1](https://universe.roboflow.com/fazryans-workspace/detect-airpod-yc68z) | CC BY 4.0 | 4 |
  | headphones | [headset/headset-hdg0p v1](https://universe.roboflow.com/headset/headset-hdg0p) | CC BY 4.0 | 4 |
  | headphones | [aihat/headphones-moskk v2](https://universe.roboflow.com/aihat/headphones-moskk) | CC BY 4.0 | 4 |
  | charger | [envirofi/chager-4zbaf v1](https://universe.roboflow.com/envirofi/chager-4zbaf) | CC BY 4.0 | 4 |
  | charger | [cet-vtlax/cable-charge v2](https://universe.roboflow.com/cet-vtlax/cable-charge) | CC BY 4.0 | 4 |
  | charger | [tutlol/charging-cable v2](https://universe.roboflow.com/tutlol/charging-cable) | CC BY 4.0 | 4 |
  | remote | [tahsin/tv-remote v1](https://universe.roboflow.com/tahsin/tv-remote) | CC BY 4.0 | 4 |
  | remote | [joe-n3eau/remote-4efpt v2](https://universe.roboflow.com/joe-n3eau/remote-4efpt) | CC BY 4.0 | 4 |

  Downloaded but not used, because the photos do not fit lost items in a messy room: eyeglass-9xul2 and dvaled-thesis/eyeglasses (glasses worn on faces, or close-ups), headphone-ofys4 (headphones worn on heads), remote-v1 (boxes look broken), Headphones v10 (an incomplete export with no `data.yaml`).

- **COCO (pretrained weights):** the stock `yolo11n.pt` and `yolo26n.pt` were trained on COCO. The dev server also runs stock `yolo26n.pt` next to your trained model, to name surrounding objects and detect `cell phone`. COCO annotations are CC BY 4.0 and its images come from Flickr with varied licenses (**verify**; I could not load the terms page).
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
