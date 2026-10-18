# AGENTS.md: how to work on Mutation Garden

Mutation Garden is a mobile-first 3D gardening game in the browser: plant, grow, harvest, discover mutations. Three.js, Rapier, TypeScript, Vite.

**Guiding principle: make the smallest possible garden irresistibly fun before making the garden bigger.** A living toy first, a rewarding game second, a deep collection system third. (Brief section 18.)

## Read these first

| File | What it is |
|---|---|
| `docs/brief.md` | The game design brief, verbatim. The source of truth for what the game is. |
| `docs/architecture.md` | Module boundaries, deterministic sim, fixed timestep, saves, offline growth |
| `docs/milestones/` | M1–M5 scope and acceptance criteria. M1 has ordered tasks. |
| `docs/art/style-guide.md` | **Binding** art source of truth (Seed Packet direction) |
| `docs/art/palette.json` | **Binding** colours. Generated into `src/render/palette.ts`. |
| `docs/art/prototype/` | The visual reference: a throwaway three.js sketch and its screenshots. Not game code. |
| `docs/decisions/` | ADRs. Use `0000-template.md` for new ones. |

## Team and workflow

Codex works as a small team. Role files live in `.codex/agents/`; models are set there.

| Role | Agent | Model | Does |
|---|---|---|---|
| Orchestrator | main session | Sol 6.1 (`gpt-6.1-sol`) | Runs the loop below, keeps the milestone on track |
| Architect | `architect` | Sol 6.1 (`gpt-6.1-sol`) | Plans tasks, owns architecture and ADRs, advises |
| Implementer | `implementer` | Luna 6 (`gpt-6-luna`) | Builds one small task with its tests. Does most of the work. |
| Test writer | `test_writer` | Luna 6 (`gpt-6-luna`) | Unit, property, fixture and Playwright tests; fixes flakes |
| Reviewer | `reviewer` | Sol 6.1 (`gpt-6.1-sol`) | Reviews every diff before it is done. Read-only. |
| Art advisor | `art_advisor` | Sol 6.1 (`gpt-6.1-sol`) | Reviews every visual change against the style guide. Read-only. |

Use one architect pass per milestone and revisit architecture only when a task changes an interface. The default is one PR per M1 task; split only when the task is expected to exceed about 400 changed lines or crosses two modules. Use an implementer for code and a test writer when the test work is substantial. Keep only one implementer per module active at a time.

Run `npm run check` locally before opening or updating a PR. The reviewer reviews every PR: medium effort for render-only or test-only changes, high effort for sim, save or input changes. The art advisor reviews only changes that alter what players see. Put required screenshots in the PR body; commit only the final art-approved shot for each visual milestone. Fix review findings, wait for first-run green CI with zero retries, then squash-merge and update M1.md.

Use fresh subagent contexts so each role's model and instructions apply. Before ending a work session, add a short stopping-point note at the top of the active milestone file with what is done, what is in flight and the next task.

### Milestone critique gate

Before starting the next milestone, finish the current milestone's acceptance checks and capture the accepted build at 390×844 portrait and 1280×800 desktop. Send both screenshots, the brief, the art guide and palette, and the milestone acceptance criteria to two fresh critique subagents:

- One checks visual fidelity against the game design and art documents.
- One checks the screens and interaction evidence for inconsistencies, missing states, copy or layout mistakes, and other visible defects.

Ask both agents to report actionable findings with severity, screenshot evidence and the related criterion. Create a GitHub issue that links the screenshots and records the critique and its findings. Address every actionable finding and verify the fixes before starting the next milestone; close the issue when resolved. If both critiques find no defects, record that result in the issue and close it after confirming the milestone acceptance checks. Keep critique captures attached to the issue or PR; only commit the final approved shot for each visual milestone.

## One milestone at a time

- Work only on the current milestone (see `docs/milestones/README.md`). Finish and accept it before starting the next.
- **Do not start the Mutation Laboratory before M4.** Nothing goes in `src/lab`, and ESLint blocks importing it.
- Keep the non-goals out (brief section 16): multiplayer, accounts, server persistence, ads, in-app purchases, large open worlds, complex weather, simulated plant biomechanics, extensive crafting, trading, the lab (until M4), dozens of species.

## Architecture rules (enforced)

- `src/sim` is pure, deterministic TypeScript. No `three`, no Rapier, no DOM, no `Math.random`, no `Date.now`/`new Date`/`performance.now`. Wall-clock time comes in as `nowMs`; the seeded RNG lives in state. State changes only through `step()`. Gameplay systems never depend on Three.js scene objects (brief section 13).
- Rendering, physics, UI and audio react to sim snapshots and events. They never decide rewards or change state.
- Rapier is loaded lazily, only where it adds feel, and the game must work without it.
- Growth is computed from real timestamps (`plantedAt`, `nowMs`), so it never depends on frame rate, physics or animation. Fixed 10 Hz sim tick for commands; rendering interpolates; physics has its own fixed step.
- Rigid bodies only where the brief allows (section 9): falling and bouncing fruit, dropped objects, small environmental touches, and the M4 lab. Pool them and cap them.
- Saves: IndexedDB, versioned envelope, migrations with fixture tests, save on visibility change, recover from interrupted writes, never silently reset.
- Module boundaries are in `eslint.config.js`. Don't add `eslint-disable` to cross them; write an ADR.

## Art rules (enforced)

- `docs/art/style-guide.md` and `docs/art/palette.json` are binding. When code and the guide disagree, the guide wins, or you change the guide with the art advisor's approval.
- **Colours come only from `src/render/palette.ts`.** It is generated from `docs/art/palette.json` with `npm run palette`; never edit it by hand. ESLint and `tests/unit/no-raw-hex.test.ts` reject hex colours anywhere else in `src/` (tests are exempt). A new colour is a palette.json change.
- The world is printed (toon, ink outline, blob shadows). Mutations are real (physically based materials). Don't put glossy materials on ordinary objects.

## Mobile-first rules

- Every essential action works with one finger. Pinch zoom exists, but nothing essential needs it. No long-press or precision placement.
- Touch targets are at least 48×48 px. Main actions sit in the bottom third of a portrait screen.
- Design and test portrait phone first (390×844), then landscape and desktop (mouse and keyboard where it makes sense).
- Respect safe areas. Prevent page scrolling and browser gestures during play.
- A gesture that starts on a plot or plant never moves the camera. Drag on empty ground pans.
- Screen layout (brief section 8): coins, garden level and objective at the top; the garden in the middle; seeds and tools at the bottom; shop, upgrades, journal and settings as expandable panels. Keep overlays minimal while gardening.
- No hover-only behaviour. Respect `prefers-reduced-motion`.
- Stay inside the performance targets in `docs/architecture.md`.

## Testing gates

Run all of these before saying a task is done:

```
npm run palette:check   # palette.ts matches palette.json
npm run typecheck       # tsc
npm run lint            # eslint, including boundaries and the no-hex rule
npm test                # vitest
npm run build           # vite build
npm run e2e             # playwright: mobile-portrait and desktop projects
```

`npm run check` runs them all in order. First run: `npx playwright install chromium`.

**CI must be green with no retries.** Retries are 0 in Vitest, Playwright and CI. Never add retries, `test.skip`, `.only`, or weaker assertions to get green. A flaky test is a bug; find the cause.

## Copy

Player-facing text, docs and PR descriptions are plain, short and clear.

- Say what to do: "Tap a plot to plant." Not "Embark on your magical gardening journey!"
- No hype or filler words (magical, unleash, seamless, journey, elevate, delve).
- No exclamation marks, except the rare first-time mutation reveal.
- If a sentence would fit any game, cut it.

## Commits and PRs

- Branch per task: `m1/01-sim-foundations`, `fix/swipe-harvest-edge`.
- Conventional commit subjects: `feat(sim): plant command validation`, `fix(input): …`, `test(e2e): …`, `docs: …`, `art(render): …`, `chore: …`. Imperative, under 72 characters.
- Default to one task per PR; split only if the task exceeds about 400 changed lines or crosses two modules. Title: `M1-03: Plant command with validation`. Link the milestone doc and the task's issue.
- The PR description says what changed, how it was tested (the gate commands and results), and includes screenshots for anything visual.
- Squash-merge only after the reviewer approves (and the art advisor, when the change is visual) and CI is green with no retries.
- Labels: `M1`–`M5`, `feat`, `bug`, `art`, `perf`, `needs-review`.
