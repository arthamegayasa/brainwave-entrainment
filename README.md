<p align="center">
  <img src="docs/images/serenade-banner.svg" alt="Serenade — an audio instrument for quiet moments, with layered mint and lavender waveforms" width="100%" />
</p>

<p align="center">
  <a href="https://github.com/arthamegayasa/brainwave-entrainment/actions/workflows/checks.yml"><img src="https://github.com/arthamegayasa/brainwave-entrainment/actions/workflows/checks.yml/badge.svg?branch=main" alt="Tests and production build status" /></a>
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript 5.9" />
  <img src="https://img.shields.io/badge/Audio-Web_Audio_API-56CBB4?style=flat-square" alt="Web Audio API" />
  <img src="https://img.shields.io/badge/App-Installable_PWA-B7A4F5?style=flat-square" alt="Installable progressive web app" />
</p>

<p align="center">
  <a href="#get-started">Get started</a> ·
  <a href="#a-look-inside">Screenshots</a> ·
  <a href="#how-a-session-works">How it works</a> ·
  <a href="#development">Development</a> ·
  <a href="#science-and-scope">Science & scope</a>
</p>

# Serenade · Brainwave Entrainment

**Choose a listening goal. Shape the sound. Make room for a quieter moment.**

Serenade is a browser-based audio application for relaxation, meditation, sleep routines, and focused listening. It synthesizes its sound in real time: binaural beats, isochronic and monaural beats, pure tones, and nature-inspired ambience. A session can change gradually along a frequency curve instead of repeating a static tone.

The everyday experience starts with eight presets. An advanced Studio adds layered sound design, while an optional backend supports accounts, a clinician audio library, and payment integration.

> Serenade is an audio and relaxation tool, not a medical device. Session names describe listening intentions; they are not promises of clinical benefit.

## A look inside

<p align="center">
  <img src="docs/images/serenade-home.jpg" alt="Actual Serenade home screen with a dark interface, mint accents, and Start a Free Session button" width="100%" />
</p>

<details>
<summary><strong>Explore the session library and listening controls</strong></summary>

Eight goals provide a starting point, from Sleeping and Meditating to Focus & Concentration and Creative Flow.

![Actual Serenade session library showing all eight goal cards and the listening journey](docs/images/serenade-sessions.jpg)

Choose a duration, headphones or speakers, and a synthesized ambient layer before starting.

![Actual Meditating setup dialog with duration, headphone or speaker mode, and ambient choices](docs/images/serenade-session-setup.jpg)

</details>

*Screenshots show the current local app in standalone mode. See [image notes](docs/images/README.md) for capture details.*

## What you can do

| Experience | What's implemented |
| --- | --- |
| **Start with a goal** | Eight presets, goal preferences, time-aware recommendations, and a local listening journey. |
| **Choose how to listen** | Binaural headphone mode or isochronic speaker mode; 15, 30, 45, 60 minutes, or an open-ended session. |
| **Blend the atmosphere** | Synthesized rain, ocean, wind, and brown noise with adjustable playback controls. |
| **Follow the session** | A live curve visualization, optional frequency details, smooth gain changes, pause/resume (also from the lock screen), and an end-of-session view. |
| **Design custom audio** | Studio layers for binaural, isochronic, monaural, pure tone, and ambience; per-layer gains, custom curves, harmonic frequency suggestions, and JSON import/export. |
| **Curate an audio library** | With a configured backend and clinician/admin role: an Audio Bank, reusable templates, Patient accounts you create (with Premium switched on per Patient), and individual audio assignments. |
| **Export a session** | Any timed preset (with your chosen listening mode, ambience, and mixer volumes) and Audio Bank entries render locally to 320 kbps MP3 files, with progress shown in the interface. An MP3 plays in any music app, including with the screen locked. |
| **Install the app** | A production PWA build caches the app shell and assets. Core synthesized listening can work offline after the app has loaded and been cached. |

**Access in this build:** preset and duration feature gates are currently unlocked by `ALL_UNLOCKED` in [`src/state/tier.ts`](src/state/tier.ts). Studio and Dashboard still have a separate clinician/admin role gate. Backend account, library, and payment operations need a network connection and their own configuration.

## Get started

Use **Node.js 22.12 or newer**, npm, and a browser with Web Audio support. The documented commands were checked with Node 24.19 and npm 11.17.

```bash
git clone https://github.com/arthamegayasa/brainwave-entrainment.git
cd brainwave-entrainment
npm ci
npm run dev
```

Open the local URL printed by Vite, normally **http://localhost:5173**. No API key, account, or backend is required for standalone preset listening.

1. Choose **Start a Free Session** and optionally personalize your goals.
2. Select a preset and session duration.
3. Choose **Headphones** for separate left/right binaural tones or **Speaker** for isochronic pulses.
4. Pick an ambience and press **Start Session**. Keep the volume comfortable.

<details>
<summary><strong>Preview the Studio without a backend</strong></summary>

The app includes a local development role override. In the browser console on your local app, run:

```js
localStorage.setItem("serenade.role.override", "clinician");
location.reload();
```

Studio becomes available for local sound design. Dashboard data, cloud publishing, patient assignments, and the Audio Bank require a configured backend; the override does not create those resources.

To return to the normal listener view:

```js
localStorage.removeItem("serenade.role.override");
location.reload();
```

The override is ignored when Supabase is configured. Connected deployments use the server profile and database access policies.

</details>

## How a session works

The session engine schedules **generated audio frequencies** against the audio clock. It does not measure EEG or verify a listener's brain state.

![Illustration of the Meditating preset: a 30-minute audio schedule moves from 10 Hz to 6 Hz, holds, then returns to 10 Hz; synthesis stays in the browser](docs/images/session-curve.svg)

The illustration follows the current scheduler for a 30-minute **Meditating** session: a 12-minute opening ramp, a hold until minute 25, then a five-minute closing ramp. For short sessions, the scheduler caps opening and closing ramps at 40% and 20% of the selected duration. Sleeping has no closing frequency rise; open-ended sessions ramp to their target and hold until stopped.

| Sound layer | How the engine creates it |
| --- | --- |
| **Binaural** | Two tones are routed separately to the left and right channels. Their frequency difference defines the beat setting; headphones preserve the separation. |
| **Isochronic** | A tone is rhythmically amplitude-modulated, producing audible pulses. |
| **Monaural** | Two tones are mixed before output, creating a physical beat pattern. Available in Studio. |
| **Pure tone / solfeggio** | A single oscillator adds a chosen pitch or carrier. These are sound-design choices, not validated treatment frequencies. |
| **Ambience** | Noise synthesis and filtering create rain, ocean, wind, and brown-noise textures without streaming recordings. |

Gain ramps reduce abrupt clicks. The engines include a compressor/limiter, but device volume still determines listening loudness. Long MP3 exports render audio in memory and can be demanding on mobile devices.

## Architecture

```mermaid
flowchart LR
    A[React interface] --> B[SessionEngine / BuilderEngine]
    B --> C[Frequency schedule + sound layers]
    C --> D[Web Audio output]
    B --> E[Offline render + MP3 encoding]
    A --> F[Local preferences and progress]
    A -. optional .-> G[Supabase accounts and audio library]
    G -. checkout .-> H[Midtrans integration]
```

The audio engine is plain TypeScript, independent of React. Preset definitions live in one place, and both the preset player and Studio reuse the scheduling and sound-layer modules.

```text
src/
  audio/                 Audio engine, presets, curves, layers, MP3 export
    layers/              Binaural, isochronic, monaural, pure tone, ambience
  state/                 Local preferences, progress, custom sessions, tiers, Listening core
  ui/                    Home, Player, Studio, Library, Dashboard, Science
  lib/                   Optional accounts, roles, library, payment clients
tests/                   Audio render assertions and state tests
supabase/
  migrations/            Account, library, role, and clinician data schemas
  functions/             Payment and account Edge Functions
    _shared/             Account rules shared by the app and the functions
    _server/             Request helpers for the account functions (Deno only)
  tests/database/        pgTAP tests of the database access rules
  config.toml            Local Supabase CLI stack
docs/
  images/                Original diagrams and real product screenshots
  payments/              Integration design and historical sandbox notes
```

## Optional connected features

Standalone listening is the easiest starting point. To work on accounts, clinician workflows, or payments, use your own Supabase project and configure a local environment file:

```bash
cp .env.example .env.local
```

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | URL for your Supabase project. |
| `VITE_SUPABASE_ANON_KEY` | Browser-safe publishable/anonymous client key for that project. |
| `VITE_MIDTRANS_CLIENT_KEY` | Midtrans browser client key for checkout. Needed when testing payments. |

Frontend `VITE_*` values are included in the browser bundle. Server credentials belong in the backend, never in these variables or in Git.

The connected system also needs the schemas in [`supabase/migrations`](supabase/migrations), appropriate roles and access policies, Auth redirect settings, and the Edge Functions in [`supabase/functions`](supabase/functions): checkout and the payment webhook, plus `create-patient`, `suggest-username`, `change-username`, `resolve-login` and `personal-url` for Clinician-created Patient accounts that sign in with a Username and password, from the homepage or their Personal URL `/p/<username>` ([ADR-016](DECISIONS.md), [ADR-018](DECISIONS.md)). After a Username change the old Personal URL redirects to the new one until another Patient claims the old Username, which nobody else can do for 30 days. Every Patient password is also kept as an encrypted copy that their Clinician and the Admin can reveal, with every reveal logged ([ADR-015](DECISIONS.md)): `reveal-password`, `reset-password` and `change-password` (the Patient's own change in Account) use the [password copy key](#password-copy-key), and `password-access-log` lets the Admin read the log. A Link lasts until the Clinician (or the Admin) ends it with `disconnect-patient`; the Patient cannot, and keeps signing in with their Username and password afterwards. Each Link carries a Premium grant, on by default, that `set-premium-grant` switches ([ADR-014](DECISIONS.md)). Environment variables alone do not provision these services. Locally, `npx supabase functions serve` runs them against the local stack.

Signed-in Users also build a Listening History on the server ([ADR-017](DECISIONS.md)). Every Play of 30 seconds or more, of a Preset or of Custom Audio or a saved session in the Library (never a Studio preview), and every MP3 Download goes to the `plays` and `downloads` tables. The app inserts them itself under row-level security, without an Edge Function. Plays made offline wait in a queue on the device and are sent when the app starts, comes back online, or becomes visible again. Their ids are generated on the device, so a re-send never makes a second row. Signed-out listening stays on the device.

The app reads that history back as a report: "Your listening" in Account for every signed-in User, and each Patient's report in the Dashboard patient detail. It shows listening time and Plays with a trend against the previous period, the streak, the most played audio, a days × hours heatmap, per-audio bars and the Play log with Downloads, for the last 7 or 30 days. Days and times are counted in the Patient's most recent time zone (that of their latest Play) and labelled WIB, WITA or WIT. Row-level security decides whose history a viewer can read, as for inserts.

Read the [payment architecture](docs/payments/PAYMENTS-ARCHITECTURE.md) before changing checkout. The [sandbox notes](docs/payments/SANDBOX-SETUP.md) describe an earlier configured environment; substitute your own project and verify its current settings. They are not evidence of a working payment deployment for a fresh clone. Preset feature gating still needs integration with server entitlements before it can be treated as a production paywall.

### Password copy key

Password copies are encrypted with AES-256-GCM under `PASSWORD_COPY_KEY`, a function secret: 32 random bytes, base64-encoded. It lives only in the Edge Functions' environment. Never put it in a `VITE_*` variable, the database or Git. Without it, creating a Patient and revealing, resetting or changing a password fail.

Locally, `npx supabase functions serve` reads `supabase/functions/.env`, which is git-ignored. Create it once with a fresh key:

```bash
node -e "require('fs').writeFileSync('supabase/functions/.env', 'PASSWORD_COPY_KEY=' + require('crypto').randomBytes(32).toString('base64') + '\n')"
npx supabase functions serve
```

In production, use a separate key. Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`, keep it in your password manager, and set it as a project secret, either with `npx supabase secrets set PASSWORD_COPY_KEY=<key>` or in the Supabase dashboard under Edge Functions → Secrets, before deploying the functions. Copies made under one key cannot be read under another: if the key is lost or replaced, reveals fail until each password is reset.

## Development

| Command | Purpose |
| --- | --- |
| `npm ci` | Install the committed dependency versions. |
| `npm run dev` | Run the Vite development server. |
| `npm test` | Run Vitest, including real offline audio rendering with `node-web-audio-api`. |
| `npm run build` | Type-check, build the app, and generate the PWA service worker. |
| `npm run preview` | Serve the production build locally. |
| `npm run test:e2e` | Build, then run the Playwright end-to-end suite against `vite preview` (first run: `npx playwright install chromium`). |
| `npx supabase test db` | Run the pgTAP database access-rule tests against the local Supabase stack (see [Database access rules](#database-access-rules)). |

The unit suite checks rendered signals, pulse counts, fades, scheduling, layer behavior, sample-rate-independent ambience, preset and Audio Bank MP3 export, imported-session validation, the Play recorder, offline queue and report aggregations of the Listening core (across WIB and WITA and across midnight), and local state. The end-to-end suite drives the production build in Chromium: start, pause, resume, and end a session; device interruptions with and without a required tap; a full 15-minute preset MP3 download; the Premium plan layout at phone, tablet, and desktop widths; and a Personal URL deep link. At the documentation refresh, **235 unit tests across 21 files** and **9 end-to-end tests** passed, and the production build completed.

For contributions, keep audio logic in `src/audio`, keep preset constants centralized, and include a focused test for behavior changes. Run the test suite and production build before opening a pull request. Implementation decisions and gotchas are recorded in [DECISIONS.md](DECISIONS.md) and [KNOWLEDGE.md](KNOWLEDGE.md).

**Platform notes**

- Playback begins from a user gesture because browsers restrict autoplay.
- Preset sessions and custom audio share one `AudioContext` ([`src/ui/audioContext.ts`](src/ui/audioContext.ts)). On Safari 16.4+ it declares a `playback` audio session, so iPhone audio still plays when the ring/silent switch is on; starting a session then pauses other apps' music, as native audio apps do.
- Ambient noise is synthesized with sample-rate-independent constants, so the same ambience has the same level and tone at 22.05, 44.1, 48, 96, or 192 kHz.
- If the device pauses audio mid-session (call, alarm, another app), the session holds its place on the audio clock. Serenade retries automatically and shows **Resume audio** when the browser requires a tap.
- PWA installation and offline caching should be checked using the production build served over HTTPS or localhost. Backend operations remain online features.
- Personal URLs (`/p/<username>`) are the app's only path-based entry; every other view is in-app state. The host must serve `index.html` for `/p/*` (the rewrite in [`vercel.json`](vercel.json) does this on Vercel), and the service worker answers every navigation with the app shell, so an installed PWA opens them too.
- Mobile operating systems may suspend browser audio in the background. Media Session controls improve integration but do not guarantee uninterrupted playback on iOS.
- There is no dedicated lint command in the current package scripts. The build includes TypeScript checking.

### Database access rules

The pgTAP suite in [`supabase/tests/database`](supabase/tests/database) checks who can read what in the database: for example, that a Clinician never sees another Clinician's Links or Patients. It runs against a local Supabase stack built from [`supabase/migrations`](supabase/migrations), never against a hosted project. It needs Docker; the Supabase CLI runs through `npx`.

```bash
npx supabase db start   # local Postgres with every migration applied
npx supabase test db    # run the suite
npx supabase stop       # stop the stack (add --no-backup to discard its data)
```

Pass a file to run just that test, for example `npx supabase test db supabase/tests/database/anon_access.test.sql`. After changing a migration, `npx supabase db reset` rebuilds the local database from scratch. CI runs the same start and test steps in its own `database` job, which fails on any failing test. CI pins the CLI version with `SUPABASE_CLI` in [`checks.yml`](.github/workflows/checks.yml); run `npx` with that same package spec, for example `npx supabase@2.118.0 test db`, to reproduce a CI result exactly.

Each test file runs in one transaction that ends in `rollback`, so files are independent. A file starts with `begin;` and `\ir fixtures.psql`, which adds these helpers for that transaction. Users and Custom Audio are referred to by a label that is unique within the file (a fixture label only, not a Username):

| Helper | Purpose |
| --- | --- |
| `tests.create_user(label, role)` | Create a User (`auth.users` row and profile). Role `user` (default), `clinician`, or `admin`. |
| `tests.link(clinician, patient)` | Create the Link between a Clinician and a Patient. |
| `tests.create_custom_audio(label, owner, is_template)` | Create Custom Audio created by the User `owner`; `is_template` `true` makes it a Template (default `false`). |
| `tests.assign(audio, user)` | Create the Assignment of that Custom Audio to that User. |
| `tests.act_as(label)` | Continue as that signed-in User: the `authenticated` role with their JWT claims. |
| `tests.act_as_anon()` | Continue as a signed-out visitor (`anon`). `reset role` returns to the database owner. |
| `tests.act_as_service_role()` | Continue as the server functions do (`service_role`). |
| `tests.user_id(label)` | The User's id, for expected results. An unknown label raises an error. |
| `tests.custom_audio_id(label)` | The Custom Audio's id, for expected results. An unknown label raises an error. |

Keep new test files in `supabase/tests/database`, next to the fixture.

## Science and scope

Serenade exposes how its sound is constructed and includes a [Science page](src/ui/Science.tsx) with supporting and conflicting research. Evidence for a reliable binaural-beat brainwave entrainment effect remains inconsistent; a systematic review of 14 EEG studies reported mixed findings and substantial methodological differences. [Ingendoh, Posny & Heine, PLOS ONE (2023)](https://doi.org/10.1371/journal.pone.0286023).

Specific solfeggio pitches and session names should be understood as listening preferences and design labels. This repository does not establish that those frequencies diagnose, treat, or prevent a health condition.

---

Created by [Nyoman Artha Megayasa](https://github.com/arthamegayasa). A license has not yet been selected for this repository.
