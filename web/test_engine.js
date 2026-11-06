"use strict";
const assert = require("assert");
const E = require("./engine.js");
let p0 = E.params(0, 1, 0, 100);
assert(p0.level === 0 && p0.noiseGain === 0 && p0.lowGain === 0, "engine off at zero throttle");
assert(E.params(1, 1, 0, 0).level === 0, "no fuel, no sound");
let ground = E.params(1, 1, 50, 100), space = E.params(1, 0, 50, 100);
assert(ground.noiseGain > space.noiseGain * 4, "exhaust hiss is much weaker in space");
assert(space.lowGain > 0.2, "hull rumble stays in space");
assert(ground.noiseFreq > space.noiseFreq, "air opens the filter");
assert(E.params(1, 1, 0, 100).level > E.params(0.3, 1, 0, 100).level, "level grows with throttle");
for (let t = 0; t <= 1; t += 0.1) for (let d = 0; d <= 1; d += 0.1) {
  const q = E.params(t, d, 100, 50);
  for (const k in q) assert(isFinite(q[k]) && q[k] >= 0, k);
}
assert.doesNotThrow(() => E.update(null, 1, 1, 0, 1), "no synth is silent");
console.log("engine tests ok");
