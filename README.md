# Ctrl-F

Ctrl+F for the physical world. Ask out loud "where are my keys?" and Ctrl-F looks through a camera, finds the item with computer vision, and tells you where it is and when it was last seen.

## How it works

1. User speaks a request ("find my wallet").
2. Audio is transcribed (ElevenLabs STT). The transcript goes to the vision model, which identifies the target item.
3. The Raspberry Pi captures a photo and sends it to the desktop.
4. The desktop runs YOLO on the photo and matches detections to the target.
5. The result is stored (snapshot + sighting row) and spoken back (Gemini writes the reply as a witty steampunk narrator, ElevenLabs TTS voices it).
6. History is kept, so Ctrl-F can answer "where did I last see it?" and "how often do I lose this?".

Theme: steampunk. The UI looks like brass and gears, and the narrator talks like a witty Victorian inventor.

## Documentation

| Doc | Purpose |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Start here if you are an AI agent. Rules, conventions, repo map. |
| [docs/PRD.md](docs/PRD.md) | What we build and why. Requirements and scope. |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Components, data flow, data model, API contracts. |
| [docs/TECH_STACK.md](docs/TECH_STACK.md) | Chosen tools and the reason for each. |

## Spec-driven development

This repo uses [OpenSpec](https://github.com/Fission-AI/OpenSpec). Behavior specs are in `openspec/specs/`, proposed changes in `openspec/changes/`. Start a change with `/opsx:propose "your idea"` in Claude Code. See [AGENTS.md](AGENTS.md).

## Status

Pre-code. Repo holds documentation only. See the roadmap in [docs/PRD.md](docs/PRD.md).

## Planned repo layout

```
web/       Next.js app (UI + API routes), deployed on Vercel
desktop/   Python service: YOLO inference, talks to Pi, DB, and storage
pi/        Python script on the Raspberry Pi: camera + relay (polls jobs, forwards photo to desktop; the Pi has no mic)
docs/      PRD, architecture, tech stack
```
