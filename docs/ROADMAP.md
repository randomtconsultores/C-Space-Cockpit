# Roadmap

Supersedes the roadmap proposed for C-Space-2Web. Status: proposal confirmed by the Director on 2026-11-04 (decisions in DECISIONS.md).

## M0 Repository (done)
New private repo, tests, build, docs, inherited server and sounds.

## M1 Cockpit and flight prototype (this commit)
Done: deterministic core, ship types, autopilot with 30 s warning and handover, asteroid belt with guaranteed lane, laser, fuel, hull, energy, two clocks, WebGL cockpit, 3D scanner, events to sound and vibration, touch buttons.
To verify by the Director in a real browser: feel of the controls, readability, performance, sound mapping.

## M2 Flight feel
Tune turn rate, inertia and speed per ship. Roll cosmetic. Throttle presets. Gamepad. Remappable keys. Decide whether the 35 degree cone and corridor stay.

## M3 Route map and fuel economy
Node map, several routes with distance, fuel cost and days. Pre-departure estimate. Seed + generator_version universe. Solvability tests over many seeds.

## M4 Landing prototype
Atmosphere entry and landing in the cockpit, partially navigable terrain (GL), different atmospheres. Explore fixed 2.5D vs 3D here.

## M5 Planet scenes and water
Illustrated scenes as data, the water decision, consequences stored as flags (integers).

## M6 Post: analyse, record, transmit
Four operations as C states. A post stores only what was analysed.

## M7 Save, Load, Life-Safe
Checkpoint v1 (ship state, position, flags, last copy time) over the inherited API. Eligibility rule: nearest AND active link AND valid copy. Death, debt, borrowed native ship.

## M8 Ranking
New metric: score + Crisis time + units delivered to Earth. New schema version through init-db.

## M9 Story and Crisis clock
Technology that saves Earth (open), milestones, chief orders, other ships and factions.

## M10 Multiplayer (separate project)
Per-ship time with reconciliation. Accounts and anti-cheat are out of scope until the Director changes that.

Gate: do not start M5+ until M1 to M4 are fun on their own.
