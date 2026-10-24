import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// /api goes to the Python dev server (python dev-test/server.py), which holds the ElevenLabs key.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": "http://127.0.0.1:8000" } },
});
