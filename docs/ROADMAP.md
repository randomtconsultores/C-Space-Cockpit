# Roadmap

Supersedes the roadmap proposed for C-Space-2Web. Decisions live in DECISIONS.md. Last update: 2026-11-06, after the first browser validation of M1.

Status legend: done, in progress, next, later, open (needs a Director decision).

## Summary

| Milestone | Status | Gate to leave |
|---|---|---|
| M0 Repository | done | pushed |
| M1 Cockpit and flight prototype | done, validated in browser 2026-11-06 | 31 of 33 checks passed; vibration and physical gamepad untested |
| M2 Flight feel, tutorials, sound | next | Director finds the first trip fun on all three ships |
| M3 Route map, fuel, debt | in progress (route module in C done, not wired) | solvability tests over many seeds |
| M4 Landing prototype | later | Director picks 2.5D or 3D |
| M5 Planet scenes and water | later | M1 to M4 fun on their own |
| M6 Post and missions | later | |
| M7 Save, Load, Life-Safe | partly done (checkpoint module in C) | |
| M8 Ranking | later | formula decided |
| M9 Story and Crisis clock | later | technology that saves Earth decided |
| M10 Multiplayer | separate project | |

Gate: do not start M5 or later until M1 to M4 are fun on their own.

## M0 Repository (done)
New private repo, tests, build, docs, inherited server and sounds.

## M1 Cockpit and flight prototype (done)
Deterministic core, ship types, autopilot with 30 s warning and handover, asteroid belt with guaranteed lane, laser, fuel, hull, energy, two clocks, WebGL cockpit, 3D scanner, events to sound and vibration, touch buttons.
Added after M1: pause (Esc, automatic on focus loss), pitch inversion (I, saved), F3 debug overlay, gamepad support.
Validation by the Director on 2026-11-06 (Chrome, Ubuntu): readability of the panel almost perfect, controls natural, vertical axis default correct, first trip of 3 to 4 minutes good as an introduction, 3D scanner helps, automatic pause on focus loss does not bother.
Not verified yet: vibration on a phone, physical gamepad, real GPU report, server API from the cockpit (the cockpit does not call the API yet).

## M2 Flight feel, tutorials and sound (next)
Flight
- Damped rotational inertia with tunable values per ship (decided). Pitch normal by default (decided).
- Tune turn rate, speed and throttle per ship. Roll stays cosmetic.
- Decide whether the 35 degree cone and the corridor stay. Feedback: widen the free space outside the route path.
- Asteroid belt difficulty (Director, 2026-11-06): harder than M1. The laser must become necessary: some rocks fully block the path and have to be destroyed or avoided with precise manoeuvres. Higher density, tighter gaps, sizes that need more than one shot. The belt stays solvable (solvability tests per seed) and keeps one safe route for the autopilot refusal rule.
- Fixed 60 Hz simulation with render interpolation, so a 120 Hz monitor draws 120 Hz. First check what F3 measures (it showed 60 on a 120 Hz screen).
Pace and content
- Faster pace after the introduction trip: enemies and a mix of elements (pirates, debris), still built on the M1 laser, hull and rocks.
- Asteroid destruction animation (fragments). Screen shake on damage already exists; tune intensity.
Tutorials (new)
- Short risk-free missions that reduce the debt added when a ship is lost, and that train ship control. First set reuses the corridor: free path, rocks and laser, autopilot handover.
Sound (new)
- Current sounds are functional but not fitting. Goal: an adaptive soundtrack by state (travel, danger, combat) plus clear alert cues, immersive and not tiring. Needs a sound design decision (generated, synthesised or sourced; licence must be clean).
Controls
- Remappable keys. Gamepad physical validation.

## M3 Route map, fuel economy and debt (in progress)
Done: core/route (7 provisional systems, distance, fuel cost = fixed + k * distance, reserve), tested natively, not wired to the game.
Next
- Wire the route module into the game: node map UI with 7 systems, pre-departure estimate (fuel, days), several routes.
- Fuel rule (decided): a full tank always allows one intergalactic jump and leaves a reserve.
- Planet culture profile per system (warrior, racer, merchant) decides which missions are offered.
- Debt: single currency value, paid in credits and or missions. Initial amount provisional.
- Seed + generator_version universe. Solvability tests over many seeds.
- Calibration by simulation of the fuel constants.

## M3 introductory level (decided 2026-11-06)
The first level keeps the current trip and puts a story and tutorial in front of it.
1. Vertical ascent from Earth (semi-guided): the pilot controls throttle and the final pitch. Heavy inertia, vibration, sky colour from blue to black, muffled sounds.
2. Leaving the atmosphere: air fades, outside sound disappears, only hull sound remains.
3. Calm flight to the Moon (autopilot, calm music).
4. Lunar slingshot: a simple corridor on the trajectory gives a speed bonus and saves fuel. Presented as computed by Earth scientists. Real physics comes in later levels.
5. Asteroid belt (harder, see M2).
6. Exit from the Solar System and the first jump as the closing scene.
Everything is seen from the cockpit (no external view). Needs in the core: simple atmosphere density and drag by altitude, a lunar corridor bonus, a phase state machine with story text. Sound and colour follow the phase. Prototype the slingshot in isolation first.

## M4 Landing prototype (later)
Atmosphere entry and landing in the cockpit, partially navigable terrain (GL), different atmospheres. Explore fixed 2.5D vs 3D here. Planet races use this.

## M5 Planet scenes and water (later)
Illustrated scenes as data, the water decision, consequences stored as flags (integers). Culture shown through scenes and available missions.

## M6 Post and missions (later)
Post: analyse, record, transmit (four operations as C states, a post stores only what was analysed).
Mission types: combat (battle royale inside and outside the planet, with pirates), races on the planet, dangerous cargo transport (pirates, debris, asteroids). Rewards abate the debt.

## M7 Save, Load, Life-Safe (partly done)
Done: checkpoint DTO in C (validation, capture, restore) with tests. Known gap: rock hit points and rotation not saved.
Next: wire to the inherited API. Eligibility: nearest AND active link AND valid copy.
Rules (decided): Life-Safe only when the pilot dies AND the ship is destroyed; restored from the last valid copy without a ship; a loaned ship is given immediately, credits may go negative; the ship cost is added to the debt, recovered through tutorials; cargo is lost on destruction.

## M8 Ranking (later)
New metric: score + Crisis time + units delivered to Earth. Formula open. New schema version through init-db.

## M9 Story and Crisis clock (later)
Technology that saves Earth (open, conditions the whole story), milestones, chief orders, other ships and factions.

## M10 Multiplayer (separate project)
Per-ship time with reconciliation (mechanism open). Accounts and anti-cheat out of scope until the Director changes that.

## Open decisions
| Decision | Needed before |
|---|---|
| Fixed 2.5D or 3D for landing and battle-royale | M4 |
| Exact pilot vs illustrated scene split of a planet | M5 |
| Sound direction and source of the soundtrack | M2 sound work |
| Initial debt value and tutorial reward values | M3 |
| Ranking formula | M8 |
| Technology that saves Earth | M9 |
| Multiplayer reconciliation | M10 |

## Team workflow
Architect integrates and commits. Programmer agents deliver patches with report and SHA-256. A browser test agent runs the checklist on the Director's Ubuntu PC. The Director merges and authorises every push.
