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
