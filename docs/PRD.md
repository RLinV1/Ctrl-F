# Product Requirements: Ctrl-F

## Problem

People lose small items (keys, wallet, phone, remote, glasses) at home. They retrace steps and waste time. Nothing remembers where an item was last seen, or that the same item keeps getting lost.

## Solution

A camera-equipped Raspberry Pi plus a voice interface. The user asks for an item by voice. The system photographs the scene, finds the item with YOLO, answers by voice, and records the sighting with a snapshot.

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
| F1 | Capture audio from a mic on the Pi (or the desktop) and transcribe it. |
| F2 | Extract the target item name from the transcript with Gemini. Normalize to a canonical item name. |
| F3 | Pi captures a photo on command and transmits it to the desktop. |
| F4 | Desktop runs object detection on the photo and returns all detections (label, confidence, bbox). |
| F5 | Match the target to detections. Support items outside the base YOLO classes (see Risks). |
| F6 | Store the snapshot in object storage and a sighting row in Postgres, for every capture. |
| F7 | Mark an item "lost" when a request finds no match. Increment its lost count. |
| F8 | Generate a short spoken reply (Gemini text, ElevenLabs TTS) with location in the frame and last-seen time. |
| F9 | Web UI lists items, last-seen snapshot with bbox overlay, history, and lost count. |
| F10 | Web UI hosted on Vercel at a custom GoDaddy domain. |

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

- **COCO has no keys, wallet, or earbuds.** Stock YOLO cannot find them. Options: YOLO-World (open-vocabulary), fine-tune on our items, or fall back to Gemini vision. Decision pending; default plan is YOLO-World with Gemini vision fallback.
- **Vercel cannot reach the desktop or Pi.** The desktop must push results to the web API (outbound HTTPS). Do not expose the desktop to the internet.
- **Storage choice.** Managed (Cloudflare R2 or Supabase Storage + Neon/Supabase Postgres) vs self-hosted SeaweedFS. Default: managed. SeaweedFS needs a VPS.
- **Trigger mode.** On-demand capture only (v1) vs periodic background snapshots (builds history without asking). Periodic snapshots make "last seen" much more useful; decide after v1 works.
- **Where audio is captured.** Pi mic vs desktop mic. Pick whichever hardware is available.

## Roadmap

1. M0: Docs and repo scaffold (this).
2. M1: Pi capture -> desktop receive -> YOLO detect -> print result (no voice, no web).
3. M2: Voice in (STT + Gemini parse) and voice out (TTS).
4. M3: Postgres + storage, sighting history, lost counts.
5. M4: Next.js UI, deploy to Vercel, GoDaddy domain.
6. M5: Periodic snapshots, open-vocabulary detection tuning, polish.
