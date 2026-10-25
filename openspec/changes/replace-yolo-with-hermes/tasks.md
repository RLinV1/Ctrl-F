# Tasks

Each group is a separate reviewable milestone/PR. Keep the current runtime usable until its replacement is configured. All automated external-service calls are mocked; paid provider evaluation is a documented operator check.

## 1. Hermes connection and observation contract

- [x] 1.1 Add the server-side HTTP adapter and env validation for `HERMES_BASE_URL`, `HERMES_API_KEY`, `HERMES_MODEL`, and `HERMES_TIMEOUT_SECONDS`; verify mocked auth, base-path joining, missing settings, bounded retries/timeouts and secret redaction with pytest.
- [x] 1.2 Define and validate all-object observations, canonical names/aliases, positive normalized boxes, optional confidence, location descriptions and capture metadata; verify malformed/partial output and provider failure cannot become successful empty scenes with pytest fixtures.
- [ ] 1.3 Pin a tested Hermes release and document its API/vision-provider setup, loopback endpoint, key mapping and startup commands in a desktop setup guide; add env names to `.env.example` and `docs/TECH_STACK.md`, and verify the documented connectivity/image check against an operator-configured instance before rollout.

## 2. Durable object-location memory

- [ ] 2.1 Add an Alembic migration for location descriptions and nullable confidence; verify upgrade against an existing seeded database and legacy sighting reads using pytest/Postgres fixtures, and update the schema contract in `docs/ARCHITECTURE.md` in the same PR.
- [ ] 2.2 Extend repository writes for every accepted tracked object, deterministic best-box selection, capture timestamps and retry-safe lost counts; verify incidental sightings, absent objects, duplicate photos and out-of-order photos with pytest.
- [ ] 2.3 Implement a parameterized earlier-sighting query and expose it as the restricted local Hermes MCP history tool; verify aliases, current-photo exclusion, empty history, unavailable DB and evidence-ID validation with pytest, and document the tool registration/configuration.
- [ ] 2.4 Require database configuration for memory-enabled processing and distinguish unavailable history/unpersisted results from never seen; verify failure recovery and restart-based last-seen retrieval using database integration tests.

## 3. Replace desktop runtime perception

- [x] 3.1 Connect Hermes analysis and history tools to the S3 worker, replacing YOLO imports/inference in the active runtime; fix the poller's capture-time argument and propagate Pi timestamps, verifying a mocked incoming photo reaches the adapter and saves all observations with pytest.
- [x] 3.2 Publish versioned compatible success/error results and annotated photos without YOLO; verify JSON-before-image ordering, legacy compatibility, retry after failed persistence, malformed analysis, and completion checks with mocked S3/Postgres tests.
- [x] 3.3 Update desktop dependencies/run instructions and mark training utilities as outside the active search runtime in `docs/TRAINING.md`; verify the documented worker startup no longer requires YOLO weights and preserves legacy stored history.

## 4. Logitech microphone and Pi button

- [x] 4.1 Add bounded hold-to-record/release-to-submit behavior using configurable `PI_AUDIO_DEVICE`, ALSA capture and supported Ogg encoding; verify debounce, short clips, maximum duration, missing device and cleanup using mocked subprocess/GPIO pytest tests.
- [x] 4.2 Upload Pi audio and an immediately captured photo through S3 with a ready marker and persistent local retry spool; verify marker ordering, retry IDs, duplicate button edges, and serialized camera access with pytest.
- [x] 4.3 Preserve explicit training-photo CLI mode, document OS packages, ALSA discovery, device selection, recording limits and new env names in `.env.example`, `docs/TECH_STACK.md` and Pi instructions; verify actual Logitech audio plus photo capture on the Pi and record the manual result.

## 5. Narration and historical photo presentation

- [x] 5.1 Extend web result/Postgres types and parsers for location descriptions, optional scores and per-target history outcomes; restore Playwright configuration/fixtures under `web/e2e/` and verify current, historical and legacy results with `pnpm exec playwright test` and mocked services.
- [x] 5.2 Replace recent-S3-only last-seen narration with validated Postgres-backed history supplied through Hermes results; update Gemini facts/prompt and plain fallback, verifying found-now, absent-with-history, never-seen and history-unavailable text with Playwright coverage and no paid calls.
- [x] 5.3 Display location and capture time with the appropriate current or historical image/box, hide absent confidence percentages and preserve history links; verify historical boxes never overlay the fresh photo using Playwright at desktop/mobile sizes, and update result contracts in `docs/ARCHITECTURE.md`.

## 6. Shared browser device discovery and playback

- [x] 6.1 Move device discovery to the shared Ask lifecycle with stable IDs/cursor and session deduplication independent of input mode; verify a Pi job appears within two seconds under controlled polling, mode changes do not lose it, and active web requests are not silently replaced using Playwright.
- [x] 6.2 Add audio enablement and preserve text/replay on blocked playback, serialize replies and avoid repeated automatic playback; verify both triggers, blocked autoplay, duplicate polls, typed input and reduced-motion behavior using Playwright.
- [x] 6.3 Update frontend run instructions and API docs for the one-Pi/one-browser behavior, audio ownership and in-flight restart limitations; verify examples match the implemented routes and Playwright fixtures.

## 7. Cross-component acceptance and contract reconciliation

- [x] 7.1 Run a mocked end-to-end browser request and Pi-device request through transcription, S3 capture, Hermes observation/history, Postgres, Gemini and TTS boundaries; verify the same job yields visible evidence and one browser reply with Playwright plus Python integration checks.
- [ ] 7.2 On actual hardware, find keys and incidentally observe a wallet, remove the wallet, restart the agent/worker, then ask for it through each trigger; document that the old marked photo/location/time is retrieved, measure end-to-end latency and validate a fixed set of small-object localization examples.
- [x] 7.3 Update PRD F1-F9 and relevant architecture/tech-stack sections, root guidance and OpenSpec context to reflect Pi audio and Hermes while keeping Gemini/ElevenLabs roles explicit; reconcile conflicting sections in overlapping unarchived changes and verify strict OpenSpec validation before proposing archival.

## Workflow follow-up

- Review the completed implementation and hardware acceptance evidence before archiving this change.
- Archive only after conflicting unarchived capability definitions have been reconciled; verify resulting main specs describe this agreed flow.


## Deployment acceptance still open

Per the user's clarification, this workstation is not a runtime deployment target.
The remaining unchecked tasks have their code/docs in place where applicable but
retain live acceptance conditions: 1.3 needs the actual Hermes version/provider
record; 2.1–2.4 need the isolated Postgres migration/repository/restart tests and
real MCP evidence lookup; 4.3 and 7.2 need Logitech/GPIO and full real-host tests.
Do not mark these done from skipped tests or the API schema-only smoke result.
See `docs/DEPLOYMENT.md`. No real deployment database has been migrated here.


## 8. S3-only Pi voice revision (user approved)

- [x] 8.1 Replace HTTP voice submission with the local spool and S3-only ready protocol; verify partial uploads, retries and no dependency on WEB_BASE_URL/PI_JOB_TOKEN using Pi pytest tests.
- [x] 8.2 Add desktop ElevenLabs STT for ready device requests, canonical alias matching and transcript reuse; verify incomplete uploads, STT failures, duplicate/retry handling and result metadata with mocked pytest tests.
- [x] 8.3 Discover device jobs from S3 and reconstruct after web restart, retaining Gemini/TTS; verify offline uploads, server restart, browser cursor and legacy browser requests using Playwright.
- [x] 8.4 Update architecture, env/deployment instructions and superseded assumptions; verify strict OpenSpec validation and cross-component protocol fixtures.
- [x] 8.5 Deploy the tested revision on the actual Pi without web configuration, verify its service and hardware, and supply the precise desktop/web redeployment handoff; record which live end-to-end checks still await those hosts.


S3-only Pi deployment evidence: revision d073208 installed on raymond's Pi;
14/14 Pi tests passed on Python 3.13 with system GPIO bindings. User service
`ctrlf-pi.service` is active, enabled, has zero restarts, and lingering is enabled.
Its EnvironmentFile is `/home/raymond/.ctrlf.env`, preserved with a private backup.
The Brio 101 microphone, JPEG capture, GPIO 5 and S3 listing checks passed. A real physical-button test then uploaded Ogg audio and JPEG successfully, with
the ready marker last and an empty local spool. The full spoken response still
awaits the matching desktop/web deployments; task 7.2 stays open.
