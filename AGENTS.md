# AGENTS.md

Guidance for AI coding agents working in this repo. Humans: see [README.md](README.md).

## What this project is

Ctrl-F finds lost physical items. Voice request -> Raspberry Pi photo -> YOLO on a desktop -> stored sighting + spoken answer. Details: [docs/PRD.md](docs/PRD.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/TECH_STACK.md](docs/TECH_STACK.md).

## Read first

1. `docs/PRD.md` for scope. Do not build non-goals.
2. `docs/ARCHITECTURE.md` for data flow, schema, API contracts.
3. `docs/TECH_STACK.md` for approved tools. Items marked "Decided" are fixed. Items marked "Default" may change, but say so.

## Spec-driven workflow (OpenSpec)

We use [OpenSpec](https://github.com/Fission-AI/OpenSpec). Specs live in `openspec/`.

- `openspec/specs/` holds the current source of truth for behavior.
- `openspec/changes/` holds proposed changes (proposal, design, tasks, spec deltas).
- Do not start non-trivial work without a change. Run `/opsx:propose "idea"` (Claude Code) or `/openspec-propose "idea"` (other agents), then implement from the generated `tasks.md`, then archive.
- `docs/` is background context (the why). `openspec/specs/` is the contract (the what). If they conflict, the spec wins, then fix `docs/`.
- Project context for OpenSpec is in `openspec/config.yaml`.

## Repo map (planned)

```
web/       Next.js (TypeScript) -> Vercel
desktop/   Python FastAPI service: STT, YOLO, DB, storage, Gemini narrator, TTS
pi/        Python service on the Raspberry Pi: camera + job relay (no mic on the Pi)
docs/      PRD, architecture, tech stack
```

Directories are created as milestones land (see PRD roadmap). Check the filesystem before assuming a folder exists.

## Hard constraints

- Vercel runs only the web app. No YOLO, no long jobs, no inbound calls to the desktop or Pi.
- The desktop writes results directly to Postgres and object storage. The web app never calls the desktop or the Pi.
- The browser owns the mic and speaker. The Pi takes photos and relays each request to the desktop. The Pi polls the web API for jobs (outbound only).
- Never commit secrets. Add new env var names to `.env.example` and `docs/TECH_STACK.md`.
- Snapshots are private. Serve them with signed URLs only.
- Storage code uses the S3 API only, so the backend (R2, Supabase, SeaweedFS) stays swappable.
- Stock YOLO (COCO) cannot detect keys or wallets. Keep matching logic behind one module so the strategy can change.

## Theme

Steampunk everywhere: web UI (brass, copper, aged paper, gears, gauges, Victorian type) and the Gemini narrator voice. Keep text contrast accessible. See `docs/PRD.md`.

## Conventions

- Commits: Conventional Commits (`feat(web): ...`, `fix(desktop): ...`, `docs: ...`, `chore: ...`).
- Branches: `type/short-slug` (e.g. `feat/pi-capture`).
- Do not add `Co-Authored-By` trailers.
- TypeScript: strict mode. Python: 3.11+, type hints on public functions.
- Keep changes small. One milestone step per PR.
- When you change behavior, API shape, or schema, update the matching file in `docs/` in the same commit.

## Testing the website

- Use Playwright for all website tests (`web/`). Put E2E tests in `web/e2e/`, run with `pnpm exec playwright test`.
- Mock external services (Gemini, ElevenLabs, Postgres, storage) in tests. Never call paid APIs from CI.
- Agents with the Playwright MCP may also use it to check pages by hand, but a UI change is not done until a Playwright test covers it.
- Python services (`desktop/`, `pi/`) use pytest.

## Definition of done

- Code runs locally from the README instructions for that component.
- At least one test or a documented manual check for new non-trivial logic (matching, parsing, DB queries).
- Any change to the website has a passing Playwright test.
- Docs updated if contracts changed.

## Open decisions (ask the user before assuming)

- Managed Postgres + R2 vs self-hosted SeaweedFS.
- Which item classes to train first, and where training runs (local GPU vs cloud).
- How the target is pulled from the transcript before it reaches YOLO (strip filler words and match against the trained class list).

The YOLO model is custom-trained (fine-tuned) on our item classes. See `docs/TRAINING.md`. Weights are not committed to git.

Gemini is only the narrator: a witty steampunk persona that words the final reply. It does not parse requests or detect items.
- On-demand capture only vs periodic background snapshots.
- Job hand-off: Pi polling `/api/jobs/next` (default) vs exposing the Pi through a tunnel.
