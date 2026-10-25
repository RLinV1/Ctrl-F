# Product Requirements: Ctrl-F

## Problem

People lose small items (keys, wallet, phone, remote, glasses) at home. They retrace steps and waste time. Nothing remembers where an item was last seen, or that the same item keeps getting lost.

## Solution

A camera-equipped Raspberry Pi plus a voice interface. The user asks for an item by voice. The system photographs the scene, finds the item through Hermes image analysis, answers by voice, and records the sighting with a snapshot.

## Users

- Primary: a person at home or in a small workspace who loses everyday items.
- Secondary (demo/hackathon judges): need a clear, working voice -> vision -> answer loop.

## Goals

- G1: Voice request to spoken answer in under ~10 seconds.
- G2: Locate a requested item in a fresh photo when it is visible.
- G3: Persist every sighting with a snapshot so "last seen" works even when the item is not visible now.
- G4: Remember loss frequency per item.

## Non-goals (v1)

- Multi-room or multi-camera tracking.
- Mobile app (web UI only).
- Real-time video tracking (single photo per request).
- User accounts and multi-tenant support (single household).

## User stories

1. As a user, I say "find my keys" and hear where they are in the photo (e.g. "on the desk, left of the laptop").
2. As a user, if the keys are not visible now, I hear when and where they were last seen, with the snapshot shown on the web UI.
3. As a user, I can browse snapshots and the sighting history per item on the web UI.
4. As a user, I see which items I lose most often.

## Functional requirements

| ID | Requirement |
| --- | --- |
| F1 | Record browser audio for web requests or Logitech webcam audio for Pi-button requests; transcribe with ElevenLabs on web for browser audio and desktop for Pi audio. |
| F2 | Normalize the transcript to canonical tracked item names and aliases before image analysis, retaining the current target picker. |
| F3 | Pi captures a photo on command and transmits it to the desktop. |
| F4 | The processing worker calls Hermes to identify all visible tracked objects, with validated boxes, grounded location descriptions and optional confidence. |
| F5 | Match targets to validated observations independently of YOLO classes, and retrieve prior Postgres sightings when absent. |
| F6 | Store each search snapshot privately and persist all visible tracked-object sightings in Postgres, including incidental objects. |
| F7 | Increment a tracked target's lost count once when successful analysis finds no match; preserve last-seen location and do not count processing failures as losses. |
| F8 | Generate a short spoken reply (Gemini as a witty steampunk narrator, ElevenLabs TTS) with current location or last-seen location/time, played through the open browser for either trigger. |
| F9 | Web UI lists items, marked current or last-seen snapshots, location/time, history, and lost count, distinguishing unavailable history from never seen. |
| F10 | Web UI hosted on Vercel at a custom GoDaddy domain. Deferred: v1 runs locally with Docker Compose. See `docs/TECH_STACK_LIVE.md`. |

## Theme

Steampunk. Brass, copper, aged paper, gears, gauges, Victorian type. It applies to the web UI and to the narrator voice (Gemini replies in a witty steampunk persona). UI work must follow this theme and still meet accessibility contrast.

## Non-functional requirements

- Latency: p50 end-to-end under 10 s on a local network.
- Privacy: images stay in our own storage bucket. Never public. Use signed URLs.
- Reliability: if the Pi or desktop is offline, the UI still shows history and says the camera is offline.
- Secrets: API keys only in env vars. Never committed.

## Success metrics

- Detection hit rate on a set of 10 test items placed in view: target >= 80%.
- End-to-end latency p50 < 10 s.
- A full demo run (voice in, voice out, snapshot saved, UI updated) works without manual steps.

## Risks and open questions

- **Small-object grounding.** The active runtime uses a vision-capable Hermes Agent, with all observed tracked objects persisted in Postgres. Evaluate keys/wallet localization on real Pi photos; a valid response alone does not establish accuracy. Training utilities remain optional historical tools.
- **Vercel cannot reach the desktop or Pi.** The Pi polls the web API for jobs (outbound only) and forwards photos to the desktop on the LAN. Do not expose the desktop or Pi to the internet.
- **Storage choice.** Managed (Cloudflare R2 or Supabase Storage + Neon/Supabase Postgres) vs self-hosted SeaweedFS. Default: managed. SeaweedFS needs a VPS.
- **Trigger mode.** On-demand capture only (v1) vs periodic background snapshots (builds history without asking). Periodic snapshots make "last seen" much more useful; decide after v1 works.
- **Audio.** Decided: web requests use the browser mic; physical-button requests use the Logitech webcam mic. Both replies play through the single open browser. Wake word is out of scope.
- **Pi as relay.** The Pi claims jobs by polling the web API (outbound) and forwards photos to the desktop on the LAN. Open: Pi and desktop must share a network (or use Tailscale).

## Roadmap

1. M0: Docs and repo scaffold (this).
2. M1: Pi capture -> desktop receive -> YOLO detect -> print result (no voice, no web).
3. M2: Voice in (STT, target to YOLO) and voice out (Gemini narrator + TTS).
4. M3: Postgres + storage, sighting history, lost counts.
5. M4: Next.js UI running locally via Docker Compose. Deploy to Vercel and the GoDaddy domain after that (see `docs/TECH_STACK_LIVE.md`).
6. M5: Periodic snapshots, open-vocabulary detection tuning, polish.

## Current transition

`replace-yolo-with-hermes` supersedes the YOLO portions of the original roadmap.
The active dev transport is the outbound S3 job relay described in ARCHITECTURE.md.
Deployment and physical acceptance run on the actual service hosts; see DEPLOYMENT.md.
