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

## Preset Player

- At widths up to 760 px, `.shell-player` owns one `100dvh` viewport with safe-area padding; only its top navigation and footer disappear. The Scene flexes to the space left after the header, 40 px Beat curve, phase, and transport. Desktop retains the usual shell.
- The Player's Ambient, Mixer, and frequency details share the existing `.sheet-backdrop`/`.sheet` bottom-sheet pattern. Frequency values read from Now Playing: Headphones left = Carrier, right = Carrier + live Beat; Speaker tone = Carrier, pulse = live Beat. ⌄ shrinks the Player into the Mini-player.
- Keep screen on is opt-in per mounted Player. The Screen Wake Lock is released on User pause, device hold, hidden page, and Player unmount (including End session); a visible playing page requests it again. Browsers without the API show an unavailable message rather than blocking audio.
- The 6-second controls fade uses wall-clock inactivity only for UI, never for Play duration; the timer remains dimmed. Pausing, a device hold, or keyboard focus restores controls. The ⋯ menu closes on outside tap or after toggling Keep screen on, so it cannot pin the controls awake.

## Mini-player & Back

- **Mini-player** (`src/ui/MiniPlayer.tsx`) renders in the app shell while Now Playing has a Play and the view is neither `player` nor `landing`, at every width, fixed above `env(safe-area-inset-bottom)`. `.shell-mini-player` adds bottom padding so it never covers the footer, and a Dashboard notice rises above it. Its Scene thumbnail is the precached 768 px painting, not an animated `SceneArt`. There is no Stop: ending a Play stays in the Player's ⋯ menu. Until #41 the Player shows Presets only, so a Custom Audio Mini-player opens the Library.
- **Device-held Plays have no banner any more**: the Player and the Mini-player show the pulsing Tap to resume. A Studio preview is not a Play, so the Studio transport shows its own Tap to resume while `isAudioBlocked()`. Landing has neither; Media controls still resume from there.
- **⌄ and Back return to the view the Player was opened from** (`playerFrom` in `App.tsx`): Sessions after Start, or wherever the Mini-player was tapped. The Sessions tab no longer jumps to the running Player; the Mini-player is the way back.
- **Back without a router** (`src/ui/backNavigation.ts`): `useBackLayer(open, close)` pushes one same-URL history entry per open layer (the Player, then its sheet), tagged with its depth. `popstate` closes every layer deeper than the entry it lands on, so Back closes the sheet, then minimizes the Player; Back never stops the Play. A layer closed on screen (⌄, ✕, Escape, End session, natural end, a nav tab) removes its entry with one batched `history.go(-n)`, otherwise the next Back lands on a stale entry and seems to do nothing. The Preset setup sheet, the Account sheet, and every other view keep the browser's Back; the Personal URL `replaceState` only runs before a layer can open.

## Build, PWA & unduhan

- **Code-split**: `React.lazy` untuk export bernama butuh `.then((m) => ({ default: m.X }))`; view di luar jalur pilih-goal-lalu-dengar + encoder lamejs (164.5 kB) dimuat saat dipakai. Chunk utama 554.7 → 338.3 kB (gzip 170 → 98.5). supabase-js masih di chunk utama karena `lib/supabase.ts` membuat client saat module load — memindahkannya butuh API client async di 7 modul `lib/`.
- **PWA service worker menahan shell lama pasca-deploy**: verifikasi live pasca-deploy harus cek hash bundle dari server (curl, tanpa SW) sebelum menyimpulkan dari browser — atau unregister SW + clear caches + reload. User nyata mendapat update setelah reload berikutnya (workbox default).
- **Blob URL download**: `URL.revokeObjectURL` langsung setelah `a.click()` bisa membatalkan unduhan di Safari — tunda (60 s).
