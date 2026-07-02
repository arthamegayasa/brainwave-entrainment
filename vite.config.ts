import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon-192.png", "icon-512.png"],
      manifest: {
        name: "Serenade — Healing Audio",
        short_name: "Serenade",
        description:
          "Guided audio sessions: binaural beats, isochronic tones, solfeggio, and natural ambience for relaxation, sleep, and focus.",
        lang: "en",
        theme_color: "#0b0e17",
        background_color: "#0b0e17",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,woff,woff2,png,svg}"],
      },
    }),
  ],
  test: {
    // node-web-audio-api provides a REAL OfflineAudioContext in Node — no DOM needed.
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
