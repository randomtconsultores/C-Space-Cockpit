/* MapWedge: renderizador wedge 2D (Map of the Universe) para o C-Space Cockpit.
   Canvas 2D puro, zero dependencias, seed deterministica. Compatavel cockpit.js (IIFE/ES5). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MapWedge = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ---------- CONSTANTES ---------- */
  var WEDGE_ANGLE_DEG = 90;
  var WEDGE_ANGLE_RAD = WEDGE_ANGLE_DEG * Math.PI / 180;
  var LAYERS = [
    { id: "spirals", zMin: 0.005, zMax: 0.1, color: "#4da6ff", kind: "spiral", labelKey: "map.layer.spirals" },
    { id: "ellipticals", zMin: 0.1, zMax: 0.4, color: "#ffd666", kind: "elliptical", labelKey: "map.layer.ellipticals" },
    { id: "ellipticalsZ", zMin: 0.4, zMax: 1.0, color: "#ff8844", kind: "elliptical", labelKey: "map.layer.ellipticalsZ" },
    { id: "quasars", zMin: 1.0, zMax: 2.5, color: "#66ccff", kind: "quasar", labelKey: "map.layer.quasars" },
    { id: "quasarsZ", zMin: 2.5, zMax: 5.0, color: "#ff4444", kind: "quasar", labelKey: "map.layer.quasarsZ" }
  ];
  var LAYER_COUNT = LAYERS.length;
  var CMB_RADIUS_FACTOR = 1.02;
  var NODE_COUNT_PER_LAYER = [25, 20, 15, 12, 10]; // ~82 nos
  var FILAMENT_SEGMENTS = 40;
  var NODE_RADIUS = { spiral: 5, elliptical: 6, quasar: 7 };

  /* ---------- RNG deterministica (mulberry32) ---------- */
  function mulberry32(seed) {
    return function () {
      var t = (seed += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function zToRadius(z, zMin, zMax) {
    var t = (Math.log(z) - Math.log(zMin)) / (Math.log(zMax) - Math.log(zMin));
    if (t < 0) t = 0; if (t > 1) t = 1;
    return t;
  }

  /* ---------- MapWedge ---------- */
  var MapWedge = {
    /* estado */
    canvas: null, ctx: null, canvasW: 800, canvasH: 600,
    nodes: [], filaments: [],
    currentLayer: 0,
    selectedNodeId: null, hoveredNodeId: null, cursorIndex: -1,
    route: [],
    i18n: null, onSelect: null, onBack: null,
    seed: 12345,
    LAYER_COUNT: LAYER_COUNT,
    LAYERS: LAYERS,
    WEDGE_ANGLE_RAD: WEDGE_ANGLE_RAD,
    WEDGE_ANGLE_DEG: WEDGE_ANGLE_DEG,
    FILAMENT_SEGMENTS: FILAMENT_SEGMENTS,

    /* ---------- INIT ---------- */
    init: function (canvasId, options) {
      options = options || {};
      var el = typeof canvasId === "string" ? (typeof document !== "undefined" ? document.getElementById(canvasId) : null) : canvasId;
      this.canvas = el;
      this.ctx = el && el.getContext ? el.getContext("2d") : null;
      this.canvasW = el ? el.width : 800;
      this.canvasH = el ? el.height : 600;
      this.i18n = options.i18n || function (k) { return k; };
      this.onSelect = options.onSelect || function () {};
      this.onBack = options.onBack || function () {};
      this.seed = options.seed || 12345;
      this.generateNodes(this.seed);
      this.generateFilaments();
      this.bindEvents();
      this.resize();
      this.render();
      if (typeof window !== "undefined") {
        window.addEventListener("resize", function () { this.resize(); }.bind(this));
      }
      return this;
    },

    /* ---------- GERACAO PROCEDURAL ---------- */
    generateNodes: function (seed) {
      var rng = mulberry32(seed);
      var nodes = [];
      var namedL0 = [
        { id: "sol", nameKey: "map.node.sol" },
        { id: "alpha-centauri", nameKey: "map.node.alphaCentauri" },
        { id: "proxima", nameKey: "map.node.proxima" },
        { id: "barnard", nameKey: "map.node.barnard" },
        { id: "sirius", nameKey: "map.node.sirius" },
        { id: "vega", nameKey: "map.node.vega" }
      ];
      var globalZMin = 0.005, globalZMax = 5.0;
      var idSeq = 0;
      for (var li = 0; li < LAYER_COUNT; li++) {
        var layer = LAYERS[li];
        var count = NODE_COUNT_PER_LAYER[li];
        var numClusters = Math.min(3, count);
        var clusterBases = [];
        for (var c = 0; c < numClusters; c++) {
          clusterBases.push(WEDGE_ANGLE_RAD * (c + 1) / (numClusters + 1));
        }
        var clusterSizes = [];
        var remaining = count;
        for (var c = 0; c < numClusters; c++) {
          var s = Math.ceil(remaining / (numClusters - c));
          clusterSizes.push(s);
          remaining -= s;
        }
        var nodeIdx = 0;
        for (var c = 0; c < numClusters; c++) {
          var baseAngle = clusterBases[c];
          var clusterAngleSpread = WEDGE_ANGLE_RAD * 0.06;
          for (var s = 0; s < clusterSizes[c]; s++) {
            var z = layer.zMin + (layer.zMax - layer.zMin) * rng();
            var radius = zToRadius(z, globalZMin, globalZMax);
            radius += (rng() - 0.5) * 0.04; // jitter
            if (radius < 0) radius = 0; if (radius > 1) radius = 1;
            var angle = baseAngle + (rng() - 0.5) * clusterAngleSpread;
            if (angle < 0) angle = 0; if (angle > WEDGE_ANGLE_RAD) angle = WEDGE_ANGLE_RAD;
            var id = "n" + li + "_" + idSeq++;
            var nameKey = "map.node." + id;
            var thumb = layer.kind + "-" + ((s % 3) + 1);
            // primeiros nos da camada 0 usam nomes proprios
            if (li === 0 && namedL0[nodeIdx]) {
              id = namedL0[nodeIdx].id;
              nameKey = namedL0[nodeIdx].nameKey;
              thumb = "spiral-" + ((nodeIdx % 3) + 1);
              nodeIdx++;
            }
            nodes.push({
              id: id, nameKey: nameKey, kind: layer.kind, layer: li,
              angle: angle, radius: radius,
              edges: [], level: li === 0 ? "L0" : null,
              state: li === 0 ? "available" : "locked",
              thumb: thumb
            });
          }
        }
      }
      // arestas: 1-3 no mesmo layer (proximidade) + 0-1 no layer seguinte
      var byLayer = [];
      for (var li = 0; li < LAYER_COUNT; li++) byLayer.push([]);
      nodes.forEach(function (n) { byLayer[n.layer].push(n); });
      for (var li = 0; li < LAYER_COUNT; li++) {
        var group = byLayer[li];
        for (var i = 0; i < group.length; i++) {
          var a = group[i];
          var dists = [];
          for (var j = 0; j < group.length; j++) {
            if (i === j) continue;
            var b = group[j];
            var da = a.angle - b.angle, dr = a.radius - b.radius;
            dists.push({ id: b.id, d: da * da + dr * dr });
          }
          dists.sort(function (x, y) { return x.d - y.d; });
          var maxEdges = Math.min(3, dists.length);
          var take = 1 + Math.floor(rng() * maxEdges);
          for (var e = 0; e < take; e++) a.edges.push(dists[e].id);
          // progressao para o layer seguinte
          if (li + 1 < LAYER_COUNT && rng() < 0.5) {
            var next = byLayer[li + 1];
            if (next.length > 0) a.edges.push(next[Math.floor(rng() * next.length)].id);
          }
        }
      }
      this.nodes = nodes;
      return nodes;
    },

    generateFilaments: function () {
      var filaments = [];
      var byLayer = [];
      for (var li = 0; li < LAYER_COUNT; li++) byLayer.push([]);
      this.nodes.forEach(function (n) { byLayer[n.layer].push(n); });
      for (var li = 0; li < LAYER_COUNT; li++) {
        var group = byLayer[li].slice();
        group.sort(function (a, b) { return a.angle - b.angle; });
        var numClusters = Math.min(3, group.length);
        var clusterSize = Math.max(1, Math.floor(group.length / numClusters));
        for (var c = 0; c < numClusters; c++) {
          var start = c * clusterSize;
          var end = c === numClusters - 1 ? group.length : start + clusterSize;
          var cluster = group.slice(start, end);
          if (cluster.length < 2) continue;
          cluster.sort(function (a, b) { return a.radius - b.radius; });
          var pts = cluster.map(function (n) { return { angle: n.angle, radius: n.radius }; });
          var samples = [];
          for (var s = 0; s < FILAMENT_SEGMENTS; s++) {
            var t = s / (FILAMENT_SEGMENTS - 1);
            var p = this.catmullRom(pts, t);
            // ruido organico deterministico ao longo da curva
            var noise = Math.sin(t * 13.7 + this.seed * 0.31) * 0.018 +
                        Math.cos(t * 7.3 + this.seed * 0.17) * 0.012;
            p.angle += noise;
            p.radius = Math.max(0, Math.min(1, p.radius));
            samples.push({ angle: p.angle, radius: p.radius });
          }
          filaments.push({ points: samples, layerId: LAYERS[li].id, color: LAYERS[li].color });
        }
      }
      this.filaments = filaments;
      return filaments;
    },

    catmullRom: function (pts, t) {
      if (pts.length === 1) return { angle: pts[0].angle, radius: pts[0].radius };
      var n = pts.length - 1;
      var i = Math.min(Math.floor(t * n), n - 1);
      var local = (t * n) - i;
      var p0 = pts[Math.max(i - 1, 0)];
      var p1 = pts[i];
      var p2 = pts[Math.min(i + 1, n)];
      var p3 = pts[Math.min(i + 2, n)];
      return {
        angle: this.catmullRomCoord(p0.angle, p1.angle, p2.angle, p3.angle, local),
        radius: this.catmullRomCoord(p0.radius, p1.radius, p2.radius, p3.radius, local)
      };
    },
    catmullRomCoord: function (p0, p1, p2, p3, t) {
      var t2 = t * t, t3 = t2 * t;
      return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
                    (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
    },

    /* ---------- COORDENADAS ---------- */
    toCanvas: function (angle, radius) {
      var cx = this.canvasW / 2;
      var cy = this.canvasH;
      var maxR = Math.min(cx, cy) * 0.95;
      var a = angle - WEDGE_ANGLE_RAD / 2;
      var x = cx + Math.sin(a) * radius * maxR;
      var y = cy - Math.cos(a) * radius * maxR;
      return { x: x, y: y };
    },
    angleRadiusAt: function (clientX, clientY) {
      var rect = this.canvas ? this.canvas.getBoundingClientRect() : { left: 0, top: 0 };
      var x = clientX - rect.left, y = clientY - rect.top;
      var cx = this.canvasW / 2, cy = this.canvasH;
      var maxR = Math.min(cx, cy) * 0.95;
      var dx = x - cx, dy = cy - y;
      var radius = Math.hypot(dx, dy) / maxR;
      if (radius < 0) radius = 0; if (radius > 1) radius = 1;
      var angle = WEDGE_ANGLE_RAD / 2 + Math.atan2(dx, dy);
      if (angle < 0) angle = 0; if (angle > WEDGE_ANGLE_RAD) angle = WEDGE_ANGLE_RAD;
      return { angle: angle, radius: radius };
    },

    /* ---------- ESTADO / CONSULTAS ---------- */
    getLayer: function () { return this.currentLayer; },
    setLayer: function (layerIndex) {
      if (layerIndex < 0) layerIndex = 0;
      if (layerIndex >= LAYER_COUNT) layerIndex = LAYER_COUNT - 1;
      this.currentLayer = layerIndex;
      this.selectedNodeId = null;
      this.hoveredNodeId = null;
      this.cursorIndex = -1;
      this.render();
    },
    nodeOf: function (id) {
      for (var i = 0; i < this.nodes.length; i++) if (this.nodes[i].id === id) return this.nodes[i];
      return null;
    },
    nodesOfLayer: function (li) {
      var out = [];
      for (var i = 0; i < this.nodes.length; i++) if (this.nodes[i].layer === li) out.push(this.nodes[i]);
      return out;
    },
    isAvailable: function (nodeId) { var n = this.nodeOf(nodeId); return n ? n.state === "available" : false; },
    isLocked: function (nodeId) { var n = this.nodeOf(nodeId); return n ? n.state === "locked" : false; },
    isCompleted: function (nodeId) { var n = this.nodeOf(nodeId); return n ? n.state === "completed" : false; },
    levelOf: function (nodeId) { var n = this.nodeOf(nodeId); return n ? n.level : null },
    selected: function () { return this.selectedNodeId; },

    selectNode: function (nodeId) {
      var n = this.nodeOf(nodeId);
      if (!n) return false;
      this.selectedNodeId = nodeId;
      this.hoveredNodeId = nodeId;
      // cursor = indice no array nodes[]
      for (var i = 0; i < this.nodes.length; i++) if (this.nodes[i].id === nodeId) { this.cursorIndex = i; break; }
      this.render();
      if (this.isAvailable(nodeId)) this.onSelect(nodeId);
      return true;
    },
    focusNode: function (nodeId) {
      var n = this.nodeOf(nodeId);
      if (!n) return false;
      this.selectedNodeId = nodeId;
      this.hoveredNodeId = nodeId;
      for (var i = 0; i < this.nodes.length; i++) if (this.nodes[i].id === nodeId) { this.cursorIndex = i; break; }
      this.render();
      return true;
    },

    /* ---------- EVENTOS ---------- */
    bindEvents: function () {
      var self = this;
      if (!this.canvas) return;
      this.canvas.addEventListener("mousemove", function (e) {
        var p = self.angleRadiusAt(e.clientX, e.clientY);
        var hit = self.findNodeAt(p.x, p.y);
        self.hoveredNodeId = hit ? hit.id : null;
        self.selectedNodeId = null;
        self.cursorIndex = -1;
        self.render();
      });
      this.canvas.addEventListener("click", function (e) {
        var p = self.angleRadiusAt(e.clientX, e.clientY);
        var hit = self.findNodeAt(p.x, p.y);
        if (hit) self.selectNode(hit.id);
      });
    },
    findNodeAt: function (angle, radius) {
      var best = null, bestD = 1e9;
      var pt = this.toCanvas(angle, radius);
      for (var i = 0; i < this.nodes.length; i++) {
        var n = this.nodes[i];
        if (n.layer !== this.currentLayer) continue;
        var c = this.toCanvas(n.angle, n.radius);
        var d = Math.hypot(c.x - pt.x, c.y - pt.y);
        if (d < bestD) { bestD = d; best = n; }
      }
      return bestD < 24 ? best : null;
    },

    /* ---------- RENDER ---------- */
    render: function () {
      var ctx = this.ctx;
      if (!ctx) return;
      var w = this.canvasW, h = this.canvasH;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);

      var layer = LAYERS[this.currentLayer];
      var cx = w / 2, cy = h;
      var maxR = Math.min(cx, cy) * 0.95;

      // arco CMB no topo
      ctx.beginPath();
      ctx.strokeStyle = "#111"; ctx.lineWidth = 1;
      ctx.arc(cx, cy, maxR * CMB_RADIUS_FACTOR, Math.PI, 0, false);
      ctx.stroke();

      // filamentos da camada atual
      for (var f = 0; f < this.filaments.length; f++) {
        var fil = this.filaments[f];
        if (fil.layerId !== layer.id) continue;
        ctx.beginPath();
        ctx.strokeStyle = fil.color; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.55;
        var first = true;
        for (var s = 0; s < fil.points.length; s++) {
          var c = this.toCanvas(fil.points[s].angle, fil.points[s].radius);
          if (first) { ctx.moveTo(c.x, c.y); first = false; }
          else ctx.lineTo(c.x, c.y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // nos da camada atual
      for (var i = 0; i < this.nodes.length; i++) {
        var n = this.nodes[i];
        if (n.layer !== this.currentLayer) continue;
        var c = this.toCanvas(n.angle, n.radius);
        var r = NODE_RADIUS[n.kind] || 5;
        var selected = (this.selectedNodeId === n.id || this.hoveredNodeId === n.id);
        ctx.beginPath();
        ctx.fillStyle = layer.color;
        ctx.arc(c.x, c.y, r, 0, 2 * Math.PI);
        ctx.fill();
        if (selected) {
          ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
          ctx.stroke();
        } else if (n.state === "locked") {
          ctx.strokeStyle = "#ffb000"; ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        // nome
        ctx.fillStyle = "#ddd";
        ctx.font = "10px monospace";
        ctx.textAlign = "center";
        ctx.shadowColor = "#000"; ctx.shadowBlur = 3;
        var label = n.state === "locked" ? this.i18n("map.comingSoon") : this.i18n(n.nameKey);
        ctx.fillText(label, c.x, c.y + r + 12);
        if (n.state === "locked") {
          ctx.fillStyle = "#ffb000";
          ctx.fillText("￿", c.x, c.y - r - 8); // cadeado (fallback)
        }
        ctx.shadowBlur = 0;
      }

      // rota (linha magenta)
      if (this.route.length >= 2) {
        ctx.beginPath();
        ctx.strokeStyle = "#ff00ff"; ctx.lineWidth = 3; ctx.globalAlpha = 0.9;
        var first = true;
        for (var r = 0; r < this.route.length; r++) {
          var node = this.nodeOf(this.route[r]);
          if (!node) continue;
          var c = this.toCanvas(node.angle, node.radius);
          if (first) { ctx.moveTo(c.x, c.y); first = false; }
          else ctx.lineTo(c.x, c.y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // legenda de camadas (canto inferior esquerdo)
      var lx = 14, ly = h - 10;
      for (var li = 0; li < LAYER_COUNT; li++) {
        var ly2 = ly - (LAYER_COUNT - 1 - li) * 16;
        ctx.fillStyle = LAYERS[li].color;
        ctx.beginPath(); ctx.arc(lx + 6, ly2, 5, 0, 2 * Math.PI); ctx.fill();
        ctx.fillStyle = "#aaa";
        ctx.font = "11px monospace";
        ctx.textAlign = "left";
        ctx.fillText(this.i18n(LAYERS[li].labelKey), lx + 14, ly2 + 4);
      }
      ctx.fillStyle = "#666";
      ctx.fillText(this.i18n("map.legend.cmb"), lx + 14, ly - LAYER_COUNT * 16 - 4);
    },

    resize: function () {
      if (!this.canvas) return;
      var r = this.canvas.getBoundingClientRect ? this.canvas.getBoundingClientRect() : null;
      if (r) {
        this.canvasW = Math.floor(r.width) || 800;
        this.canvasH = Math.floor(r.height) || 600;
      }
      this.canvas.width = this.canvasW;
      this.canvas.height = this.canvasH;
      this.render();
    },

    /* ---------- ROTAS ---------- */
    setRoute: function (nodeIds) {
      this.route = nodeIds || [];
      this.render();
    },

    /* ---------- TECLADO ---------- */
    keydown: function (e) {
      var code = e.code || e.key || "";
      var layerNodes = this.nodesOfLayer(this.currentLayer);
      // Tab / Shift+Tab sobre ordem de nodes[]
      if (code === "Tab" && e.shiftKey) {
        e.preventDefault();
        var all2 = this.nodes;
        if (this.cursorIndex < 0) this.cursorIndex = all2.length - 1;
        else this.cursorIndex = (this.cursorIndex - 1 + all2.length) % all2.length;
        this.focusNode(all2[this.cursorIndex].id);
        return true;
      }
      if (code === "Tab") {
        e.preventDefault();
        var all = this.nodes;
        if (this.cursorIndex < 0) this.cursorIndex = 0;
        else this.cursorIndex = (this.cursorIndex + 1) % all.length;
        this.focusNode(all[this.cursorIndex].id);
        return true;
      }
      if (code === "Enter" || code === "Space" || code === "NumpadEnter") {
        e.preventDefault();
        var target = this.selectedNodeId || this.hoveredNodeId || (layerNodes.length ? layerNodes[0].id : null);
        if (target) {
          if (this.isAvailable(target)) { this.selectNode(target); return "select"; }
          return true; // locked: nothing
        }
        return false;
      }
      if (code === "Escape") {
        e.preventDefault();
        this.onBack();
        return "back";
      }
      // setas: vizinho mais próximo na direção (mesmo layer)
      if (code === "ArrowUp" || code === "ArrowDown" || code === "ArrowLeft" || code === "ArrowRight") {
        e.preventDefault();
        var cur = this.selectedNodeId || this.hoveredNodeId;
        if (!cur && layerNodes.length) { this.focusNode(layerNodes[0].id); return true; }
        if (!cur) return false;
        var cn = this.nodeOf(cur);
        if (!cn || cn.layer !== this.currentLayer) return false;
        var dir;
        if (code === "ArrowLeft") dir = { x: -1, y: 0 };
        else if (code === "ArrowRight") dir = { x: 1, y: 0 };
        else if (code === "ArrowUp") dir = { x: 0, y: -1 };
        else dir = { x: 0, y: 1 };
        var cp = this.toCanvas(cn.angle, cn.radius);
        var best = null, bestScore = -1e9;
        for (var i = 0; i < layerNodes.length; i++) {
          var n = layerNodes[i];
          if (n.id === cn.id) continue;
          var np = this.toCanvas(n.angle, n.radius);
          var dx = np.x - cp.x, dy = np.y - cp.y;
          var dist = Math.hypot(dx, dy);
          if (dist < 0.01) continue;
          var nx = dx / dist, ny = dy / dist;
          var score = nx * dir.x + ny * dir.y;
          if (score > bestScore) { bestScore = score; best = n; }
        }
        if (best) this.focusNode(best.id);
        else {
          // wrap ao primeiro da lista
          if (layerNodes.length) this.focusNode(layerNodes[0].id);
        }
        return true;
      }
      return false;
    }
  };

  return MapWedge;
});
