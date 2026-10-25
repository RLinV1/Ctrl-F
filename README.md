# Ctrl-F

Ctrl+F for the physical world. Ask out loud "where are my keys?" and Ctrl-F takes a photo, finds the item in it, and tells you where it is and when it was last seen.

## How it works

1. You ask by voice (browser mic, or the button on the Pi) or by typing.
2. **ElevenLabs** transcribes the audio (speech-to-text).
3. **Plain code** (no AI model) pulls the item names out of the transcript. It strips filler like "where are my", then matches the rest against known item names and aliases. Any item phrase is accepted; the known list only helps with naming.
4. The Raspberry Pi takes a photo and uploads it to S3.
5. The desktop worker sends the photo to **Hermes**, a vision agent. Hermes finds the requested items in the photo. The worker checks Hermes's answer and looks up each item's earlier sightings in Postgres.
6. The worker saves the sighting (photo and database row) and an annotated image.
7. The web app asks **Gemini** to word the answer as a witty Victorian narrator, and **ElevenLabs** speaks it (text-to-speech) in the browser.
8. History is kept, so Ctrl-F can answer "where did I last see it?" and "how often do I lose this?".

## What each piece does

| Piece | Does | Does not |
| --- | --- | --- |
| Gemini | Writes the narrator's reply in steampunk voice | Parse requests, find items, or touch images |
| Hermes | Analyzes the photo: finds the requested items, says where they are | Transcribe speech, parse the request, or keep the history of record |
| Plain code (web and desktop) | Extracts item names from the transcript | Use any model |
| ElevenLabs | Speech-to-text for requests, text-to-speech for replies | |
| Postgres | Authoritative store of sightings and item history | |
| S3 bucket | Private store for photos, audio and job files | |
| Raspberry Pi | Takes photos, records button requests, uploads to S3 | Run models or call the web app |
| Web app (Vercel) | UI, job relay, narration and voice | Run Hermes or long jobs, or call the Pi or desktop |

Theme: steampunk. The UI looks like brass and gears, and the narrator talks like a witty Victorian inventor.

## Documentation

| Doc | Purpose |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Start here if you are an AI agent. Rules, conventions, repo map. |
| [docs/PRD.md](docs/PRD.md) | What we build and why. Requirements and scope. |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Components, data flow, data model, API contracts. |
| [docs/TECH_STACK.md](docs/TECH_STACK.md) | Chosen tools and the reason for each. |
| [docs/TRAINING.md](docs/TRAINING.md) | Optional YOLO training experiments. Not used by the active runtime. |

## Run on your service hosts

Follow [desktop/README.md](desktop/README.md), [pi/README.md](pi/README.md) and [web/README.md](web/README.md) on their deployment hosts. The coding workstation is not a deployment target. Docker Compose can supply a local Postgres when desired.

```bash
cp .env.example .env
docker compose up -d
```

Stack details: [docs/TECH_STACK.md](docs/TECH_STACK.md). Go-live stack: [docs/TECH_STACK_LIVE.md](docs/TECH_STACK_LIVE.md).

## Spec-driven development

This repo uses [OpenSpec](https://github.com/Fission-AI/OpenSpec). Behavior specs are in `openspec/specs/`, proposed changes in `openspec/changes/`. Start a change with `/opsx:propose "your idea"` in Claude Code. See [AGENTS.md](AGENTS.md).

## Status

Hermes transition implemented with mocked tests; deployment-host database and hardware acceptance remain. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Repo layout

```
web/       Next.js app (UI + API routes, Gemini narration, ElevenLabs voice), deployed on Vercel
desktop/   Python worker: polls S3, calls Hermes, saves sightings to Postgres, annotates images
pi/        Python service on the Raspberry Pi: camera, button, recording, uploads to S3
docs/      PRD, architecture, tech stack
```
