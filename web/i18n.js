/* i18n: dicionario EN/PT e aplicacao de traducao. (Task map-redesign) */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CockpitI18n = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var lang = "pt-PT";
  var dict = {
    "pt-PT": {
      // idioma / menu
      "lang.en": "EN",
      "lang.pt": "PT",
      "menu.map": "Mapa",
      // mapa (wedge)
      "map.title": "Mapa Galactico",
      "map.back": "Voltar",
      "map.galaxy": "Galaxia",
      "map.system": "Sistema",
      "map.nav": "Setas/Tab: navegar | Enter: selecionar | Esc: voltar",
      "map.launchL0": "Lancar Nivel 0",
      "map.comingSoon": "Em breve",
      "map.replay": "Replay",
      "map.available": "Disponível",
      "map.locked": "Trancado",
      "map.completed": "Concluído",
      "map.layer.spirals": "Galaxias Espirais (z 0.005-0.1)",
      "map.layer.ellipticals": "Galaxias Elipticas (z 0.1-0.4)",
      "map.layer.ellipticalsZ": "Elipticas Desviadas (z 0.4-1.0)",
      "map.layer.quasars": "Quasars (z 1.0-2.5)",
      "map.layer.quasarsZ": "Quasars Desviados (z 2.5-5.0)",
      "map.legend.cmb": "CMB (z aprox 1100)",
      // nos gerados (exemplo Sol + genericos)
      "map.node.sol": "Sol",
      "map.node.alphaCentauri": "Alpha Centauri",
      "map.node.proxima": "Proxima Centauri",
      "map.node.barnard": "Estrela de Barnard",
      "map.node.sirius": "Sirius",
      "map.node.vega": "Vega",
      "map.node.interface": "Interface",
      "map.node.desc.sol": "Estrela do sistema solar. Ponto de partida (L0).",
      "map.node.desc.alphaCentauri": "Sistema estelar triplo mais proximo do Sol.",
      "map.node.desc.proxima": "Anana vermelha, companheira de Alpha Centauri.",
      "map.node.desc.barnard": "Anana vermelha a cerca de 6 anos-luz.",
      "map.node.desc.sirius": "Estrela mais brilhante do ceu noturno.",
      "map.node.desc.vega": "Estrela brilhante da constelacao da Lira."
    },
    "en": {
      "lang.en": "EN",
      "lang.pt": "PT",
      "menu.map": "Map",
      "map.title": "Galaxy Map",
      "map.back": "Back",
      "map.galaxy": "Galaxy",
      "map.system": "System",
      "map.nav": "Arrows/Tab: navigate | Enter: select | Esc: back",
      "map.launchL0": "Launch Level 0",
      "map.comingSoon": "Coming soon",
      "map.replay": "Replay",
      "map.available": "Available",
      "map.locked": "Locked",
      "map.completed": "Completed",
      "map.layer.spirals": "Spiral Galaxies (z 0.005-0.1)",
      "map.layer.ellipticals": "Elliptical Galaxies (z 0.1-0.4)",
      "map.layer.ellipticalsZ": "Redshifted Ellipticals (z 0.4-1.0)",
      "map.layer.quasars": "Quasars (z 1.0-2.5)",
      "map.layer.quasarsZ": "Redshifted Quasars (z 2.5-5.0)",
      "map.legend.cmb": "CMB (z approx 1100)",
      "map.node.sol": "Sol",
      "map.node.alphaCentauri": "Alpha Centauri",
      "map.node.proxima": "Proxima Centauri",
      "map.node.barnard": "Barnard's Star",
      "map.node.sirius": "Sirius",
      "map.node.vega": "Vega",
      "map.node.interface": "Interface",
      "map.node.desc.sol": "Star of the solar system. Starting point (L0).",
      "map.node.desc.alphaCentauri": "Nearest triple star system to Sol.",
      "map.node.desc.proxima": "Red dwarf companion of Alpha Centauri.",
      "map.node.desc.barnard": "Red dwarf about 6 light-years away.",
      "map.node.desc.sirius": "Brightest star in the night sky.",
      "map.node.desc.vega": "Bright star in the constellation Lyra."
    }
  };

  function setLang(l) { if (dict[l]) lang = l; }
  function getLang() { return lang; }
  function t(k) {
    var d = dict[lang][k];
    return d !== undefined ? d : k;
  }
  function applyI18n(rootEl) {
    rootEl = rootEl || document;
    Array.prototype.forEach.call(rootEl.querySelectorAll("[data-i18n]"), function (el) {
      var k = el.getAttribute("data-i18n");
      var v = t(k);
      if (v) el.textContent = v;
    });
    Array.prototype.forEach.call(rootEl.querySelectorAll("[data-i18n-attr]"), function (el) {
      var raw = el.getAttribute("data-i18n-attr");
      var parts = raw.split(":");
      if (parts.length === 2) {
        var v = t(parts[1]);
        if (v) el.setAttribute(parts[0], v);
      }
    });
  }
  return { setLang: setLang, getLang: getLang, t: t, applyI18n: applyI18n, dict: dict };
});
