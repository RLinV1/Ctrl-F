import { join } from "node:path";
import type { NextConfig } from "next";

// The repo-root .env is the one source of keys; Next only reads env files inside web/. Real env vars win.
// Route workers start without this process's env, so the server's variables are also passed through `env`.
const SERVER_ENV = ["S3_ENDPOINT", "S3_PUBLIC_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "GEMINI_API_KEY", "GEMINI_MODEL", "ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID", "PI_JOB_TOKEN", "UI_PASSWORD"] as const;
// `next dev <dir>` does not change the working directory, so look at the dir argument too.
for (const dir of [...process.argv.slice(2), process.cwd()]) {
  try {
    process.loadEnvFile(join(dir, "..", ".env"));
    break;
  } catch {
    // not here: try the next candidate; with no root .env, env vars or web/.env.local are used
  }
}

const nextConfig: NextConfig = {
  env: Object.fromEntries(SERVER_ENV.filter((k) => process.env[k]).map((k) => [k, process.env[k]!])),
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
