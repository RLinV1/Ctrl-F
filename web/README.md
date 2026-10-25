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
the webcam mic and arrive automatically regardless of selected input mode. Keep
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
