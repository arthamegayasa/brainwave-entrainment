import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon-192.png", "icon-512.png", "icon.svg"],
      manifest: {
        name: "SwaraSanti — Healing Audio",
        short_name: "SwaraSanti",
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
        // Card-size scene paintings (~220 KB) ship with the app shell; the
        // large ones are cached the first time a banner or player shows them.
        globPatterns: ["**/*.{js,css,html,woff,woff2,png,svg}", "scenes/*-768.webp"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/scenes/"),
            handler: "CacheFirst",
            options: { cacheName: "scene-paintings", expiration: { maxEntries: 24 } },
          },
        ],
        // Every navigation opens the app shell, so the installed PWA serves a
        // Personal URL (/p/<username>) like the host's rewrite in vercel.json.
        navigateFallback: "index.html",
      },
    }),
  ],
  test: {
    // node-web-audio-api provides a REAL OfflineAudioContext in Node — no DOM needed.
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
