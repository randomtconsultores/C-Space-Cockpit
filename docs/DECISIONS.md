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
| Rotation model | Damped inertia, with tunable values (M2). |
| Pitch | Normal by default; key I inverts; the choice is saved. |
| Fuel | A full tank always allows one intergalactic jump and leaves a reserve. Trip cost = fixed cost + k * distance; constants live in a config file and are tuned by simulation. |
| Map | 7 systems in the first version (M3). |
| Life-Safe | Used only when the pilot dies AND the ship is destroyed. The pilot is restored from the last valid copy, without a ship. |
| Debt | Paid in credits and/or missions given by natives. Mission types depend on the planet culture: combat (battle royale inside and outside the planet, pirates), races on the planet, dangerous cargo transport (pirates, debris, asteroids). Initial amount and balance are provisional. |
| Replacement ship | The pilot immediately gets a loaned ship. Credits may go negative. |
| Debt increase after a loss | The ship cost is added to the debt. The pilot runs one or more tutorials to recover that increase, which also trains ship control. |
| Introductory level | Added to M3: vertical ascent from Earth (semi-guided: pilot controls throttle and final pitch), atmosphere exit with inertia, sound and colour changes, calm flight, simple lunar slingshot (corridor bonus, presented as computed by Earth scientists; real physics in later levels), a harder asteroid belt, exit from the Solar System and first jump. Cockpit view only. |
| Asteroid belt difficulty | Harder than M1: the laser must be needed. Still solvable. |

## Fixed rules inherited from the migration

- C keeps state and rules. JavaScript handles input and browser services.
- The C/JS boundary is scalar plus fixed read-only float arrays. No strings or pointers from JavaScript.
- No database in the browser. Strict Origin and CSRF. Never add localhost to allowed origins.
- No agent commits or pushes without explicit Director authorization. Merges belong to the Director.
