This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Ctrl-F deployment

Run the web service on its deployment host, with Node compatible with the pinned
Next.js release and pnpm 12.15.0:

```sh
pnpm install --frozen-lockfile
pnpm dev --hostname 0.0.0.0
```

The root `.env` holds `S3_*`, `DATABASE_URL`, `GEMINI_API_KEY`, ElevenLabs keys,
`PI_JOB_TOKEN`, and optional `UI_PASSWORD`. Apply the desktop's DB migrations
before deploying the matching web revision. The browser/Pi do not receive the
Hermes key; the desktop worker alone calls Hermes. Use HTTPS for microphone
access when opening the app from another device.

On the Ask page, web recordings use the browser mic. Pi-button recordings use
the webcam mic and are discovered from S3 ready manifests automatically regardless of selected input mode. Keep
one browser open, click Enable audio, and use Play if autoplay is blocked. Replies
are serialized and automatically played once per job per browser session. The
camera photo for a last-seen answer is the historical photo with its original box.
Unknown confidence is not shown as a percentage. “History unavailable” differs
from a successful lookup saying the item has never been seen.

The existing device discovery endpoint returns the **oldest unpresented** device
job using `since` plus `afterId`, with `{id, createdAt}`; the name `/api/jobs/latest`
is retained for compatibility. The cursor advances by server timestamp/ID, never
client receipt time. In-flight jobs/reply audio still live in web-server memory;
Postgres sightings survive restart.

Mocked browser and external-boundary checks:

```sh
pnpm exec playwright install chromium
pnpm exec playwright test
```

The test server uses port 3100 with paid keys disabled. It uses installed Chrome
when available, otherwise Playwright Chromium. Stop another `next dev` process
in this checkout before running tests. See `docs/DEPLOYMENT.md` at the repo root
for the hardware acceptance checklist.


For the S3-only Pi revision, deploy the matching web code as well as the desktop
worker. Pi requires no web URL or Pi token. The legacy HTTP device intake route
remains for compatibility, but the hardware does not use it. Web needs read/list
access to ready manifests under `incoming/device/` and result objects. A new web
process reconstructs device jobs/transcripts from S3; Gemini narration and
ElevenLabs TTS remain on web. Browser recordings still use web STT and S3 jobs/.
A fresh browser session discovers retained device history; its session cursor
prevents replay in that session. Configure desired private audio/history retention
operationally; this deployment does not delete stored recordings automatically.


Requests accept arbitrary item phrases such as “Where is my bottle?” and mixed
requests such as “bottle and keys”; the known item list is not an allowlist.
Common English find/where requests and direct names support up to eight targets
of 80 characters each. Descriptions are preserved. Deploy matching web/desktop
code; the Pi protocol is unchanged. Rollback: `docs/ROLLBACK.md`.


Conversational requests strip greetings before commands and hesitation pauses
before item splitting. “Yo, where is my, uh, red water bottle and phone?” yields
`red water bottle` and `phone`. Standalone determiners/fillers are not targets,
even if earlier requests added them to the catalog. Explicit lists, descriptors
and meaningful words such as yo-yo or plum remain supported. This is bounded
English command parsing, without an extra AI call. Historical junk rows are not
deleted and existing completed requests are not automatically reprocessed.


Search answers and historical sightings display signed original camera photos
with the selected target circle drawn by the web. Browser/legacy capture sources
are `incoming/<id>.jpg`; S3-only Pi sources are `incoming/device/<id>.jpeg`.
Postgres readers and last-seen evidence use the exact original `s3_key`. Annotated
`results/<id>_result.jpg` files remain completion/debug artifacts and are not the
displayed source. Keep originals private and retained for historical display;
deleted originals cannot be recovered by removing boxes from an annotated JPEG.
No desktop/Pi update or schema migration is required for this display change.


To run the same browser suite against a production build with providers disabled:

```sh
env -u NODE_OPTIONS GEMINI_API_KEY= ELEVENLABS_API_KEY= DATABASE_URL= UI_PASSWORD= PI_JOB_TOKEN=test S3_ENDPOINT=http://127.0.0.1:1 S3_ACCESS_KEY_ID=test S3_SECRET_ACCESS_KEY=test pnpm build
env -u NODE_OPTIONS pnpm exec playwright test --config playwright.production.config.ts
```

The production test configuration reuses the existing mocked browser suite on
port 3100. Restart the normal dev server afterward for real requests.
