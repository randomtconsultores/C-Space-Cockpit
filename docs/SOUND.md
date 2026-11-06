# Sound direction (M2)

Decision of the Director, 2026-11-06: we render our own performances. Two palettes.

## Palettes
- Calm travel: public-domain classical compositions (composer dead more than 70 years, so public domain in Portugal and the EU), performed by our own synthesis. Candidates: Satie (Gymnopedie 1), Debussy (Clair de Lune), Holst (The Planets), Grieg, Mussorgsky, Strauss (The Blue Danube for docking).
- Fast pace: original 80s-style electronic music (our own composition and synthesis).
- Alarms and cues keep the short effects in web/make_sounds.py.

## Licensing rules
- Composition and recording have separate rights. We only use compositions in the public domain and recordings we make ourselves.
- No downloaded MIDI files and no third-party recordings unless the exact item has a verified licence that allows commercial use. Typeset score editions may have their own rights: prefer transcribing from public-domain first editions (IMSLP) and record the source per piece.
- Every track gets an entry in a manifest: title, composer, composition source, how it was rendered, licence of any sound font or sample used.

## Adaptive structure
- Layers (stems) per track: base, tension, combat. The C core already emits events and states (ALERT, MODE, IN_BELT); JS maps them to layer volumes with crossfades.
- Transitions on bar boundaries, tempo shared inside a palette.
- Mix order of states: calm travel, danger warning, belt, combat, arrival.

## Open
- Sound font or synthesis engine and its licence.
- Output format (OGG or MP3, loop points) and size budget.
- Who composes the electronic palette.

## Blending the two palettes (continuity rules)
The electronic palette is the same piece seen from a faster state, not a different song.
- One key and one chord loop per track pair. Example: Gymnopedie sketch in D (Gmaj7 and Dmaj7 alternating). The electronic layer keeps the same chords at the same harmonic rhythm in absolute time.
- Tempo relation: the electronic tempo is exactly twice the calm one (66 to 132 bpm), so one calm beat equals two electronic beats and bar lines line up every two calm bars.
- Shared motif: the theme of the calm track is played by a square-wave lead in the electronic version, with the same notes and timing.
- Shared stems: bass root, chord tones and motif exist in both palettes; only timbre and rhythm density change (sine and piano-like against saw, square, kick, hats).
- Transition: 2 bars on the bar line (bass enters, offbeat hats, then kick, snare roll and noise riser), then the electronic bar. Going back: drop drums and bass, the sine motif returns.
- Triggers: state danger or combat adds the electronic layers; return to calm removes them on a bar line, never mid-bar.
- Prototype: continuidade_calmo_para_rapido (shared with the Director on 2026-11-06, about 50 s).
