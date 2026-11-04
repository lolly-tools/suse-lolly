// SPDX-License-Identifier: MPL-2.0
// `3d` tool hooks compute JSON without browser globals.
// The manifest requests worker execution; template rendering uses the page realm.
// Fold the input model into one config object and hand it to the template as the
// `_state` extra (underscore prefix keeps annotateTemplate from touching it, so it
// stays valid JSON inside <script type="application/json">). The template's WebGL
// renderer reads it. Mirrors tools/chart/hooks.js.

function safeJson(obj) {
  // Only < needs escaping for safe embedding in <script type="application/json">;
  // JSON.parse handles U+2028/U+2029 natively, so no separator escaping needed.
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}

function num(v, fallback) {
  var n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

// The Geeko samples are the catalog's own models, the same files 3D Studio uses,
// so the pack keeps one copy of each. host.assets reads them, which checks each
// file against the catalog's checksum. The duck and the cat stay tool-local, as in
// the community tool. A resolved URL is kept for the life of the tool, so moving a
// slider does not read the file again.
var CATALOG_MODELS = {
  'geeko': 'suse/model/geeko',
  'geeko-branch': 'suse/model/geeko-branch',
  'geeko-sitting': 'suse/model/geeko-sitting',
};
var MODEL_UNAVAILABLE = 'This sample model could not be loaded. Check the connection and try again, or upload a .glb.';
var _catalogUrls = {};

async function sampleUrl(id) {
  var assetId = CATALOG_MODELS[id];
  if (!assetId) return '/tools/3d/assets/' + id + '.glb';
  if (_catalogUrls[id]) return _catalogUrls[id];
  try {
    var ref = await host.assets.get(assetId);
    if (ref && ref.url) _catalogUrls[id] = ref.url;
    return (ref && ref.url) || '';
  } catch (e) {
    return '';
  }
}

async function compute(model) {
  var inp = {};
  for (var i = 0; i < model.length; i++) inp[model[i].id] = model[i].value;

  // Model URL: an uploaded file (in-memory blob URL) wins over the sample.
  // A `file` value is a FileRef {__file, url, ...}. Geeko samples come from the
  // catalog (above); the others are static tool files at /tools/3d/assets/<id>.glb.
  var up = inp.modelUpload;
  var modelUrl = (up && typeof up === 'object' && up.url)
    ? up.url
    : await sampleUrl(inp.model || 'geeko');

  var cam = (inp.camera && typeof inp.camera === 'object') ? inp.camera : {};
  var rot = (inp.modelRotate && typeof inp.modelRotate === 'object') ? inp.modelRotate : {};
  var mov = (inp.modelTranslate && typeof inp.modelTranslate === 'object') ? inp.modelTranslate : {};
  var scl = (inp.modelScale && typeof inp.modelScale === 'object') ? inp.modelScale : {};

  var cfg = {
    modelUrl: modelUrl,
    modelError: modelUrl ? '' : MODEL_UNAVAILABLE,
    width: Math.round(num(inp.width, 1280)),
    height: Math.round(num(inp.height, 1280)),
    scene: inp.scene || 'natural',
    envIntensity: num(inp.envIntensity, 1),
    envRotation: num(inp.envRotation, 0),
    background: inp.background || '#0f1115',
    bgColor2: inp.bgColor2 || '#30ba78',
    transparentBg: inp.transparentBg === true,
    exposure: num(inp.exposure, 1),
    shadows: inp.shadows !== false,
    camera: {
      fov: num(cam.fov, 45),
      rotation: num(cam.rotation, 35),
      tilt: num(cam.tilt, 12),
      zoom: num(cam.zoom, 1),
      pan: num(cam.pan, 0),
    },
    // Free-form model pose, applied about the model's visual centre. All-identity
    // (0/0/0, 0/0/0, 1) reproduces the auto-framed render byte-for-byte.
    transform: {
      pitch: num(rot.pitch, 0),
      yaw: num(rot.yaw, 0),
      tilt: num(rot.tilt, 0),
      tx: num(mov.x, 0),
      ty: num(mov.y, 0),
      tz: num(mov.z, 0),
      scale: Math.max(0.01, num(scl.scale, 1)),
    },
    cameraMove: inp.cameraMove || 'orbit',
    duration: Math.max(0.5, num(inp.duration, 5)),
    fps: Math.round(num(inp.fps, 30)),
    loop: inp.loop !== false,
    easing: inp.easing || 'ease-in-out',
    // Sorted by time: the template's keyframe sampler assumes ascending times
    // (a user can add rows in any order), so a negative/zero span can't freeze it.
    keyframes: (Array.isArray(inp.cameraKeyframes) ? inp.cameraKeyframes : [])
      .map(function (k) {
        return {
          time: num(k.time, 0),
          fov: num(k.fov, 45),
          rotation: num(k.rotation, 0),
          zoom: num(k.zoom, 1),
          pan: num(k.pan, 0),
          tilt: num(k.tilt, 12),
          easing: k.easing || 'ease-in-out',
        };
      })
      .sort(function (a, b) { return a.time - b.time; }),
    playClip: inp.playClip !== false,
    clipIndex: Math.max(0, Math.round(num(inp.clipIndex, 0))),
    applyTint: inp.applyTint === true,
    tint: inp.tint || '#30ba78',
  };

  return { _state: safeJson(cfg) };
}

async function onInit(ctx) { return compute(ctx.model); }
async function onInput(ctx) { return compute(ctx.model); }
