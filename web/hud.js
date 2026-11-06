/* Cockpit frame and instruments, drawn on a 2D overlay canvas.
   All text lives here (pt-PT); the C core only sends numeric ids. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CockpitHud = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var STAT = ["SPEED", "SPEED_MAX", "THROTTLE", "FUEL", "FUEL_MAX", "FUEL_ROUTE_COST", "HULL", "HULL_MAX",
    "ENERGY", "ENERGY_MAX", "PROGRESS", "ETA_SECONDS", "PILOT_DAYS", "EARTH_DAYS", "ROUTE_DAYS",
    "DISTANCE_LEFT", "MODE", "ALERT", "IN_BELT", "ROCKS_ALIVE", "SENSOR_RANGE", "SHAKE", "LASER_FLASH",
    "PHASE", "ALTITUDE", "ATMO_DENSITY", "ASCENT_ANGLE", "SLING_OFFSET", "SLING_QUALITY", "MOON_DISTANCE", "MOON_ALT"]
    .reduce(function (o, k, i) { o[k] = i; return o; }, {});
  var MODE_TEXT = ["PILOTO AUTOMÁTICO", "CONTROLO MANUAL", "CHEGADA", "NAVE DESTRUÍDA", "SEM COMBUSTÍVEL"];
  var ALERT_TEXT = ["", "PERIGO À FRENTE: FAIXA DE ASTEROIDES", "ASSUMA O CONTROLO MANUAL",
    "COMBUSTÍVEL INSUFICIENTE PARA A ROTA", "CASCO CRÍTICO", "FORA DA ROTA"];
  var GREEN = "#6dff85", DIM = "#1d5a2b", AMBER = "#ffb000", RED = "#ff5a4d";

  function fmtTime(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }

  function bar(ctx, x, y, w, h, frac, color, label, value) {
    frac = Math.max(0, Math.min(1, frac));
    ctx.fillStyle = "#06120a"; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color; ctx.fillRect(x + 1, y + 1, (w - 2) * frac, h - 2);
    ctx.strokeStyle = DIM; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = GREEN; ctx.textAlign = "left"; ctx.fillText(label, x, y - 4);
    ctx.textAlign = "right"; ctx.fillText(value, x + w, y - 4);
  }

  function scanner(ctx, cx, cy, rx, ry, contacts, count, range) {
    ctx.strokeStyle = DIM; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, 6.2832); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx, cy, rx * 0.5, ry * 0.5, 0, 0, 6.2832); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - rx, cy); ctx.lineTo(cx + rx, cy); ctx.moveTo(cx, cy - ry); ctx.lineTo(cx, cy + ry); ctx.stroke();
    ctx.fillStyle = GREEN; ctx.fillRect(cx - 2, cy - 2, 4, 4);
    for (var i = 0; i < count; i++) {
      var x = contacts[i * 4], y = contacts[i * 4 + 1], z = contacts[i * 4 + 2];
      var sx = cx + (x / range) * rx, sy = cy - (z / range) * ry, top = sy - (y / range) * ry * 0.7;
      ctx.strokeStyle = z >= 0 ? AMBER : DIM; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, top); ctx.stroke();
      ctx.fillStyle = z >= 0 ? AMBER : DIM; ctx.fillRect(sx - 2, top - 2, 4, 4);
    }
  }

  /* stats: function(id)->number ; contacts: Float32Array (stride 4) */
  function draw(ctx, w, h, stats, contacts, contactCount, blink) {
    ctx.clearRect(0, 0, w, h);
    var dash = Math.round(h * 0.27), s = Math.max(10, Math.round(h / 55));
    ctx.font = s + "px monospace"; ctx.lineWidth = 1;
    var mode = stats(STAT.MODE), alert = stats(STAT.ALERT);

    /* window frame */
    ctx.fillStyle = "#050a07";
    var wTop = Math.round(h * 0.035), wSide = Math.round(w * 0.045);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, 0); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
    ctx.moveTo(wSide * 1.8, wTop); ctx.lineTo(w - wSide * 1.8, wTop);
    ctx.lineTo(w - wSide * 0.6, h - dash); ctx.lineTo(wSide * 0.6, h - dash); ctx.closePath();
    ctx.fill("evenodd");
    ctx.strokeStyle = DIM; ctx.beginPath();
    ctx.moveTo(wSide * 1.8, wTop); ctx.lineTo(w - wSide * 1.8, wTop);
    ctx.lineTo(w - wSide * 0.6, h - dash); ctx.lineTo(wSide * 0.6, h - dash); ctx.closePath(); ctx.stroke();

    /* crosshair */
    var cx = w / 2, cy = (wTop + h - dash) / 2;
    ctx.strokeStyle = mode <= 1 ? GREEN : DIM; ctx.beginPath();
    ctx.moveTo(cx - 14, cy); ctx.lineTo(cx - 5, cy); ctx.moveTo(cx + 5, cy); ctx.lineTo(cx + 14, cy);
    ctx.moveTo(cx, cy - 14); ctx.lineTo(cx, cy - 5); ctx.moveTo(cx, cy + 5); ctx.lineTo(cx, cy + 14); ctx.stroke();

    /* alert banner */
    var txt = ALERT_TEXT[alert] || "";
    if (txt && (alert !== 1 && alert !== 2 && alert !== 4 || blink)) {
      ctx.font = Math.round(s * 1.5) + "px monospace"; ctx.textAlign = "center";
      ctx.fillStyle = alert === 4 || alert === 3 ? RED : AMBER; ctx.fillText(txt, cx, wTop + s * 3);
      ctx.font = s + "px monospace";
    }

    /* story hint line above the dashboard */
    var hint = "";
    if (typeof CockpitStory !== "undefined") {
      hint = CockpitStory.hintForState(stats);
    }
    if (hint) {
      ctx.font = Math.round(s * 0.9) + "px monospace"; ctx.textAlign = "center";
      ctx.fillStyle = "#c8f5d0"; ctx.shadowColor = "#000"; ctx.shadowBlur = 6; ctx.fillText(hint, cx, wTop + s * 4.5); ctx.shadowBlur = 0;
      ctx.font = s + "px monospace";
    }

    /* dashboard */
    var top = h - dash;
    ctx.fillStyle = "#04100a"; ctx.fillRect(0, top, w, dash);
    ctx.strokeStyle = DIM; ctx.beginPath(); ctx.moveTo(0, top + 0.5); ctx.lineTo(w, top + 0.5); ctx.stroke();
    var colW = w * 0.28, x0 = w * 0.03, bh = Math.max(8, Math.round(dash * 0.09)), y = top + dash * 0.2, gap = dash * 0.19;
    var fuel = stats(STAT.FUEL), fuelMax = stats(STAT.FUEL_MAX);
    bar(ctx, x0, y, colW, bh, stats(STAT.SPEED) / stats(STAT.SPEED_MAX), GREEN, "VELOCIDADE", Math.round(stats(STAT.SPEED)) + " u/s");
    bar(ctx, x0, y + gap, colW, bh, stats(STAT.THROTTLE), "#2fbf55", "ACELERADOR", Math.round(stats(STAT.THROTTLE) * 100) + "%");
    bar(ctx, x0, y + gap * 2, colW, bh, fuel / fuelMax, fuel < stats(STAT.FUEL_ROUTE_COST) * (1 - stats(STAT.PROGRESS)) ? AMBER : GREEN,
      "COMBUSTÍVEL", fuel.toFixed(0) + " / " + fuelMax.toFixed(0));
    bar(ctx, x0, y + gap * 3, colW, bh, stats(STAT.HULL) / stats(STAT.HULL_MAX), stats(STAT.HULL) < stats(STAT.HULL_MAX) * 0.25 ? RED : GREEN,
      "CASCO", Math.round(stats(STAT.HULL)) + " / " + Math.round(stats(STAT.HULL_MAX)));
    bar(ctx, x0 + colW + w * 0.02, y + gap * 3, w * 0.1, bh, stats(STAT.ENERGY) / stats(STAT.ENERGY_MAX), AMBER, "LASER", "");

    /* guidance: altitude (ascent), tilt (ascent), sling offset (lunar zone) */
    var phase = stats(STAT.PHASE);
    var gy = Math.round(s * 4);
    if (phase === 0) {
      /* Altitude in km: ~100 km at the top of the atmosphere (Karman line). */
      var altKm = Math.round(stats(STAT.ALTITUDE) / 25);
      ctx.fillStyle = GREEN; ctx.textAlign = "left";
      ctx.fillText("ALTITUDE " + altKm + " km", x0, gy);
      var tilt = stats(STAT.ASCENT_ANGLE);
      var targetTilt = (Math.PI / 2) * (1 - stats(STAT.ALTITUDE) / 2500);
      if (targetTilt < 0) targetTilt = 0;
      ctx.fillText("INCLINAÇÃO " + Math.round(tilt * 180 / Math.PI) + "° / alvo " + Math.round(targetTilt * 180 / Math.PI) + "°", x0, gy + s * 1.5);
    } else if (phase === 3) {
      var moonAlt = stats(STAT.MOON_ALT);
      var quality = stats(STAT.SLING_QUALITY);
      var scolor = quality >= 0.7 ? GREEN : (quality >= 0.3 ? AMBER : RED);
      ctx.fillStyle = scolor; ctx.textAlign = "left";
      ctx.fillText("ALTITUDE LUA " + Math.round(moonAlt) + " u", x0, gy);
      ctx.fillText("IMPULSO " + Math.round(quality * 100) + "%", x0, gy + s * 1.5);
      /* Proximity warning when close to the Moon surface (150 u). */
      if (moonAlt < 150) {
        ctx.fillStyle = RED; ctx.fillText("PERIGO: demasiado perto da superfície.", x0, gy + s * 3);
      }
    }

    scanner(ctx, w * 0.5, top + dash * 0.52, w * 0.13, dash * 0.34, contacts, contactCount, stats(STAT.SENSOR_RANGE));
    ctx.fillStyle = GREEN; ctx.textAlign = "center"; ctx.fillText("SCANNER 3D", w * 0.5, top + dash * 0.15);

    var rx = w * 0.69, rw = w * 0.28;
    ctx.textAlign = "left"; ctx.fillStyle = mode === 0 ? GREEN : (mode === 1 ? AMBER : RED);
    ctx.fillText(MODE_TEXT[mode] || "", rx, y - 4);
    bar(ctx, rx, y + gap * 0.6, rw, bh, stats(STAT.PROGRESS), "#2fbf55", "ROTA", Math.round(stats(STAT.PROGRESS) * 100) + "%");
    ctx.fillStyle = GREEN; ctx.textAlign = "left";
    var ly = y + gap * 1.45 + bh;
    ctx.fillText("CHEGADA EM  " + fmtTime(stats(STAT.ETA_SECONDS)), rx, ly);
    ctx.fillText("DISTÂNCIA   " + Math.round(stats(STAT.DISTANCE_LEFT)) + " u", rx, ly + s * 1.3);
    ctx.fillText("PILOTO      " + stats(STAT.PILOT_DAYS).toFixed(1) + " / " + stats(STAT.ROUTE_DAYS).toFixed(1) + " dias", rx, ly + s * 2.6);
    ctx.fillText("TERRA       " + stats(STAT.EARTH_DAYS).toFixed(1) + " dias", rx, ly + s * 3.9);
    ctx.fillStyle = DIM; ctx.textAlign = "center";
    ctx.fillText("WASD/setas: pilotar   Z/X: acelerador   Espaço: laser   P: piloto automático", w / 2, Math.max(s, wTop * 0.7));
  }

  function endText(mode) {
    return ["", "", "CHEGADA AO DESTINO", "A NAVE FOI DESTRUÍDA", "A NAVE FICOU SEM COMBUSTÍVEL"][mode] || "";
  }
  return { STAT: STAT, draw: draw, endText: endText, fmtTime: fmtTime };
});
