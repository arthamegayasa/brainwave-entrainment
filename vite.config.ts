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
        // mp3: the recorded ambient loops, so every ambience plays offline.
        globPatterns: ["**/*.{js,css,html,woff,woff2,png,svg,mp3}", "scenes/*-768.webp"],
        runtimeCaching: [
          // Navigations go to the network, so a new tab opens the latest deploy
          // instead of the shell the previous deploy precached (which a
          // cache-first shell would show until the next reload). When the
          // network fails (offline), the precached shell answers every app URL,
          // so the installed PWA still opens a Personal URL (/p/<username>)
          // offline, like the host's rewrite in vercel.json.
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkOnly",
            options: { precacheFallback: { fallbackURL: "index.html" } },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/scenes/"),
            handler: "CacheFirst",
            options: { cacheName: "scene-paintings", expiration: { maxEntries: 24 } },
          },
        ],
        // Both would answer navigations from the precache before the route above:
        // the fallback route for every URL, the directory index for "/".
        navigateFallback: null,
        directoryIndex: null,
      },
    }),
  ],
  test: {
    // node-web-audio-api provides a REAL OfflineAudioContext in Node — no DOM needed.
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
