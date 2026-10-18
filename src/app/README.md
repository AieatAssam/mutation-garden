# src/app

Bootstrap and wiring. Owns the fixed-timestep loop, connects input intents to sim commands, and passes sim snapshots to render, ui and audio. The only module allowed to import everything (except `src/lab` before M4).

See docs/architecture.md.
