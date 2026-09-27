# Frontend

Gotcha React, CSS, dan PWA di `src/ui/` dan `src/state/`.

## State & sinkronisasi

- **Dua permukaan UI yang memutasi data yang sama** (Account sheet vs Library untuk koneksi klinisi): sheet overlay tidak meng-unmount view di bawahnya — sinkronkan via `window.dispatchEvent(new Event("serenade:clinician-changed"))` + listener yang mem-bump dependency effect. Pola ringan tanpa store global. Contoh ini sudah tidak ada sejak #9: Patient tidak lagi memutus Link sendiri, dan Clinician-nya kini dibaca `useEntitlement` (`link`).

## Laporan Listening History

- **Zona waktu laporan = zona Play terbaru**, bukan zona perangkat viewer; zona yang tidak dikenal browser dilewati. Label WIB/WITA/WIT dari tabel tetap, zona lain memakai nama pendek Intl (mis. `GMT+9`).
- **Chromium en-GB menulis September sebagai "Sept"** (ICU baru), bukan "Sep" seperti di prototype.
- **Level heading laporan mengikuti tempatnya**: `headingLevel` 4 di Account (di bawah `h3` "Your listening"), 5 di Dashboard (di bawah `h4` "Listening history" dari `.detail-block`). Gaya judul kartu disatukan lewat `.lr .lr-card-title`, jadi `.detail-block h4` tidak mengenainya.
- **Laporan yang terbuka memuat ulang sendiri**: setiap 5 menit dan saat tab kembali terlihat (aturan state berbasis waktu di `CODING_STANDARDS.md`), sehingga "hari ini" berganti lewat tengah malam; reload yang gagal mempertahankan laporan yang sudah tampil.

## CSS

- **CSS grid `1fr` = `minmax(auto, 1fr)`**: min-content kartu berharga panjang memeras kolom lain. Kolom sama rata butuh `minmax(0, 1fr)` — dan konten yang tadinya "mendorong" kolom (harga coret + harga) harus bisa wrap, kalau tidak ia meluber.
- **Container query tidak bisa menata container-nya sendiri**: `@container` hanya berlaku untuk turunan. Prototype menaruh `--lh-a-cell-h` di `.lh-a` (container itu sendiri) di dalam query, sehingga tidak pernah berlaku. Di `.lr` variabel tinggi sel heatmap ditaruh di `.lr-heat` (turunan).
- **Card rows di container query**: `.roster-table td { display: block }` (0,1,1) mengalahkan `.roster-c-plays { display: none }` (0,1,0) di query yang sama — sembunyikan kolom dengan `.roster-table .roster-c-…`. Prototype punya bug yang sama.
- **Drawer di atas notifikasi**: drawer di-portal ke `#root` (z-index 90 di stacking context `#root`), jadi notifikasi Dashboard (`.dash-notice`, fixed, z 95) tetap terlihat saat drawer terbuka.

## Setup sheets

- **The Preset setup sheet fits 390×844 without scrolling**: durations on the segmented `DurationRow` (shared with the Library's duration sheet; buttons show `15`…`∞`, accessible names stay `15 min`…`∞`), Listening mode cards that keep name and sentence on one line down to 360 px (longer sentences wrap under the name, so keep them short), and Ambient as icons with the chosen name beside the field label (`src/ui/ambients.ts`, whose names the Player's Ambient sheet shows as chips). `.setup-sheet` is a flex column: only `.setup-body` scrolls, on screens too short for it, and `.setup-foot` (Start, the Download MP3 link, Cancel) stays at the bottom above `env(safe-area-inset-bottom)`.

## Player

- At widths up to 760 px, `.shell-player` owns one `100dvh` viewport with safe-area padding; only its top navigation and footer disappear. The Scene flexes to the space left after the header, 40 px Beat curve, phase, and transport. Desktop retains the usual shell.
- The Player's Ambient, Mixer, and frequency details share the existing `.sheet-backdrop`/`.sheet` bottom-sheet pattern. Frequency values read from Now Playing: Headphones left = Carrier, right = Carrier + live Beat; Speaker tone = Carrier, pulse = live Beat. ⌄ shrinks the Player into the Mini-player.
- **Custom Audio in the Player**: Library Play (Custom Audio or a saved Studio session) opens a duration-only sheet (default: the last length used, Preset or not, from `lastDurationMin` in prefs; Start saves it back), then the same Player. Ambient and Mixer are hidden: the Studio designer fixed both. Frequency details show one group per entrainment layer, by type (binaural per ear, isochronic tone and pulse, monaural both tones), numbered when a type repeats, with the layer's fixed Beat or the live ramp Beat; a Preset's Headphones mode renders as binaural and Speaker as isochronic through the same `BeatValues`. The emblem reads Headphones when any layer is binaural.
- **Where a Play returns** (`chosenIn` in `App.tsx`): a natural end, or a stop while the Player shows, goes to where the Play was chosen: Sessions for a Preset, the Library for Custom Audio and saved sessions, with the completion card there when Now Playing credited it. The desktop nav marks the same tab while the Player shows. A stop elsewhere (another Play taking over, deleting the playing saved session, Media controls Stop while minimized) still credits the streak but changes no view. The playing Library row shows "Playing" and opens the Player; it has no Stop and never restarts the Play.
- Keep screen on is opt-in per mounted Player. The Screen Wake Lock is released on User pause, device hold, hidden page, and Player unmount (including End session); a visible playing page requests it again. Browsers without the API show an unavailable message rather than blocking audio.
- The 6-second controls fade uses wall-clock inactivity only for UI, never for Play duration; the timer remains dimmed. Pausing, a device hold, or keyboard focus restores controls. The ⋯ menu closes on outside tap or after toggling Keep screen on, so it cannot pin the controls awake.

## Mini-player & Back

- **Mini-player** (`src/ui/MiniPlayer.tsx`) renders in the app shell while Now Playing has a Play and the view is neither `player` nor `landing`, at every width, fixed above `env(safe-area-inset-bottom)`. `.shell-mini-player` adds `--mini-player-clearance` to the shell's bottom padding so it never covers the footer, and a Dashboard notice rises by the same amount. Its Scene thumbnail is the precached 768 px painting, not an animated `SceneArt`. There is no Stop: ending a Play stays in the Player's ⋯ menu. Tapping it opens the Player for Presets and Custom Audio alike.
- **Device-held Plays have no banner any more**: the Player and the Mini-player share `PlayToggle` (`Player.tsx`), which pulses a visible "Tap to resume" while the device holds the audio. A Studio preview is not a Play, so the Studio transport shows its own Tap to resume while `isAudioBlocked()`. Landing has neither; Media controls still resume from there.
- **⌄ and Back return to the view the Player was opened from** (`playerFrom` in `App.tsx`): Sessions after a Preset Start, the Library after a Custom Audio Start or a tap on its Playing row, or wherever the Mini-player was tapped. The Sessions tab no longer jumps to the running Player; the Mini-player is the way back.
- **Back without a router** (`src/ui/backNavigation.ts`): `useBackLayer(open, close)` pushes one same-URL history entry per open layer (the Player, then its sheet), tagged with its depth. `popstate` closes every layer deeper than the entry it lands on, so Back closes the sheet, then minimizes the Player; Back never stops the Play. A layer closed on screen (⌄, ✕, Escape, End session, natural end, a nav tab) removes its entry with one batched `history.go(-n)`, otherwise the next Back lands on a stale entry and seems to do nothing. Two more ways to land on a stale entry: `history.state` survives a reload or tab restore, so tags carry the page load's `performance.timeOrigin` and older ones count as depth 0; and Forward onto a closed layer's entry steps straight back off it. The Preset setup sheet, the Library duration sheet, the Account sheet, and every other view keep the browser's Back; the Personal URL `replaceState` only runs before a layer can open.

## Build, PWA & unduhan

- **Code-split**: `React.lazy` untuk export bernama butuh `.then((m) => ({ default: m.X }))`; view di luar jalur pilih-goal-lalu-dengar + encoder lamejs (164.5 kB) dimuat saat dipakai. Chunk utama 554.7 → 338.3 kB (gzip 170 → 98.5). supabase-js masih di chunk utama karena `lib/supabase.ts` membuat client saat module load — memindahkannya butuh API client async di 7 modul `lib/`.
- **The `index-*.js` size in the build log is not the startup payload**: chunks the entry imports statically (the `useEntitlement` chunk with supabase-js, `builder`) are `modulepreload`ed alongside it, and Rolldown can merge them into `index` when the import graph changes. #42 grew `index` from 246 to 363 kB by sharing `DurationRow` with the Library, while `useEntitlement` (109 kB) and `builder` (9 kB) disappeared: startup JS went from 372 to 371 kB with two fewer requests. Compare `index` plus the preloaded chunks in `dist/index.html`.
- **PWA service worker menahan shell lama pasca-deploy**: verifikasi live pasca-deploy harus cek hash bundle dari server (curl, tanpa SW) sebelum menyimpulkan dari browser — atau unregister SW + clear caches + reload. User nyata mendapat update setelah reload berikutnya (workbox default).
- **Blob URL download**: `URL.revokeObjectURL` langsung setelah `a.click()` bisa membatalkan unduhan di Safari — tunda (60 s).
