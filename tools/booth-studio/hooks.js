// SPDX-License-Identifier: MPL-2.0
// `booth-studio` tool hooks — pure, DOM-free.
// Fold the input model into one config object and hand it to the template as the
// `_state` extra (underscore prefix keeps annotateTemplate from touching it, so it
// stays valid JSON inside <script type="application/json">). The template's WebGL
// renderer reads it. Mirrors tools/3d/hooks.js.

// The panel roles the renderer knows how to dress. These ids are a permanent
// contract: they match both the `asset` input ids in tool.json and the role keys
// in the template's DESIGNS table. Role-based (rather than panel1..N) is what lets
// artwork survive a design switch — a back wall stays a back wall.
var ROLES = ['backWall', 'leftWing', 'rightWing', 'header', 'counter', 'tower', 'screen', 'floor'];

function safeJson(obj) {
  // Only < needs escaping for safe embedding in <script type="application/json">;
  // JSON.parse handles U+2028/U+2029 natively, so no separator escaping needed.
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

function num(v, fallback) {
  var n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

// An `asset` input's value arrives already resolved by the runtime
// (resolveAssetRefs) as a full AssetRef object — so read `.url` off it. Anything
// else (unset, or a bare id the runtime could not resolve) means "empty panel",
// which the renderer draws as a labelled placeholder rather than failing.
function panelFrom(v) {
  if (!v || typeof v !== 'object' || !v.url) return null;
  var meta = (v.meta && typeof v.meta === 'object') ? v.meta : {};
  return {
    url: v.url,
    name: typeof meta.name === 'string' ? meta.name : '',
    width: num(v.width, 0),
    height: num(v.height, 0),
  };
}

function compute(model) {
  var inp = {};
  for (var i = 0; i < model.length; i++) inp[model[i].id] = model[i].value;

  var panels = {};
  for (var r = 0; r < ROLES.length; r++) panels[ROLES[r]] = panelFrom(inp[ROLES[r]]);

  var cam = (inp.camera && typeof inp.camera === 'object') ? inp.camera : {};

  var cfg = {
    design: inp.design || 'inline',
    structure: inp.structure || '#1c1f26',
    panelBase: inp.panelBase || '#30ba78',
    panels: panels,
    fit: inp.fit === 'contain' ? 'contain' : 'cover',
    padding: Math.max(0, Math.min(25, num(inp.padding, 0))),

    scene: inp.scene || 'expo',
    background: inp.background || '#0f1115',
    bgColor2: inp.bgColor2 || '#2453ff',
    gradientBg: inp.gradientBg !== false,
    transparentBg: inp.transparentBg === true,
    exposure: num(inp.exposure, 1),
    shadows: inp.shadows !== false,
    people: inp.people !== false,

    camera: {
      fov: num(cam.fov, 38),
      rotation: num(cam.rotation, 32),
      tilt: num(cam.tilt, 8),
      zoom: num(cam.zoom, 1),
      pan: num(cam.pan, 0),
    },
    cameraMove: inp.cameraMove || 'static',
    duration: Math.max(0.5, num(inp.duration, 6)),
    loop: true,
    easing: inp.easing || 'ease-in-out',
  };

  return { _state: safeJson(cfg) };
}

function onInit(ctx) { return compute(ctx.model); }
function onInput(ctx) { return compute(ctx.model); }
