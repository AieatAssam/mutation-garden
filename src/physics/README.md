# src/physics

Rapier (`@dimforge/rapier3d-compat`), loaded lazily and used only for visual juice (fruit bouncing to the crate, dropped seeds) and, from M4, the laboratory. Physics never decides rewards or state. If Rapier fails to load, the game still works with tweened fallbacks.

See docs/architecture.md, section Physics.
