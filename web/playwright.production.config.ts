import {defineConfig} from "@playwright/test";
import base from "./playwright.config";
const server = Array.isArray(base.webServer) ? base.webServer[0] : base.webServer;
export default defineConfig({...base, webServer:{...server,
  command:"node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3100", reuseExistingServer:false}});
