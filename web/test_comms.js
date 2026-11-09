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
ok(d.event(9)[0].id === "PROBLEM", "hull critical triggers the problem call");
ok(d.step(mk({ 23: 5, 24: 22000 })).some(function (l) { return l.id === "EXIT"; }), "good luck on exit");
ok(d.step(mk({ 16: 2 })).map(function (l) { return l.id; }).join() === "ARRIVED,FAREWELL", "landing call and farewell on arrival");
d.reset();
ok(d.step(mk({})).length === 1, "reset allows replay");
var d2 = C.createDirector();
ok(d2.step(mk({ 16: 3 })).every(function (l) { return l.id === "RADIO"; }), "no cheerful call when destroyed");
ok(C.staticLevel(0) === 0 && C.staticLevel(25000) === 1 && C.staticLevel(1e6) === 1, "static grows with distance");
Object.keys(C.LINES).forEach(function (k) { if (!C.LINES[k].text || !C.LINES[k].en || !C.LINES[k].clip) { fails++; console.log("FAIL - line " + k); } });

/* Every id fired along a full flight must exist (a missing line once froze the game) */
var seen = {}, dd = C.createDirector(), zz;
for (zz = 0; zz <= 25000; zz += 50) {
  var ph = zz < 2500 ? 0 : zz < 12000 ? 2 : zz < 21000 ? 4 : 5;
  dd.step(mk({ 2: 1, 24: zz, 23: ph })).forEach(function (l) { seen[l.id] = 1; });
}
[9, 13, 14, 15, 16, 17, 18, 19, 20, 21].forEach(function (e) { dd.event(e).forEach(function (l) { seen[l.id] = 1; }); });
dd.step(mk({ 16: 2 })).forEach(function (l) { seen[l.id] = 1; });
ok(Object.keys(seen).length >= 9 && Object.keys(seen).every(function (k) { return C.LINES[k]; }), "all fired lines exist: " + Object.keys(seen).join());

/* Player with fake audio */
var fs = require("fs"), path = require("path");
Object.keys(C.LINES).forEach(function (k) {
  var f = path.join(__dirname, "nasa", C.LINES[k].clip + ".mp3");
  if (!fs.existsSync(f)) { fails++; console.log("FAIL - missing clip " + f); }
});
fs.existsSync(path.join(__dirname, "nasa", "rumble.mp3")) || (fails++, console.log("FAIL - rumble"));
var played = [], node = { textContent: "", style: {} };
function A(src) { this.src = src; played.push(this); this.volume = 1; }
A.prototype.play = function () { return Promise.resolve(); };
A.prototype.pause = function () { this.paused = true; };
var L = function (id, clip, rumble) { return { id: id, clip: clip, rumble: rumble, en: "Hello", text: "Ola", prio: 2 }; };
var p = C.createPlayer({ Audio: A, node: node, base: "x/" });
p.push([L("A", "radio"), L("B", "liftoff")]);
p.update(0);
ok(played.length === 1 && played[0].src === "x/radio.mp3", "plays first clip");
ok(node.textContent.indexOf("Hello") > 0 && node.textContent.indexOf("Ola") > 0, "subtitle has original and translation");
p.update(10);
ok(played.length === 1, "no overlap while playing");
played[0].onended(); p.update(20);
ok(played.length === 2 && played[1].src === "x/liftoff.mp3", "queue advances after the clip ends");
p.push([{ id: "C", clip: "x", en: "x", text: "x", prio: 1 }]);
ok(p.busy(), "busy");
p.cancel();
ok(!p.busy() && node.textContent === "" && played[1].paused, "cancel clears and stops audio");
var p3 = C.createPlayer({ Audio: A, node: node, base: "x/" }); played.length = 0;
p3.push([L("R", "ignition", true)]); p3.update(0);
ok(played.length === 2 && played[1].src === "x/rumble.mp3", "ignition adds the real launch rumble");
var p2 = C.createPlayer({ Audio: null, node: node });
p2.push([L("A", "radio")]); p2.update(0);
ok(node.textContent.indexOf("Ola") > 0, "subtitle without audio support");
p2.update(1e6); ok(node.textContent === "", "subtitle times out");
var p4 = C.createPlayer({ Audio: A, node: node, base: "x/" }); played.length = 0;
p4.setEnabled(false); p4.push([L("A", "radio")]); p4.update(0);
ok(played.length === 0 && node.textContent !== "", "sound off keeps subtitles only");
console.log(fails ? fails + " falhas" : "todos ok");
process.exit(fails ? 1 : 0);
