// <l-icon name="chevron-left"> — lucide icon rendered into a Shadow DOM.
// Building the SVG ourselves inside a shadow root means React never sees or
// reconciles the icon markup, so there is no removeChild race on re-render.
(function () {
  if (customElements.get('l-icon')) return;

  function toPascal(name) {
    return name.split(/[-_]/).map(function (p) {
      return p ? p.charAt(0).toUpperCase() + p.slice(1) : '';
    }).join('');
  }

  function svgFor(name) {
    var L = window.lucide;
    if (!L) return null;
    var icons = L.icons || (L.default && L.default.icons);
    if (!icons) return null;
    var node = icons[toPascal(name)] || icons[name];
    if (!node || !Array.isArray(node)) return null;
    var attrs = node[1] || {};
    var kids = node[2] || [];
    var a = 'xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="' +
      (attrs.viewBox || '0 0 24 24') +
      '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"';
    var body = kids.map(function (c) {
      var s = '<' + c[0];
      var at = c[1] || {};
      for (var k in at) { if (Object.prototype.hasOwnProperty.call(at, k)) s += ' ' + k + '="' + at[k] + '"'; }
      return s + '></' + c[0] + '>';
    }).join('');
    return '<svg ' + a + '>' + body + '</svg>';
  }

  class LIcon extends HTMLElement {
    static get observedAttributes() { return ['name']; }
    constructor() { super(); this._root = this.attachShadow({ mode: 'open' }); }
    connectedCallback() { this._paint(); }
    attributeChangedCallback() { this._paint(); }
    _paint() {
      var name = this.getAttribute('name');
      if (!name) return;
      if (this._done === name) return;
      var self = this;
      var attempt = 0;
      (function tick() {
        var svg = svgFor(name);
        if (svg) {
          self._root.innerHTML = '<style>:host{display:inline-block;line-height:0}</style>' + svg;
          self._done = name;
          return;
        }
        if (attempt++ < 120) setTimeout(tick, 50);
      })();
    }
  }

  customElements.define('l-icon', LIcon);
})();
