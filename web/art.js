/* Thumbnails de nos (pixel-art procedural, sem dependencias externas).
   Reaproveitado do contrato da task 14b (art.js). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CockpitArt = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function fill(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
  function px(ctx, x, y, c) { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); }

  // Desenha uma miniatura de 120x72 (logico) para um id de thumb.
  // thumbId exemplos: "spiral-1", "elliptical-2", "quasar-1", "sol", ...
  function drawThumbnail(ctx, thumbId, w, h) {
    if (!ctx) return;
    w = w || 120; h = h || 72;
    ctx.save();
    ctx.clearRect(0, 0, w, h);
    // fundo espaco
    fill(ctx, 0, 0, w, h, "#020605");
    // poeira de estrelas
    var s = 12345;
    for (var i = 0; i < 40; i++) {
      s = (s * 16807 + 0) % 2147483647;
      var px_ = (s >>> 0) % w;
      s = (s * 16807 + 0) % 2147483647;
      var py = (s >>> 0) % h;
      px(ctx, px_, py, "#444");
    }
    var kind = "generic";
    if (/spiral/.test(thumbId)) kind = "spiral";
    else if (/ellipt/.test(thumbId)) kind = "elliptical";
    else if (/quasar/.test(thumbId)) kind = "quasar";
    else if (/sol|sun/.test(thumbId)) kind = "sol";
    var cx = w / 2, cy = h / 2;
    if (kind === "spiral") {
      fill(ctx, cx - 14, cy - 10, 28, 20, "#4da6ff");
      fill(ctx, cx - 8, cy - 4, 16, 8, "#ffffff");
      // bracos
      fill(ctx, cx - 20, cy - 2, 12, 4, "#2a7db8");
      fill(ctx, cx + 8, cy - 2, 12, 4, "#2a7db8");
    } else if (kind === "elliptical") {
      fill(ctx, cx - 16, cy - 10, 32, 20, "#ffd666");
      fill(ctx, cx - 10, cy - 4, 20, 8, "#ffffff");
    } else if (kind === "quasar") {
      fill(ctx, cx - 12, cy - 12, 24, 24, "#66ccff");
      fill(ctx, cx - 4, cy - 4, 8, 8, "#ffffff");
      // jato
      fill(ctx, cx - 6, cy - 20, 4, 14, "#2a7db8");
      fill(ctx, cx + 2, cy - 20, 4, 14, "#2a7db8");
    } else if (kind === "sol") {
      fill(ctx, cx - 11, cy - 11, 22, 22, "#ffd666");
      fill(ctx, cx - 5, cy - 5, 10, 10, "#ffffff");
      for (var a = 0; a < 8; a++) {
        var r = 24;
        var x = cx + Math.round(Math.cos(a * Math.PI / 4) * r);
        var y = cy + Math.round(Math.sin(a * Math.PI / 4) * r);
        fill(ctx, x - 2, y - 2, 4, 4, "#ffb000");
      }
    } else {
      fill(ctx, cx - 12, cy - 10, 24, 20, "#888");
      fill(ctx, cx - 6, cy - 4, 12, 8, "#ddd");
    }
    // borda
    ctx.strokeStyle = "#6dff85"; ctx.lineWidth = 2; ctx.strokeRect(1, 1, w - 2, h - 2);
    ctx.restore();
  }

  return { drawThumbnail: drawThumbnail };
});
