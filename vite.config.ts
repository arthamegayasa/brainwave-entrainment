import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // node-web-audio-api provides a REAL OfflineAudioContext in Node — no DOM needed.
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
