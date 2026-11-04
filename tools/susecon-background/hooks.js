/* global host */
/**
 * SUSECON background hooks.
 *
 * The hooks resolve every scene's colourway to concrete colours and hand the
 * template one JSON config; lib/orb.js (WebGL2) owns the drawing, the live loop
 * and the deterministic export clock. Colourways come from the brand palette:
 *   - five named themes read SUSE tokens and push them to the lightness and
 *     chroma the SUSECON art direction measured (dark grounds near L 0.22,
 *     hot cores near L 0.87 C 0.2, which no palette colour reaches);
 *   - Random draws each role from the palette colours that fit its window
 *     and extrapolates (keeps the hue, moves L and C, clamps to sRGB) when
 *     none fit; the seed makes the draw repeatable;
 *   - My colours derives the full rig from a dark, a glow and an accent seed.
 * The inline CSS wash is the no-WebGL2 fallback and what the CLI's jsdom
 * render shows.
 */

var LOOKS = ['glass', 'fibres', 'cloud', 'horizon', 'split'];
var FRAMINGS = ['full', 'edge-left', 'edge-right', 'low'];
var THEMES = ['random', 'jungle', 'amethyst', 'waterhole', 'persimmon', 'mint', 'seeds'];
var STYLES = ['morph', 'wipe'];
var LIGHT_MOTIONS = ['still', 'drift', 'sweep', 'orbit', 'swirl'];
var BLENDS = ['vivid', 'smooth', 'light', 'srgb'];

// SUSE base palette, used when the token bridge is unavailable.
var FALLBACK_PALETTE = {
  pine: '#0c322c', jungle: '#30ba78', mint: '#90ebcd', persimmon: '#fe7c3f', midnight: '#192072',
  waterhole: '#2453ff', fog: '#efefef', white: '#ffffff', teal: '#00bda7', lime: '#a1ef8b', sky: '#7dc6e2',
  lilac: '#e8c1f7', amethyst: '#5d4f99', peach: '#f9cabf', marigold: '#fcb244', rust: '#bd3314',
};

function _num(v, d) { var n = Number(v); return Number.isFinite(n) ? n : d; }
function _clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }
function _pick(v, list, d) { return list.indexOf(v) >= 0 ? v : d; }
function _hex6(v, fb) {
  v = (v == null ? '' : String(v)).trim().toLowerCase();
  var m3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
  if (m3) return '#' + m3[1] + m3[1] + m3[2] + m3[2] + m3[3] + m3[3];
  return /^#[0-9a-f]{6}$/.test(v) ? v : fb;
}

/* ── OKLCH ──────────────────────────────────────────────────────────── */
function _toLin(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function _toGam(c) { return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; }
function hexToOklch(hex) {
  var n = parseInt(hex.slice(1), 16);
  var r = _toLin(((n >> 16) & 255) / 255), g = _toLin(((n >> 8) & 255) / 255), b = _toLin((n & 255) / 255);
  var l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  var m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  var s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  var L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  var A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  var B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  var h = Math.atan2(B, A) * 180 / Math.PI;
  return { l: L, c: Math.sqrt(A * A + B * B), h: h < 0 ? h + 360 : h };
}
function _oklchToRgb(l, c, h) {
  var hr = h * Math.PI / 180, A = c * Math.cos(hr), B = c * Math.sin(hr);
  var l_ = l + 0.3963377774 * A + 0.2158037573 * B;
  var m_ = l - 0.1055613458 * A - 0.0638541728 * B;
  var s_ = l - 0.0894841775 * A - 1.2914855480 * B;
  l_ = l_ * l_ * l_; m_ = m_ * m_ * m_; s_ = s_ * s_ * s_;
  return [4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.7076147010 * s_];
}
function _inGamut(rgb) { return rgb.every(function (v) { return v >= -1e-4 && v <= 1 + 1e-4; }); }
/** OKLCH to hex, reducing chroma (never hue or lightness) until it fits sRGB. */
function oklchToHex(o) {
  var l = _clamp(o.l, 0, 1), c = Math.max(0, o.c), h = o.h;
  var rgb = _oklchToRgb(l, c, h);
  if (!_inGamut(rgb)) {
    var lo = 0, hi = c;
    for (var i = 0; i < 22; i++) {
      var mid = (lo + hi) / 2;
      if (_inGamut(_oklchToRgb(l, mid, h))) lo = mid; else hi = mid;
    }
    rgb = _oklchToRgb(l, lo, h);
  }
  return '#' + rgb.map(function (v) {
    var x = Math.round(_clamp(_toGam(_clamp(v, 0, 1)), 0, 1) * 255);
    return (x < 16 ? '0' : '') + x.toString(16);
  }).join('');
}
function _win(v, w) { return w == null ? v : Array.isArray(w) ? _clamp(v, w[0], w[1]) : w; }
/** Move a colour into a lightness/chroma window, keeping its hue. */
function fit(o, L, C, dh) {
  return { l: _win(o.l, L), c: _win(o.c, C), h: ((o.h + (dh || 0)) % 360 + 360) % 360 };
}
function _inWin(o, L, C) {
  var okL = L == null || (Array.isArray(L) ? o.l >= L[0] && o.l <= L[1] : Math.abs(o.l - L) < 0.03);
  var okC = C == null || (Array.isArray(C) ? o.c >= C[0] && o.c <= C[1] : Math.abs(o.c - C) < 0.03);
  return okL && okC;
}
function hueDist(a, b) { var d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; }

/* ── palette ────────────────────────────────────────────────────────── */
var _palette = null;
async function loadPalette() {
  if (_palette) return _palette;
  var named = {};
  try {
    var h = typeof host !== 'undefined' ? host : null;
    if (h && h.tokens && h.tokens.colors) {
      var sw = await h.tokens.colors();
      (sw || []).forEach(function (s) {
        var m = /^\{color\.(brand|spectrum)\.([a-z0-9-]+)\}$/.exec(String((s && s.ref) || ''));
        var v = _hex6(s && s.value, '');
        if (m && v) named[m[2]] = v;
      });
    }
  } catch (e) { /* keep the fallback palette */ }
  if (Object.keys(named).length < 6) named = Object.assign({}, FALLBACK_PALETTE);
  _palette = Object.keys(named).sort().map(function (name) {
    var o = hexToOklch(named[name]);
    return { name: name, hex: named[name], l: o.l, c: o.c, h: o.h };
  });
  return _palette;
}
function tok(pal, name) {
  for (var i = 0; i < pal.length; i++) if (pal[i].name === name) return pal[i];
  return hexToOklch(FALLBACK_PALETTE[name] || '#808080');
}

/* ── named themes ───────────────────────────────────────────────────── */
// role: [token, lightness, chroma, hue shift]; null keeps the token's value.
var THEME_SPECS = {
  jungle: {
    ground: ['pine', 0.215, 0.036], ground2: ['midnight', 0.12, 0.05], deep: ['pine', 0.27, 0.05],
    key: ['jungle', 0.7, 0.16], core: ['jungle', 0.875, 0.2], lines: ['mint', 0.8, 0.12],
    flare: ['marigold'], haze: ['teal', 0.6, 0.12], accent: ['waterhole', 0.54, 0.25],
  },
  amethyst: {
    ground: ['midnight', 0.2, 0.065, 16], ground2: ['midnight', 0.11, 0.06], deep: ['midnight', 0.24, 0.07, 14],
    key: ['amethyst', 0.62, 0.19, -14], core: ['sky', 0.84, 0.13], lines: ['lilac', 0.82, 0.09],
    flare: ['marigold'], haze: ['amethyst', 0.58, 0.14], accent: ['lilac', 0.95, 0.05],
  },
  waterhole: {
    ground: ['midnight', 0.18, 0.07, -6], ground2: ['midnight', 0.1, 0.05], deep: ['waterhole', 0.28, 0.1],
    key: ['waterhole', 0.62, 0.22], core: ['sky', 0.86, 0.15, 12], lines: ['sky', 0.84, 0.09],
    flare: ['jungle', 0.72, 0.16], haze: ['amethyst', 0.55, 0.14], accent: ['teal', 0.78, 0.14],
  },
  persimmon: {
    ground: ['midnight', 0.17, 0.07, 4], ground2: ['midnight', 0.1, 0.05], deep: ['midnight', 0.23, 0.07],
    key: ['persimmon', 0.7, 0.18], core: ['persimmon', 0.88, 0.14, 14], lines: ['peach', 0.86, 0.07],
    flare: ['teal', 0.72, 0.13], haze: ['amethyst', 0.5, 0.12], accent: ['marigold', 0.86, 0.15],
  },
  mint: {
    ground: ['mint', 0.9, 0.09], ground2: ['teal', 0.68, 0.12], deep: ['pine', 0.36, 0.07],
    key: ['teal', 0.78, 0.15], core: ['mint', 0.97, 0.05], lines: ['white', 0.99, 0],
    flare: null, haze: ['teal', 0.52, 0.1], accent: ['sky', 0.88, 0.08], light: true,
  },
};
function themeColours(pal, name) {
  var spec = THEME_SPECS[name] || THEME_SPECS.jungle;
  var out = { light: !!spec.light, flareOn: !!spec.flare };
  ['ground', 'ground2', 'deep', 'key', 'core', 'lines', 'flare', 'haze', 'accent'].forEach(function (role) {
    var r = spec[role] || ['marigold'];
    var t = tok(pal, r[0]);
    out[role] = oklchToHex(fit(t, r[1] == null ? null : r[1], r[2] == null ? null : r[2], r[3]));
  });
  return out;
}

/* ── random draw ────────────────────────────────────────────────────── */
function rng(seed) {
  var a = (seed >>> 0) || 1;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function choose(r, list) { return list[Math.floor(r() * list.length) % list.length]; }
/** A palette colour already inside the window, else one moved into it. */
function draw(r, cands, L, C, fallback) {
  var ok = cands.filter(function (p) { return _inWin(p, L, C); });
  if (ok.length) return choose(r, ok);
  var base = cands.length ? choose(r, cands) : fallback;
  return fit(base, L, C);
}
function randomColours(pal, seed) {
  var r = rng(seed * 2654435761);
  var chroma = pal.filter(function (p) { return p.c >= 0.08; });
  var light = r() < 0.12;
  // The glow can be any palette hue; one outside the glow window is extended
  // into it (same hue, new lightness and chroma).
  var key = fit(chroma.length ? choose(r, chroma) : tok(pal, 'jungle'), light ? [0.62, 0.8] : [0.58, 0.76], [0.13, 0.26]);
  var near = function (deg) { return pal.filter(function (p) { return p.c >= 0.03 && hueDist(p.h, key.h) <= deg; }); };
  var apart = function (lo, hi) { return chroma.filter(function (p) { var d = hueDist(p.h, key.h); return d >= lo && d <= hi; }); };
  var out = { light: light, flareOn: light ? false : r() < 0.8 };
  if (!light) {
    // Grounds lean on the brand's dark anchors; now and then the glow's own
    // hue is taken down to a near-black instead.
    var anchors = pal.filter(function (p) { return p.l < 0.4 && p.c >= 0.03; });
    if (!anchors.length) anchors = [tok(pal, 'pine'), tok(pal, 'midnight')];
    var ground = fit(r() < 0.75 ? choose(r, anchors) : key, [0.16, 0.23], [0.025, 0.075]);
    out.ground = oklchToHex(ground);
    out.ground2 = oklchToHex({ l: 0.11, c: 0.045, h: hueDist(ground.h, 265) < 90 ? 265 : ground.h });
    out.deep = oklchToHex(fit(ground, ground.l + 0.06, Math.max(ground.c, 0.045)));
    out.core = oklchToHex(draw(r, near(22), [0.84, 0.92], [0.13, 0.22], key));
    out.lines = oklchToHex(draw(r, near(45), [0.78, 0.92], [0.05, 0.15], key));
  } else {
    var lg = draw(r, near(40), [0.86, 0.94], [0.04, 0.1], key);
    out.ground = oklchToHex(lg);
    out.ground2 = oklchToHex(fit(key, 0.7, 0.12));
    out.deep = oklchToHex(fit(key, 0.38, 0.07));
    out.core = oklchToHex(fit(key, 0.97, 0.05));
    out.lines = oklchToHex({ l: 0.99, c: 0.0, h: key.h });
  }
  out.key = oklchToHex(key);
  var warm = function (p) { return p.h >= 20 && p.h <= 100; };
  var flares = apart(70, 180).filter(function (p) { return hueDist(key.h, 60) < 50 ? !warm(p) : warm(p); });
  out.flare = oklchToHex(draw(r, flares.length ? flares : apart(70, 180), [0.7, 0.86], [0.11, 0.2], tok(pal, 'marigold')));
  out.haze = oklchToHex(draw(r, apart(35, 150), [0.42, 0.66], [0.08, 0.2], fit(key, 0.55, 0.12, 60)));
  out.accent = oklchToHex(draw(r, apart(50, 140), [0.45, 0.72], [0.15, 0.27], fit(key, 0.6, 0.2, 100)));
  return out;
}

/* ── seed colours ───────────────────────────────────────────────────── */
function seedColours(pal, dark, glow, accent) {
  var d = hexToOklch(dark), g = hexToOklch(glow), a = hexToOklch(accent);
  var light = d.l > 0.6;
  var near = function (deg) { return pal.filter(function (p) { return p.c >= 0.03 && hueDist(p.h, g.h) <= deg; }); };
  var r = rng(1);
  var key = fit(g, light ? [0.62, 0.8] : [0.55, 0.8], [0.1, 0.26]);
  var out = { light: light, flareOn: true };
  out.ground = oklchToHex(light ? fit(d, [0.84, 0.95], [0, 0.1]) : fit(d, [0.14, 0.24], [0, 0.08]));
  out.ground2 = oklchToHex(light ? fit(g, 0.7, 0.12) : fit(d, 0.11, Math.min(d.c, 0.05)));
  out.deep = oklchToHex(light ? fit(d, 0.38, 0.07) : fit(d, _clamp(d.l, 0.14, 0.24) + 0.06, Math.min(Math.max(d.c, 0.04), 0.08)));
  out.key = oklchToHex(key);
  out.core = oklchToHex(light ? fit(g, 0.97, 0.05) : draw(r, near(22), [0.84, 0.92], [0.13, 0.22], g));
  out.lines = oklchToHex(light ? { l: 0.99, c: 0, h: g.h } : draw(r, near(45), [0.78, 0.92], [0.05, 0.15], g));
  out.flare = oklchToHex(fit(a, [0.62, 0.88], [0.08, 0.22]));
  out.haze = oklchToHex(fit(hueDist(a.h, g.h) > 40 ? a : g, [0.42, 0.62], [0.06, 0.18], hueDist(a.h, g.h) > 40 ? 0 : 50));
  out.accent = oklchToHex(fit(a, [0.5, 0.86], [0.08, 0.24]));
  return out;
}

function resolveTheme(pal, theme, seed, seeds) {
  if (theme === 'random') return randomColours(pal, seed);
  if (theme === 'seeds') return seedColours(pal, seeds.dark, seeds.glow, seeds.accent);
  return themeColours(pal, theme);
}

/* ── config + markup ────────────────────────────────────────────────── */
var _memoKey = null;
var _memoResult = null;

async function compute(model) {
  var a = Object.fromEntries(model.map(function (i) { return [i.id, i.value]; }));
  var pal = await loadPalette();
  var theme = _pick(a.colourway, THEMES, 'random');
  var cs = a.colourSeed && typeof a.colourSeed === 'object' ? a.colourSeed : {};
  var seed = Math.round(_clamp(_num(cs.seed, 7), 1, 9999));
  var seeds = {
    dark: _hex6(a.seedDark, FALLBACK_PALETTE.pine),
    glow: _hex6(a.seedGlow, FALLBACK_PALETTE.jungle),
    accent: _hex6(a.seedAccent, FALLBACK_PALETTE.marigold),
  };
  var pl = a.placement && typeof a.placement === 'object' ? a.placement : {};
  var placement = { x: _clamp(_num(pl.x, 0), -1.5, 1.5), y: _clamp(_num(pl.y, 0), -1.5, 1.5), zoom: _clamp(_num(pl.zoom, 1), 0.3, 3) };
  var energy = _clamp(_num(a.energy, 20), 0, 100);
  var baseColours = resolveTheme(pal, theme, seed, seeds);
  var base = {
    look: _pick(a.look, LOOKS, 'glass'), framing: _pick(a.framing, FRAMINGS, 'full'),
    placement: placement, energy: energy, colours: baseColours,
  };

  var scenes = (Array.isArray(a.scenes) ? a.scenes : []).slice(0, 8).map(function (b, i) {
    b = b && typeof b === 'object' ? b : {};
    var t = _pick(b.colourway, THEMES.concat(['same']), 'same');
    return {
      look: _pick(b.look, LOOKS, base.look),
      framing: _pick(b.framing, FRAMINGS, 'full'),
      placement: placement,
      energy: _clamp(_num(b.energy, energy), 0, 100),
      colours: t === 'same' ? baseColours : resolveTheme(pal, t, seed + (i + 1) * 101, seeds),
      hold: _clamp(_num(b.hold, 3), 0, 60),
      trans: _clamp(_num(b.transition, 2), 0, 20),
      style: _pick(b.style, STYLES, 'morph'),
    };
  });
  // A single scene is a held look; the loop length input sets its pace.
  if (scenes.length === 1) scenes = [];
  var loop = _clamp(_num(a.loop, 12), 2, 120);
  var total = scenes.length
    ? scenes.reduce(function (n, sc) { return n + sc.hold + sc.trans; }, 0) || loop
    : loop;

  var cfg = {
    base: base,
    scenes: scenes,
    loop: loop,
    glow: _clamp(_num(a.glow, 60), 0, 100) / 100,
    lines: _clamp(_num(a.linework, 60), 0, 100) / 100,
    flow: _clamp(_num(a.flow, 50), 0, 100) / 100,
    motion: _clamp(_num(a.motion, 60), 0, 100) / 100,
    blend: _pick(a.blend, BLENDS, 'vivid'),
    hue: a.hueRoute === 'long' ? 'long' : 'short',
    speed: Math.round(_clamp(_num(a.speed, 3), 1, 8)),
    light: {
      motion: _pick(a.lightMotion, LIGHT_MOTIONS, 'drift'),
      speed: Math.round(_clamp(_num(a.lightSpeed, 1), 1, 6)),
      swing: _clamp(_num(a.lightSwing, 70), 10, 180) * Math.PI / 180,
      follow: a.highlightsFollow !== false && a.highlightsFollow !== 'false',
    },
    bpm: _clamp(_num(a.bpm, 120), 60, 180),
    phase: _clamp(_num(a.phase, 0), 0, 100),
  };
  var json = JSON.stringify(cfg);
  if (json === _memoKey) return _memoResult;

  // Fallback wash: flare and key pools plus a ring where the orb sits.
  var c = baseColours;
  var ring = base.look === 'horizon'
    ? 'radial-gradient(ellipse 120% 90% at 50% -20%,transparent 78%,' + c.core + ' 80%,' + c.key + ' 82%,transparent 90%)'
    : 'radial-gradient(circle at 50% 50%,transparent 30%,' + c.key + ' 34%,transparent 40%)';
  var bg = ring
    + (c.flareOn ? ',radial-gradient(circle at 0% 50%,' + c.flare + ' 0%,transparent 38%)' : '')
    + ',radial-gradient(circle at 100% 0%,' + c.haze + ' 0%,transparent 45%)'
    + ',linear-gradient(' + c.ground + ',' + c.ground + ')';

  _memoKey = json;
  _memoResult = {
    svgContent: '<div class="sb-host" data-clip-ms="' + Math.round(total * 1000) + '" data-sb=\''
      + json.replace(/'/g, '&#39;') + '\'><div class="sb-wash" style="background:' + bg + '"></div></div>',
  };
  return _memoResult;
}

function onInit(ctx) { return compute(ctx.model); }
function onInput(ctx) { return compute(ctx.model); }
