/* Story text table for the introductory level (M3).
   Pure module: no DOM, testable in Node. All player-visible text is
   Portuguese (pt-PT) with accents. */
(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CockpitStory = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* Stat ids mirror core/FlStat (core/flight.h). */
  var FS_SPEED = 0, FS_PHASE = 23, FS_ALTITUDE = 24, FS_ASCENT_ANGLE = 26;

  /* Phase ids mirror core/LevelPhase (core/level.h). */
  var LV_ASCENT = 0, LV_ATMO_EXIT = 1, LV_TRANSIT = 2, LV_MOON = 3,
      LV_BELT = 4, LV_EXIT = 5, LV_DONE = 6;

  /* Event ids mirror core/FlEvent (core/flight.h). */
  var FL_EV_PHASE_ATMO_EXIT = 13, FL_EV_PHASE_MOON = 14,
      FL_EV_SLING_GOOD = 15, FL_EV_SLING_OK = 16, FL_EV_SLING_MISS = 17,
      FL_EV_TILT_WARNING = 18;

  var TEXTS = {
    START: "Plataforma de lan\u00e7amento. Aumente o acelerador (X) para descolar.",
    ASCENT: "Mantenha a subida. Use as setas para ajustar a inclina\u00e7\u00e3o at\u00e9 alinhar com a marca.",
    TILT_WARNING: "Inclina\u00e7\u00e3o fora da janela. Consumo extra de combust\u00edvel.",
    ATMO_EXIT: "Sa\u00edmos da atmosfera. O piloto autom\u00e1tico (P) est\u00e1 dispon\u00edvel.",
    TRANSIT: "Rumo \u00e0 Lua.",
    MOON: "Aproxima\u00e7\u00e3o \u00e0 Lua. Siga o corredor calculado pelos cientistas terrestres para ganhar velocidade.",
    SLING_GOOD: "Fisga gravitacional perfeita. Velocidade e combust\u00edvel ganhos.",
    SLING_OK: "Fisga gravitacional aceit\u00e1vel.",
    SLING_MISS: "Fisga falhada. Sem ganho desta vez."
  };

  function textForPhase(phase) {
    switch (phase) {
      case LV_ASCENT: return TEXTS.ASCENT;
      case LV_ATMO_EXIT: return TEXTS.ATMO_EXIT;
      case LV_TRANSIT: return TEXTS.TRANSIT;
      case LV_MOON: return TEXTS.MOON;
      case LV_BELT: return "";
      case LV_EXIT: return "";
      case LV_DONE: return "";
      default: return "";
    }
  }

  function textForEvent(ev) {
    switch (ev) {
      case FL_EV_PHASE_ATMO_EXIT: return TEXTS.ATMO_EXIT;
      case FL_EV_PHASE_MOON: return TEXTS.MOON;
      case FL_EV_SLING_GOOD: return TEXTS.SLING_GOOD;
      case FL_EV_SLING_OK: return TEXTS.SLING_OK;
      case FL_EV_SLING_MISS: return TEXTS.SLING_MISS;
      case FL_EV_TILT_WARNING: return TEXTS.TILT_WARNING;
      default: return "";
    }
  }

  /* hintForState: priority-based current hint. stats: function(id)->number. */
  function hintForState(stats) {
    var phase = stats(FS_PHASE);
    var altitude = stats(FS_ALTITUDE);
    var speed = stats(FS_SPEED);

    /* Tilt warning takes precedence during ascent. */
    if (phase === LV_ASCENT) {
      /* Deviation from the guided gravity-turn profile (pi/2 at the pad, 0 at 700). */
      var target = (Math.PI / 2) * (1 - altitude / 700);
      if (target < 0) target = 0;
      if (Math.abs(stats(FS_ASCENT_ANGLE) - target) > 0.20943951) {
        return TEXTS.TILT_WARNING;
      }
    }

    /* Ascent: platform at start, then ascent hint. */
    if (phase === LV_ASCENT) {
      if (speed <= 0 && altitude <= 0) return TEXTS.START;
      return TEXTS.ASCENT;
    }

    /* Atmosphere exit, transit, moon. */
    if (phase === LV_ATMO_EXIT) return TEXTS.ATMO_EXIT;
    if (phase === LV_TRANSIT) return TEXTS.TRANSIT;
    if (phase === LV_MOON) return TEXTS.MOON;

    return "";
  }

  return {
    textForPhase: textForPhase,
    textForEvent: textForEvent,
    hintForState: hintForState,
    LV_ASCENT: LV_ASCENT,
    LV_ATMO_EXIT: LV_ATMO_EXIT,
    LV_TRANSIT: LV_TRANSIT,
    LV_MOON: LV_MOON,
    LV_BELT: LV_BELT,
    LV_EXIT: LV_EXIT,
    LV_DONE: LV_DONE
  };
});
