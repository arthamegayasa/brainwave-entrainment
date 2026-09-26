# ADR-001: Platform — Web App / PWA (2026-07-02)

**Context:** Pilihan antara PWA, mobile native (React Native/Expo), desktop (Electron/Tauri).
**Decision:** Web app / PWA.
**Rationale:** Web Audio API paling matang di browser; development & distribusi tercepat; installable di desktop & mobile. Trade-off yang diterima: background audio di iOS terbatas (mitigasi: Media Session API + screen-on guidance).
**Status:** Accepted (dipilih user via decision session).
