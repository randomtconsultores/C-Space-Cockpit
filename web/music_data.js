/* Music data: pure data object (UMD). No Web Audio, no DOM.
   All note numbers are MIDI pitches. Times are expressed in beats of the
   calm tempo; the scheduler converts them to AudioContext currentTime. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CockpitMusicData = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DATA = {
    version: 1,
    pieces: {
      satie_gymnopedie1: {
        title: "Gymnopedie No. 1 (esboço)",
        composer: "Erik Satie (esboço de memória)",
        source: "TODO verify against first edition (IMSLP) - note data is a sketch",
        meter: [3, 4],
        beats_per_bar: 3,
        /* Harmonia: um acorde por compasso, alternando Sol maior 7a e Ré maior 7a. */
        chords: [
          { bars: 1, root: 43, tones: [59, 62, 66, 69] },
          { bars: 1, root: 38, tones: [57, 61, 66, 62] }
        ],
        /* Tema: [inicio_em_batidas, duracao_em_batidas, nota_MIDI], inicio contado
           em batidas calmas desde o começo do tema. 21 batidas = 7 compassos de 3/4. */
        motif: [
          [0, 3, 78], [3, 3, 81], [6, 1.5, 79], [7.5, 1.5, 78], [9, 3, 73],
          [12, 1.5, 71], [13.5, 1.5, 73], [15, 3, 74], [18, 3, 69]
        ],
        motif_bars: 7,
        accompaniment_intro_bars: 2
      }
    },
    pairings: {
      satie_d_major: {
        piece: "satie_gymnopedie1",
        calm_bpm: 66,
        fast_ratio: 2,
        transpose: 0,
        mode: "major",
        instruments: {
          calm: { pad: "sine", melody: "sine" },
          fast: { bass: "saw", arp: "square", lead: "square", drums: "kit80" }
        },
        layers: {
          calm: ["pad", "motif"],
          alert: ["pad", "motif", "bass", "hats"],
          belt: ["pad", "bass", "kick", "hats", "arp", "lead"],
          combat: ["bass", "kick", "clap", "hats", "arp", "lead", "riser_off"],
          arrival: ["pad", "motif"]
        },
        transition: { bars: 2 }
      }
    }
  };

  return { DATA: DATA };
});
