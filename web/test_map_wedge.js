/* Testes do renderizador MapWedge (task map-redesign).
   Executa em Node sem DOM: usa um canvas stub e um contexto fake. */
"use strict";
const fs = require("fs");
const assert = require("assert");
const path = require("path");
const MapWedge = require("./map-wedge.js");

/* canvas stub: aceita width/height e um contexto minimo para render(). */
function stubCanvas(w, h) {
  const calls = [];
  const ctx = {
    save: function () { calls.push("save"); },
    restore: function () { calls.push("restore"); },
    clearRect: function () { calls.push("clearRect"); },
    fillRect: function () { calls.push("fillRect"); },
    beginPath: function () { calls.push("beginPath"); },
    arc: function () { calls.push("arc"); },
    stroke: function () { calls.push("stroke"); },
    fill: function () { calls.push("fill"); },
    moveTo: function () { calls.push("moveTo"); },
    lineTo: function () { calls.push("lineTo"); },
    fillText: function () { calls.push("fillText"); },
    setTransform: function () {},
    getTransform: function () { return {}; },
    globalAlpha: 1,
    strokeStyle: null, fillStyle: null, lineWidth: null,
    font: null, textAlign: null, shadowColor: null, shadowBlur: null,
    measureText: function () { return { width: 0 }; }
  };
  Object.defineProperty(ctx, "canvas", { value: { width: w, height: h, getBoundingClientRect: function () { return { left: 0, top: 0, width: w, height: h }; } } });
  return { canvas: { width: w, height: h, getBoundingClientRect: function () { return { left: 0, top: 0, width: w, height: h }; }, addEventListener: function () {}, removeEventListener: function () {} }, ctx: ctx, calls: calls };
}

let failures = 0;
function check(name, fn) {
  try { fn(); console.log("OK " + name); }
  catch (e) { failures++; console.log("FALHOU " + name + ": " + e.message); }
}

/* ---------- geometria ---------- */
(function () {
  const W = 800, H = 600;
  const stub = stubCanvas(W, H);
  MapWedge.init(stub.canvas, { i18n: function (k) { return k; }, seed: 12345 });
  MapWedge.canvasW = W; MapWedge.canvasH = H;

  check("toCanvas(0,0) e centro-base", function () {
    const c = MapWedge.toCanvas(0, 0);
    assert.strictEqual(c.x, W / 2);
    assert.strictEqual(c.y, H);
  });
  check("toCanvas(angulo max, raio 1) e canto superior direito", function () {
    const ANG = MapWedge.WEDGE_ANGLE_RAD;
    const c = MapWedge.toCanvas(ANG, 1);
    const cx = W / 2, cy = H, maxR = Math.min(cx, cy) * 0.95;
    const ex = cx + Math.sin(ANG / 2) * maxR; // angulo 90 -> a=+45 deg
    const ey = cy - Math.cos(ANG / 2) * maxR;
    assert(Math.abs(c.x - ex) < 1, "x " + c.x + " esperado " + ex);
    assert(Math.abs(c.y - ey) < 1, "y " + c.y + " esperado " + ey);
  });
  check("angleRadiusAt inverte toCanvas", function () {
    const c = MapWedge.toCanvas(0.4, 0.3);
    const back = MapWedge.angleRadiusAt(c.x, c.y);
    assert(Math.abs(back.angle - 0.4) < 0.05, "angle " + back.angle);
    assert(Math.abs(back.radius - 0.3) < 0.05, "radius " + back.radius);
  });
  check("angleRadiusAt clampa ao wedge", function () {
    const back = MapWedge.angleRadiusAt(-1000, -1000);
    assert(back.angle >= 0 && back.angle <= (90 * Math.PI / 180));
    assert(back.radius >= 0 && back.radius <= 1);
  });
})();

/* ---------- geracao de nos ---------- */
(function () {
  check("mesmo seed -> mesmos angulos/raios/arestas", function () {
    const a = MapWedge.generateNodes(12345);
    const b = MapWedge.generateNodes(12345);
    assert.strictEqual(a.length, b.length);
    for (let i = 0; i < a.length; i++) {
      assert.strictEqual(a[i].angle, b[i].angle);
      assert.strictEqual(a[i].radius, b[i].radius);
      assert.deepStrictEqual(a[i].edges, b[i].edges);
    }
  });
  check("seed diferente -> distribuicao diferente", function () {
    const a = MapWedge.generateNodes(12345);
    const b = MapWedge.generateNodes(999);
    let diff = 0;
    for (let i = 0; i < a.length; i++) if (a[i].angle !== b[i].angle) diff++;
    assert(diff > 0);
  });
  check("contagem por camada: 25,20,15,12,10", function () {
    const nodes = MapWedge.generateNodes(12345);
    const counts = [0, 0, 0, 0, 0];
    for (let i = 0; i < nodes.length; i++) counts[nodes[i].layer]++;
    assert.deepStrictEqual(counts, [25, 20, 15, 12, 10]);
  });
  check("todos os estados validos; camada 0 disponivel, resto trancado", function () {
    const nodes = MapWedge.generateNodes(12345);
    const valid = new Set(["available", "locked", "completed"]);
    for (let i = 0; i < nodes.length; i++) {
      assert(valid.has(nodes[i].state), "estado " + nodes[i].state);
      if (nodes[i].layer === 0) assert.strictEqual(nodes[i].state, "available");
      else assert.strictEqual(nodes[i].state, "locked");
    }
  });
  check("arestas referenciam nos existentes e niveis", function () {
    const nodes = MapWedge.generateNodes(12345);
    const ids = new Set(nodes.map(n => n.id));
    for (let i = 0; i < nodes.length; i++) {
      for (let e = 0; e < nodes[i].edges.length; e++) assert(ids.has(nodes[i].edges[e]), "aresta invalida " + nodes[i].edges[e]);
      assert(["L0", null].indexOf(nodes[i].level) >= 0);
    }
  });
  check("Sol existe, camada 0, disponivel, primeiro", function () {
    const nodes = MapWedge.generateNodes(12345);
    const sol = nodes.find(n => n.id === "sol");
    assert(sol, "sol nao encontrado");
    assert.strictEqual(sol.layer, 0);
    assert.strictEqual(sol.state, "available");
    assert.strictEqual(nodes[0].id, "sol");
  });
})();

/* ---------- filamentos ---------- */
(function () {
  check("filamentos existem para cada camada", function () {
    MapWedge.generateNodes(12345);
    MapWedge.generateFilaments();
    const ids = new Set(MapWedge.filaments.map(f => f.layerId));
    for (let i = 0; i < MapWedge.LAYER_COUNT; i++) assert(ids.has(MapWedge.LAYERS[i].id), "faltou camada " + MapWedge.LAYERS[i].id);
  });
  check("cada filamento tem FILAMENT_SEGMENTS pontos", function () {
    const FS = MapWedge.FILAMENT_SEGMENTS;
    for (let i = 0; i < MapWedge.filaments.length; i++) {
      assert.strictEqual(MapWedge.filaments[i].points.length, FS, "filamento " + i);
    }
  });
  check("pontos de filamento dentro do wedge", function () {
    for (let i = 0; i < MapWedge.filaments.length; i++) {
      for (let p of MapWedge.filaments[i].points) {
        assert(p.angle >= 0 && p.angle <= (90 * Math.PI / 180));
        assert(p.radius >= 0 && p.radius <= 1);
      }
    }
  });
  check("cores de filamento coincidem com as camadas", function () {
    const byLayer = {};
    for (let f of MapWedge.filaments) byLayer[f.layerId] = f.color;
    for (let i = 0; i < MapWedge.LAYERS.length; i++) assert.strictEqual(byLayer[MapWedge.LAYERS[i].id], MapWedge.LAYERS[i].color);
  });
})();

/* ---------- navegacao por teclado ---------- */
(function () {
  MapWedge.generateNodes(12345);
  const L0 = MapWedge.nodesOfLayer(0);

  check("setas movem para vizinho na direcao (mesma camada)", function () {
    const sol = MapWedge.nodeOf("sol");
    assert(sol);
    const before = MapWedge.selectedNodeId;
    const e = { code: "ArrowRight", key: "ArrowRight", preventDefault: function () {} };
    const ret = MapWedge.keydown(e);
    assert.strictEqual(ret, true);
    assert(MapWedge.selectedNodeId !== null);
    assert.strictEqual(MapWedge.nodeOf(MapWedge.selectedNodeId).layer, 0);
  });
  check("Tab/Shift+Tab ordem de nodes[] com wrap", function () {
    MapWedge.selectNode("sol");
    const base = MapWedge.cursorIndex; // sol e o primeiro no (indice 0)
    const e1 = { code: "Tab", key: "Tab", shiftKey: false, preventDefault: function () {} };
    MapWedge.keydown(e1);
    const afterTab = MapWedge.cursorIndex;
    assert(afterTab === (base + 1) % MapWedge.nodes.length, "Tab avança");
    const e2 = { code: "Tab", key: "Tab", shiftKey: true, preventDefault: function () {} };
    MapWedge.keydown(e2);
    assert.strictEqual(MapWedge.cursorIndex, base, "Shift+Tab desfaz Tab");
  });
  check("Enter em no disponivel retorna select", function () {
    MapWedge.selectNode("sol");
    const e = { code: "Enter", key: "Enter", preventDefault: function () {} };
    assert.strictEqual(MapWedge.keydown(e), "select");
  });
  check("Enter em no trancado nao seleciona", function () {
    const locked = MapWedge.nodesOfLayer(1)[0];
    MapWedge.selectNode(locked.id);
    const e = { code: "Enter", key: "Enter", preventDefault: function () {} };
    const ret = MapWedge.keydown(e);
    assert.strictEqual(ret, true, "trancado nao retorna select");
    assert.strictEqual(MapWedge.selectedNodeId, locked.id);
  });
  check("Escape retorna back", function () {
    const e = { code: "Escape", key: "Escape", preventDefault: function () {} };
    assert.strictEqual(MapWedge.keydown(e), "back");
  });
})();

/* ---------- camadas ---------- */
(function () {
  MapWedge.generateNodes(12345);
  const stub = stubCanvas(800, 600);
  MapWedge.canvas = stub.canvas; MapWedge.ctx = stub.ctx; MapWedge.canvasW = 800; MapWedge.canvasH = 600;
  for (let li = 0; li < 5; li++) {
    check("setLayer(" + li + ") muda currentLayer", (function (li) {
      return function () { MapWedge.setLayer(li); assert.strictEqual(MapWedge.getLayer(), li); };
    })(li));
  }
  check("render() nao rebenta sem DOM", function () {
    MapWedge.render();
    assert.strictEqual(stub.calls.length > 0, true);
  });
})();

/* ---------- roteamento ---------- */
(function () {
  MapWedge.generateNodes(12345);
  const stub = stubCanvas(800, 600);
  MapWedge.canvas = stub.canvas; MapWedge.ctx = stub.ctx; MapWedge.canvasW = 800; MapWedge.canvasH = 600;
  const l0 = MapWedge.nodesOfLayer(0).map(n => n.id).slice(0, 4);
  MapWedge.setRoute(l0);
  MapWedge.render();
  check("setRoute guarda lista de ids", function () {
    assert.deepStrictEqual(MapWedge.route, l0);
  });
  check("setRoute([]) limpa", function () {
    MapWedge.setRoute([]);
    assert.deepStrictEqual(MapWedge.route, []);
  });
})();

/* ---------- serializacao (JSON do disco bate com geracao) ---------- */
(function () {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "nodes-wedge.json"), "utf8"));
  check("nodes-wedge.json tem versao, seed, layers, nodes, filaments", function () {
    assert.strictEqual(data.version, 2);
    assert.strictEqual(data.seed, 12345);
    assert(Array.isArray(data.layers) && data.layers.length === 5);
    assert(Array.isArray(data.nodes) && data.nodes.length === 82);
    assert(Array.isArray(data.filaments) && data.filaments.length === 15);
  });
  check("JSON bate com generateNodes(12345)", function () {
    const gen = MapWedge.generateNodes(12345);
    assert.strictEqual(gen.length, data.nodes.length);
    for (let i = 0; i < gen.length; i++) {
      assert.strictEqual(gen[i].id, data.nodes[i].id);
      assert.strictEqual(gen[i].angle, data.nodes[i].angle);
      assert.strictEqual(gen[i].radius, data.nodes[i].radius);
    }
  });
})();

console.log(failures === 0 ? "\nmap wedge tests ok" : "\nmap wedge tests FALHARAM (" + failures + ")");
process.exit(failures === 0 ? 0 : 1);
