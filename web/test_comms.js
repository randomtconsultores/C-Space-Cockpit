"use strict";
var ids; var C = require("./comms.js");
var fails = 0;
function ok(c, m) { if (!c) { fails++; console.log("FAIL - " + m); } else console.log("ok - " + m); }
function mk(o) { return function (id) { return o[id] || 0; }; }

var d = C.createDirector();
var out = d.step(mk({}));
ok(out.length === 1 && out[0].id === "RADIO", "radio check at the pad");
ok(d.step(mk({})).length === 0, "each line fires once");
out = d.step(mk({ 2: 0.5 }));
ok(out.length === 1 && out[0].id === "IGNITION", "ignition on throttle");
out = d.step(mk({ 2: 1, 24: 1400, 23: 0 }));
ids = out.map(function (l) { return l.id; });
ok(ids.indexOf("LIFTOFF") >= 0 && ids.indexOf("CLIMB") >= 0 && ids.indexOf("HEAT") >= 0, "ascent milestones");
ok(d.event(13).map(function (l) { return l.id; }).join() === "ATMO_EXIT,REASON", "atmosphere exit and mission reason");
ok(d.event(14)[0].id === "MOON" && d.event(15)[0].id === "SLING_GOOD", "Moon and sling events");
ok(d.step(mk({ 23: 4, 24: 13000 })).some(function (l) { return l.id === "BELT"; }), "belt warning");
ok(d.step(mk({ 23: 5, 24: 22000 })).some(function (l) { return l.id === "EXIT"; }), "farewell on exit");
ok(d.step(mk({ 16: 2 }))[0].id === "ARRIVED", "final transmission on arrival");
d.reset();
ok(d.step(mk({})).length === 1, "reset allows replay");
var d2 = C.createDirector();
ok(d2.step(mk({ 16: 3 })).some(function (l) { return l.id === "LOST"; }), "signal lost when destroyed");
ok(C.staticLevel(0) === 0 && C.staticLevel(25000) === 1 && C.staticLevel(1e6) === 1, "static grows with distance");
Object.keys(C.LINES).forEach(function (k) { if (!C.LINES[k].text || !C.LINES[k].say) { fails++; console.log("FAIL - line " + k); } });

/* Player with fake speech */
var spoken = [], node = { textContent: "", style: {} };
function U(t) { this.text = t; }
var synth = { getVoices: function () { return [{ lang: "en-US" }, { lang: "pt-PT" }]; }, speak: function (u) { spoken.push(u); }, cancel: function () {}, pause: function () {}, resume: function () {} };
var p = C.createPlayer({ synth: synth, Utter: U, node: node });
p.push([{ id: "A", text: "Ola", say: "Ola", prio: 2 }, { id: "B", text: "Dois", say: "Dois", prio: 2 }]);
p.update(0);
ok(spoken.length === 1 && spoken[0].lang === "pt-PT" && spoken[0].voice.lang === "pt-PT", "speaks first line with pt-PT voice");
ok(node.textContent === "HOUSTON: Ola", "subtitle shown");
p.update(10);
ok(spoken.length === 1, "no overlap while speaking");
spoken[0].onend(); p.update(20);
ok(spoken.length === 2 && node.textContent === "HOUSTON: Dois", "queue advances after end");
p.push([{ id: "C", text: "x", say: "x", prio: 1 }]);
ok(p.busy(), "busy");
p.cancel();
ok(!p.busy() && node.textContent === "", "cancel clears");
var p2 = C.createPlayer({ synth: null, Utter: null, node: node });
p2.push([{ id: "A", text: "Sem voz", say: "Sem voz", prio: 2 }]); p2.update(0);
ok(node.textContent === "HOUSTON: Sem voz", "subtitle without speech support");
p2.update(1e6); ok(node.textContent === "", "subtitle times out");
console.log(fails ? fails + " falhas" : "todos ok");
process.exit(fails ? 1 : 0);
