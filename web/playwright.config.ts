import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  workers: 2,
  use: { launchOptions: { executablePath: existsSync("/opt/google/chrome/chrome") ? "/opt/google/chrome/chrome" : undefined }, baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } },
  ],
  webServer: {
    command: "node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    timeout: 120_000,
    reuseExistingServer: false,
    env: { UI_PASSWORD: "", GEMINI_API_KEY: "", ELEVENLABS_API_KEY: "", DATABASE_URL: "",
      S3_ENDPOINT: "http://127.0.0.1:1", S3_ACCESS_KEY_ID: "test", S3_SECRET_ACCESS_KEY: "test", PI_JOB_TOKEN: "test" },
  },
});
