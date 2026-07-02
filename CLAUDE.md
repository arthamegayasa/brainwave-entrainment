<!-- GSD:project-start source:PROJECT.md -->
## Project

**Healing Audio PWA**

Aplikasi web (PWA) brainwave entrainment untuk healing, relaksasi, meditasi, tidur, dan fokus — terinspirasi EquiSync Element (EOC Institute), tetapi dengan pendekatan **goal-first, bukan frequency-first**: user memilih tujuan (mis. "Deep Sleep"), bukan angka Hz. Semua audio disintesis real-time via Web Audio API — tanpa file audio sama sekali.

**Core Value:** User bisa menekan satu tombol dan mendapatkan sesi audio entrainment berkualitas (binaural / isochronic / solfeggio / ambient) yang benar-benar menuntun otak secara bertahap (session ramp), tanpa perlu paham frekuensi.

### Constraints

- **Audio engine murni TypeScript tanpa dependency React** — testable, reusable untuk M003 builder.
- iOS background audio terbatas — mitigasi via Media Session API (M002) + guidance ke user.
- Semua konstanta frekuensi preset terpusat di satu file (`presets.ts`).
<!-- GSD:project-end -->

<!-- GSD:stack-start source:STACK.md -->
## Technology Stack

Technology stack not yet documented. Will populate after codebase mapping or first phase.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
