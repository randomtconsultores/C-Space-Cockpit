/* Testes de i18n: todas as chaves map.* existem em EN e PT (task map-redesign). */
"use strict";
const assert = require("assert");
const I18n = require("./i18n.js");

const i18n = I18n;
let failures = 0;
function check(name, fn) {
  try { fn(); console.log("OK " + name); }
  catch (e) { failures++; console.log("FALHOU " + name + ": " + e.message); }
}

(function () {
  const pt = i18n.dict["pt-PT"];
  const en = i18n.dict["en"];
  assert(pt, "locale pt-PT");
  assert(en, "locale en");

  // chaves esperadas do mapa
  const expected = [
    "map.title", "map.back", "map.galaxy", "map.system", "map.nav",
    "map.launchL0", "map.comingSoon", "map.replay",
    "map.layer.spirals", "map.layer.ellipticals", "map.layer.ellipticalsZ",
    "map.layer.quasars", "map.layer.quasarsZ",
    "map.legend.cmb",
    "map.node.sol", "map.node.alphaCentauri", "map.node.proxima",
    "map.node.barnard", "map.node.sirius", "map.node.vega",
    "map.node.desc.sol", "map.node.desc.alphaCentauri", "map.node.desc.proxima",
    "map.node.desc.barnard", "map.node.desc.sirius", "map.node.desc.vega"
  ];

  check("todas as chaves map.* existem em pt-PT", function () {
    for (const k of expected) assert(pt[k] !== undefined, "falta pt " + k);
  });
  check("todas as chaves map.* existem em en", function () {
    for (const k of expected) assert(en[k] !== undefined, "falta en " + k);
  });
  check("nenhuma chave map.* fica vazia em qualquer locale", function () {
    for (const k of expected) {
      assert(pt[k] && pt[k].trim().length > 0, "vazio pt " + k);
      assert(en[k] && en[k].trim().length > 0, "vazio en " + k);
    }
  });
  check("t() devolve a chave quando nao ha traducao (fallback)", function () {
    assert.strictEqual(i18n.t("map.node.naoexiste"), "map.node.naoexiste");
  });
  check("t() traduz pt-PT e en", function () {
    i18n.setLang("pt-PT");
    assert.strictEqual(i18n.t("map.title"), "Mapa Galactico");
    assert.strictEqual(i18n.t("map.layer.spirals"), "Galaxias Espirais (z 0.005-0.1)");
    i18n.setLang("en");
    assert.strictEqual(i18n.t("map.title"), "Galaxy Map");
    assert.strictEqual(i18n.t("map.layer.spirals"), "Spiral Galaxies (z 0.005-0.1)");
  });
  // todas as chaves map.* sao simetricas entre locales
  const allKeys = new Set([...Object.keys(pt), ...Object.keys(en)]);
  const mapKeys = [...allKeys].filter(k => k.indexOf("map.") === 0);
  check("todas as " + mapKeys.length + " chaves map.* sao simetricas pt-PT <-> en", function () {
    for (const k of mapKeys) {
      assert(pt[k] !== undefined, "pt falta " + k);
      assert(en[k] !== undefined, "en falta " + k);
    }
  });
})();

console.log(failures === 0 ? "\ni18n tests ok" : "\ni18n tests FALHARAM (" + failures + ")");
process.exit(failures === 0 ? 0 : 1);
