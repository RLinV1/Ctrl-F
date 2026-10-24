import { defineConfig, devices } from "@playwright/test";
import { TEST_PASSWORD, TEST_PI_TOKEN } from "./e2e/fixtures";

/*
 * Three servers from one build (`pnpm test:e2e` builds first): mock data on 3100,
 * empty mock data on 3101, and the password gate on 3102. External services are
 * never called: DATA_SOURCE=mock, and job states are stubbed with page.route.
 */
const MAIN = 3100;
const EMPTY = 3101;
const LOCKED = 3102;

const server = (port: number, env: Record<string, string>) => ({
  command: `pnpm start -p ${port}`,
  port,
  reuseExistingServer: false,
  timeout: 60_000,
  env: { DATA_SOURCE: "mock", UI_PASSWORD: "", PI_JOB_TOKEN: TEST_PI_TOKEN, ...env },
});

const chrome = {
  ...devices["Desktop Chrome"],
  permissions: ["microphone"],
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
};

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  // Each page animates a full-window canvas (the flow-field background); more parallel
  // browsers than this starve each other and push holds past their timeouts.
  workers: 3,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: { trace: "retain-on-failure" },
  projects: [
    {
      name: "chromium",
      testIgnore: /(empty|access)\.spec\.ts/,
      use: { ...chrome, baseURL: `http://localhost:${MAIN}` },
    },
    {
      name: "reduced-motion",
      testMatch: /ask\.spec\.ts/,
      use: { ...chrome, baseURL: `http://localhost:${MAIN}`, contextOptions: { reducedMotion: "reduce" } },
    },
    { name: "empty", testMatch: /empty\.spec\.ts/, use: { ...chrome, baseURL: `http://localhost:${EMPTY}` } },
    { name: "access", testMatch: /access\.spec\.ts/, use: { ...chrome, baseURL: `http://localhost:${LOCKED}` } },
  ],
  webServer: [
    server(MAIN, {}),
    server(EMPTY, { MOCK_EMPTY: "1" }),
    server(LOCKED, { UI_PASSWORD: TEST_PASSWORD }),
  ],
});
