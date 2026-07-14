# Deferred Items — quick-260714-a8a

Out-of-scope discoveries logged during execution (NOT fixed per scope boundary).

## Flaky pre-existing test: BuilderEngine multi-layer render

- **Test:** `tests/audio/builder.test.ts > BuilderEngine (BLD-01, BLD-03) > plays multiple layers simultaneously with per-layer methods`
- **Symptom:** Fails intermittently (~50% of runs) with the same code; passes on re-run.
- **Evidence pre-existing:** The test imports only `src/audio/builder.ts`, `src/audio/freqfinder.ts`, `src/state/customPresets.ts`, and `node-web-audio-api` — none touched by quick-260714-a8a (last modified in commit `b98d282`, before this task). Reproduced across 6 consecutive runs at the same working tree: 3 fail / 3 pass.
- **Likely cause:** Timing/amplitude assertion sensitivity in an OfflineAudioContext render (real audio rendering with randomized layer ids).
- **Suggested fix (future):** Loosen the amplitude/zero-crossing assertion tolerance or seed the layer ids; investigate via `/gsd-debug` or `/investigate`.

## Clinician subscription lapse — auto-demotion (from review finding, 2026-07-14)

Role demotion currently happens on a FAILED clinician order or on paying for premium. If a clinician simply stops paying (subscription lapses with `current_period_end` in the past) and never triggers a failed order, they keep the clinician role + RLS powers indefinitely. Needs a scheduled job (Supabase pg_cron / edge function cron) that demotes role='clinician'→'user' and sets entitlement inactive when current_period_end < now(). Same class of limitation as ADR-009's recurring-renewal note (QRIS/VA/e-wallet have no hands-off renewal). Low urgency for sandbox; required before clinician-tier go-live.
