# Deferred Items — quick-260714-a8a

Out-of-scope discoveries logged during execution (NOT fixed per scope boundary).

## Flaky pre-existing test: BuilderEngine multi-layer render

- **Test:** `tests/audio/builder.test.ts > BuilderEngine (BLD-01, BLD-03) > plays multiple layers simultaneously with per-layer methods`
- **Symptom:** Fails intermittently (~50% of runs) with the same code; passes on re-run.
- **Evidence pre-existing:** The test imports only `src/audio/builder.ts`, `src/audio/freqfinder.ts`, `src/state/customPresets.ts`, and `node-web-audio-api` — none touched by quick-260714-a8a (last modified in commit `b98d282`, before this task). Reproduced across 6 consecutive runs at the same working tree: 3 fail / 3 pass.
- **Likely cause:** Timing/amplitude assertion sensitivity in an OfflineAudioContext render (real audio rendering with randomized layer ids).
- **Suggested fix (future):** Loosen the amplitude/zero-crossing assertion tolerance or seed the layer ids; investigate via `/gsd-debug` or `/investigate`.
