# README visuals

These files document SwaraSanti without changing the app.

- `swarasanti-banner.svg`: original imagined dawn over still water in the app's ink, teal, and warm-light palette. Decorative, not a recording or EEG trace.
- `session-curve.svg`: original explanatory diagram derived from `src/audio/presets.ts` and `src/audio/schedule.ts`. It illustrates the 30-minute Meditating audio schedule: `(0, 10)`, `(12, 6)`, `(25, 6)`, `(30, 10)` in minutes and Hz. It is not a recording or a prediction of brain activity.
- `swarasanti-home.jpg`: actual local landing screen with its painted night-lake hero.
- `swarasanti-sessions.jpg`: actual local session-selection screen showing the eight painted goal scenes.
- `swarasanti-session-setup.jpg`: actual local Meditating session setup dialog before playback.

Screenshots were captured from the local application with `npm run dev` in a standalone, signed-out browser session on 2026-09-26. Motion was disabled during capture so every frame is stable. No patient information or fabricated application controls are shown. Images use relative paths so the README works in forks and offline checkouts.

## In-app scene paintings

`public/scenes/` holds ten original paintings created on 2026-09-26 with GPT Image 2.5 Flare (`openrouter/openai/gpt-image-2.5-flare`) through the omp image role: the landing hero, one scene per goal, and the session-complete sunrise, which was edited from the hero so the journey ends at the same lake. Each painting ships as WebP at 768 px (cards; precached for offline use) and 1536 px (hero, banner, player, and completion; cached on first view).

`src/ui/SceneArt.tsx` crops each painting around its light source to fit the frame and pins live layers to the painting's own pixel coordinates: glow, water glints and ripples, light shafts, mist, stars, aurora, and particles. Every layer is a plain HTML element animated only through `transform` and `opacity`, so the GPU compositor runs all motion without main-thread paint; there are no blend modes, filters, or backdrop blur over moving content. Planes shift by depth under a mouse pointer only, since touch input scrolls the page. Animations pause offscreen, while a session is paused, and behind open dialogs; with `prefers-reduced-motion: reduce`, only gentle opacity changes remain. The scenes are imagined places, not measured brain activity or evidence of treatment effects. `public/icon.svg` renders the 192 px and 512 px PWA icons. Audio is synthesized separately in the browser. First-party design references and interpretation: [premium visual research](premium-visual-research.md).
