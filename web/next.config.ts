import { join } from "node:path";
import type { NextConfig } from "next";

// The repo-root .env is the one source of keys; Next only reads env files inside web/. Real env vars win.
// Route workers start without this process's env, so the server's variables are also passed through `env`.
const SERVER_ENV = ["S3_ENDPOINT", "S3_PUBLIC_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "GEMINI_API_KEY", "GEMINI_MODEL", "ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID", "UI_PASSWORD", "PI_JOB_TOKEN"] as const;
// `next dev <dir>` does not change the working directory, so look beside this file first.
for (const dir of [__dirname, process.cwd()]) {
  try {
    process.loadEnvFile(join(dir, "..", ".env"));
    break;
  } catch {
    // not here: try the next candidate; with no root .env, env vars or web/.env.local are used
  }
}

const nextConfig: NextConfig = {
  env: Object.fromEntries(SERVER_ENV.filter((k) => process.env[k]).map((k) => [k, process.env[k]!])),
  devIndicators: false, // the Next.js badge in the corner of the dev server
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
