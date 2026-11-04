# Design decisions

Source: design report and Director answers of 2026-11-04. "Open" means not decided.

| Topic | Decision |
|---|---|
| Perspective | Cockpit view with limited depth: the ship flies inside a route corridor and its heading is clamped to a cone (35 degrees). Fixed 2.5D and full 3D are to be explored later for landings and for the battle-royale concept. |
| Render surface | WebGL (lines and points; HUD on a 2D overlay). |
| Planet boundary | Partially navigable terrain: part of each planet is flown, the rest is illustrated scenes. Exact split is open and decided per landing prototype. |
| Checkpoint eligibility | Nearest checkpoint AND active link AND valid mind copy. |
| Ranking metric | Current score, with a Crisis-time criterion and units delivered to Earth as criteria. Formula is open. |
| Technology that saves Earth | Open. It conditions the whole story. |
| Multiplayer clock | Per-ship time with reconciliation. Mechanism is open. |
| Anti-cheat and accounts | Out of scope today. |
| Repository | New repository (this one). C-Space-2Web stays as the closed migration. |
| Game | Rewritten. Space Impact gameplay is dropped. Reused: sounds, ship ideas, controls, ranking, save and load, the server. |

## Fixed rules inherited from the migration

- C keeps state and rules. JavaScript handles input and browser services.
- The C/JS boundary is scalar plus fixed read-only float arrays. No strings or pointers from JavaScript.
- No database in the browser. Strict Origin and CSRF. Never add localhost to allowed origins.
- No agent commits or pushes without explicit Director authorization. Merges belong to the Director.
