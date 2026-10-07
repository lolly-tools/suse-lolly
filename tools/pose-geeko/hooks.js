/**
 * Pose Geeko - articulation hook, plus an optional looping "alive" scene.
 *
 * The POSE is static. Every moving part of the Geeko (pupil, eyelid, head,
 * legs, tail) is posed by a single baked SVG ATTRIBUTE computed here:
 *   • pupil  → transform="translate(dx dy)"      (eye look)
 *   • eyelid → stroke-width="w"                   (blink; 0 = open)
 *   • head / legs / tail / body → transform="rotate(deg cx cy)"
 *
 * Baking as attributes (never CSS) is deliberate: the same value renders
 * identically down every export path - verbatim in SVG, read by the PDF DOM
 * walker, and rasterised for CMYK-TIFF / JPG. The rotate pivots below are the
 * artwork's own user-space joints, measured with getBBox on each pose.
 *
 * Each pose is a different illustration with its own coordinate system, so the
 * config is keyed by pose value. Sliders that don't apply to a pose are hidden
 * by `showIf` in the manifest and simply produce empty attributes here.
 *
 * MOTION (`motion: alive`) layers a repeating loop over that pose: the Geeko looks
 * around and blinks, its head follows its gaze, it breathes, and the scene around it
 * moves with it (the curious branch sways from its off-frame end while each leaf
 * flutters on its own stem, the dangling Geeko swings and paddles, the sitting tail
 * curls). See "the alive loop" below for why it is SMIL and how frame 0 stays the
 * posed still. `motion: still` (the default) emits nothing at all, so a still render
 * is byte-for-byte what it was before the loop existed.
 */

// ── per-pose articulation config ────────────────────────────────────────────
// pupil.rest:  the pupil's resting centre in the pose's user space (getBBox)
// pupil.eye:   [cx, cy, R] the eyeball centre + the radius the pupil centre is
//              CLAMPED within, so the pupil never escapes the eye. Rests sit
//              up-left of centre, so there's naturally more room to look right/down.
// pupil.flipX: pose art is internally mirrored (scale(-1)) - flip look direction
// eyelidMax:   stroke-width that fully shuts the eye at blink 100
// *.pivot:     rotate centre in the group's own user space (from getBBox)
// *.mirror:    group sits under a scale(-1); negate so +slider reads the same way
// Per-pose slider ranges (headRange / blinkRange, and each articulated group's
// own `range`) are the source of truth for CLURL correctness - the engine does
// NOT clamp initial URL/CLI values to a slider's min/max, so the hook must. They
// mirror the manifest's min/max + rangeWhen, which only drive the web slider UI;
// keep the two in sync. `noBlink` disables blink for a pose whose eyelid can't
// animate cleanly (dangling) - the manifest also hides the slider there.
//
// `motion` is the alive loop's rig for the pose, in the same user spaces:
// snout:   which way the snout points on screen (-1 left, +1 right), so "look
//          forward" means the same thing on every pose
// lift:    the head-rotation sign that raises the snout
// headAmp: head tilt range of the loop, degrees at liveliness 60
// breath:  pivot the body breathes about (where it rests on the ground or branch)
// sway / swing / leaves / tail / legs: periodic rotations, `amp` degrees at
//          liveliness 60, `k` cycles per 8 seconds of loop (rounded so the loop
//          ends where it began at any length), `ph` a phase offset for the second harmonic
// lids:    the two eyelid LINES in the eyelid's own clip space (the same lines the
//          stroke-width eyelid draws), its clip and its transform. The blink grows a
//          band from each line to the eye's midline in the skin colour, led by a
//          darker lid edge in the artwork's own shadow green; see lidBand.
var POSES = {
  curious: {                                    // gc-* - climbing; eye, blink, head, leaves+branch
    pupil: { rest: [184, 123], eye: [200, 137, 31], flipX: false },
    eyelidMax: 40,
    head:    { pivot: [335, 215] },   // headTilt rotates the head (snout + eye)
    // "Leaves & branch" slider - tilts the WHOLE curious illustration (branch + leaves + geeko)
    // as one group about its bbox centre, so it reads as tipping the whole scene. Applied to the
    // content <g> in the template; pivot = the group's measured centre.
    foliage: { pivot: [539, 301], range: [-40, 40] },
    motion: {
      snout: -1, lift: 1, headAmp: 4,
      // The branch leaves the frame on the right, so it sways from there: its far end
      // stays put at the frame edge and the free end on the left rises and falls. The
      // Geeko, the leaves and the twig ride it.
      sway: { pivot: [1060, 505], amp: 1.1, k: 1 },
      // Each right-hand leaf turns on the one stem they share; the lower sprig (one
      // outline spans both of its leaves) swings as a unit from the end of its twig.
      leaves: { leafA: { pivot: [975, 465], amp: 9, k: 3, ph: 0.6 },
                leafB: { pivot: [975, 465], amp: 10, k: 2, ph: 2.1 },
                sprig: { pivot: [336, 415], amp: 6, k: 2, ph: 4.0 } },
      breath: [470, 420],
      lids: { clip: 'clipPath120', tf: 'translate(18 -305)', color: '#30ba78', edge: '#008657',
              a: [[67, 385], [287, 385]], b: [[67, 495], [287, 495]] },
    },
  },
  dangling: {                                   // dg-* - full body: eye, head, 2 legs (blink disabled)
    pupil: { rest: [901.9, 2282.6], eye: [956.7, 2295.8, 76], flipX: true },
    eyelidMax: 150,
    noBlink: true,
    headRange: [-14, 9],
    head:     { pivot: [1033, 1955], mirror: true },
    legBack:  { pivot: [1210, 1517], mirror: true, range: [-45, 45] },
    legFront: { pivot: [1226, 1722], mirror: true, range: [-30, 80] },
    motion: {
      snout: 1, lift: 1, headAmp: 4,
      // Hangs from its tail: the body swings from where it meets the grip on the branch.
      swing: { pivot: [1160, 700], amp: 2.2, k: 2 },
      legs: { legBack: { amp: 8, k: 2 }, legFront: { amp: -10, k: 2 } },
    },
  },
  sitting: {                                    // gp-* - tail + head + eye
    pupil: { rest: [339, 69], eye: [352, 80, 24], flipX: false },
    eyelidMax: 26,
    head: { pivot: [227, 198] },
    tail: { pivot: [300, 235], range: [-22, 10] },
    motion: {
      snout: 1, lift: -1, headAmp: 4,
      breath: [250, 290],
      tail: { amp: 4, k: 2, ph: 1.3 },
      lids: { clip: 'gp-clipPath115', tf: 'translate(0 33)', color: '#30ba78', edge: '#008657',
              a: [[312.43, 104.37], [426.63, 58.76]], b: [[282.1, 33.59], [396.31, -12]] },
    },
  },
  laying: {                                     // gl-* - head + eye
    pupil: { rest: [800, 154], eye: [816, 175, 33], flipX: false },
    eyelidMax: 42,
    headRange: [-14, 18],
    blinkRange: [0, 300],
    head: { pivot: [671, 313] },
    motion: {
      snout: 1, lift: -1, headAmp: 3,
      breath: [520, 335],
      lids: { clip: 'gl-clipPath81', tf: '', color: '#30ba78', edge: '#008657',
              a: [[697.14, 211.92], [918.82, 239.85]], b: [[726.55, 111.02], [948.23, 138.95]] },
    },
  },
};

// Scene backgrounds (mirror the CSS themes) - remembered for beforeExport.
// `transparent` keeps SVG/PDF alpha; the alpha-less JPG / CMYK-TIFF path falls
// back to white so those exports get a clean sheet rather than black margins.
var THEME_BG = { transparent: '#ffffff', dark: '#0c322c', light: '#f0f7f4', pine: '#165c3c' };
var _bg = THEME_BG.transparent;

function inputsFrom(model) { var o = {}; model.forEach(function (i) { o[i.id] = i.value; }); return o; }
function num(v, d) { var x = Number(v); return isFinite(x) ? x : d; }
// === lolly:shared clamp - generated from community/_shared/math.js; edit there and run npm run sync:shared ===
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
// === /lolly:shared clamp ===
function clampRange(v, r) { return r ? clamp(v, r[0], r[1]) : v; }
function round(x) { return Math.round(x * 100) / 100; }
function rot(deg, piv) { return deg ? 'rotate(' + round(deg) + ' ' + piv[0] + ' ' + piv[1] + ')' : ''; }

// The pupil translate for a look direction: the slider offset (eyeX/eyeY, -100..200
// scaled by the eyeball's clamp radius) plus an extra glance in screen units of that
// radius, then the pupil centre CLAMPED inside the eyeball so it can never escape on
// any pose, slider or glance. Rests sit up-left of centre, so there's more travel to
// look right / down. flipX mirrors a scale(-1) pose. Returns [dx, dy].
function pupilOffset(cfg, v, glanceX, glanceY) {
  var p = cfg.pupil, R = p.eye[2];
  var sx = clamp(num(v.eyeX, 0), -100, 200) / 100 + glanceX;
  var sy = clamp(num(v.eyeY, 0), -100, 200) / 100 + glanceY;
  var px = p.rest[0] + sx * R * (p.flipX ? -1 : 1), py = p.rest[1] + sy * R;   // desired pupil centre
  var ox = px - p.eye[0], oy = py - p.eye[1], ed = Math.sqrt(ox * ox + oy * oy);
  if (ed > R) { px = p.eye[0] + ox / ed * R; py = p.eye[1] + oy / ed * R; }    // clamp to eyeball
  return [round(px - p.rest[0]), round(py - p.rest[1])];
}

function compute(model) {
  var v = inputsFrom(model);
  var pose = v.pose || 'curious';
  var cfg = POSES[pose] || POSES.curious;
  _bg = THEME_BG[v.bg] || THEME_BG.dark;

  var out = { pupilT: '', eyelidW: 0, headT: '', foliageT: '', legFrontT: '', legBackT: '', tailT: '' };

  // Eyes - pupil translate (see pupilOffset).
  var po = pupilOffset(cfg, v, 0, 0);
  if (po[0] || po[1]) out.pupilT = 'translate(' + po[0] + ' ' + po[1] + ')';

  // Each articulated slider below is clamped to its per-pose range and the
  // clamped value is echoed back under its own input id (snap-back), so a value
  // carried over from another pose - or an out-of-range URL/CLI param - is pulled
  // into range instead of driving the art past its safe limit.

  // Blink - eyelid stroke-width (0 open → shut). 100 units == one eyelidMax;
  // laying's wider range lets the eye over-close. Disabled on poses with no
  // working eyelid (dangling).
  if (!cfg.noBlink) {
    var br = cfg.blinkRange || [0, 100];
    var bl = clamp(num(v.blink, 0), br[0], br[1]);
    out.blink = bl;
    out.eyelidW = round((bl / 100) * cfg.eyelidMax);
  }

  // Head tilt - rotates the head group on every pose.
  var hr = cfg.headRange || [-30, 30];
  var ht = clamp(num(v.headTilt, 0), hr[0], hr[1]);
  out.headTilt = ht;
  if (cfg.head) out.headT = rot(ht * (cfg.head.mirror ? -1 : 1), cfg.head.pivot);

  // Leaves & branch (curious only) - tilts the whole illustration group about its centre.
  if (cfg.foliage) {
    var fo = clampRange(num(v.foliage, 0), cfg.foliage.range);
    out.foliage = fo;
    out.foliageT = rot(fo, cfg.foliage.pivot);
  }

  // Legs (dangling only - hidden elsewhere by showIf)
  if (cfg.legFront) {
    var lf = clampRange(num(v.legFront, 0), cfg.legFront.range);
    out.legFront = lf;
    out.legFrontT = rot(lf * (cfg.legFront.mirror ? -1 : 1), cfg.legFront.pivot);
  }
  if (cfg.legBack) {
    var lb = clampRange(num(v.legBack, 0), cfg.legBack.range);
    out.legBack = lb;
    out.legBackT = rot(lb * (cfg.legBack.mirror ? -1 : 1), cfg.legBack.pivot);
  }

  // Tail (sitting only)
  if (cfg.tail) {
    var tl = clampRange(num(v.tail, 0), cfg.tail.range);
    out.tail = tl;
    out.tailT = rot(tl, cfg.tail.pivot);
  }

  // The alive loop, or nothing. `mo` is an extras key, not an input id, so it can never
  // clobber a control (the runtime routes a returned key that matches an input id there).
  out.mo = v.motion === 'alive' ? aliveLoop(cfg, v) : { on: false, end: '' };

  return out;
}

// ── the alive loop ───────────────────────────────────────────────────────────
//
// Every moving part is an SMIL <animateTransform> written INSIDE the pose's own
// <svg>, never a CSS animation, because that is the one form of SVG motion that
// survives every place this tool's picture goes:
//   • it composes with the pose: additive="sum" stacks the loop on top of the baked
//     rotate() a slider wrote, about the same user-space pivot, so the loop plays
//     AROUND whatever pose the user dialled in;
//   • it travels with the SVG: the web export walker clones an inline <svg> with its
//     children, so an SVG export, and the SVG another tool composes this one into
//     (a Design box), carry the loop;
//   • it plays inside an <img> (CSS keyframes in an SVG image do not run in Chromium),
//     so a gallery card or an <img> poster moves too;
//   • the shell inlines a composed SVG through DOMPurify, which keeps
//     <animateTransform> but strips <animate>, <set> and <use>. That is why the blink
//     is a scaled band (lidBand) and not an animated stroke-width.
//   • the Design timeline and its video export seek it frame by frame
//     (svg.setCurrentTime), so a loop exports frame-accurately.
//
// Frame 0 of every track is the posed still and every track returns to it at the loop
// end, so a renderer that ignores SMIL (resvg, the PDF walker, which reads base
// attributes) draws exactly the still, and the loop has no seam.
//
// Values are sampled into keyTimes with linear interpolation rather than calcMode
// "spline": the sanitiser above strips calcMode, so an eased transition is written out
// as its own small curve of keys instead.

var MO_SAMPLES_PER_S = 10;   // periodic tracks: keys per second of loop
var MO_EASE_STEPS = 8;       // keys per eased transition

function f3(x) { return Math.round(x * 1000) / 1000; }
function easeInOut(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }

// A held/eased track. `stops` are [tSec, value[]] from 0 to L; between two stops
// with the same value the track holds, otherwise it eases across the gap.
function easedKeys(stops, L) {
  var times = [], vals = [];
  function push(t, val) {
    var kt = Math.round(clamp(t / L, 0, 1) * 1e5) / 1e5;
    if (times.length && kt <= times[times.length - 1]) return;
    times.push(kt); vals.push(val);
  }
  for (var i = 0; i < stops.length; i++) {
    var b = stops[i];
    if (i === 0) { push(b[0], b[1]); continue; }
    var a = stops[i - 1], same = true;
    for (var j = 0; j < a[1].length; j++) if (a[1][j] !== b[1][j]) same = false;
    if (same) { push(b[0], b[1]); continue; }
    for (var k = 1; k <= MO_EASE_STEPS; k++) {
      var u = k / MO_EASE_STEPS, e = easeInOut(u), lerp = [];
      for (var m = 0; m < a[1].length; m++) lerp.push(a[1][m] + (b[1][m] - a[1][m]) * e);
      push(a[0] + (b[0] - a[0]) * u, lerp);
    }
  }
  times[0] = 0; times[times.length - 1] = 1;
  return { times: times, vals: vals };
}

// A periodic track: fn(phase 0..1) sampled evenly; fn(1) must equal fn(0).
function periodicKeys(fn, L) {
  var n = Math.max(24, Math.round(L * MO_SAMPLES_PER_S)), times = [], vals = [];
  for (var i = 0; i <= n; i++) { times.push(Math.round(i / n * 1e5) / 1e5); vals.push(fn(i / n)); }
  return { times: times, vals: vals };
}

// One <animateTransform>. `fmt` turns a value array into the type's value string.
function smil(type, keys, L, fmt, additive) {
  return '<animateTransform attributeName="transform" type="' + type + '"' +
    (additive ? ' additive="sum"' : '') + ' dur="' + L + 's" repeatCount="indefinite" keyTimes="' +
    keys.times.join(';') + '" values="' + keys.vals.map(fmt).join(';') + '"/>';
}
function rotFmt(piv) { return function (val) { return f3(val[0]) + ' ' + piv[0] + ' ' + piv[1]; }; }
function pairFmt(val) { return f3(val[0]) + ' ' + f3(val[1]); }
function scaleFmt(val) { return Math.round(val[0] * 1e4) / 1e4 + ' ' + Math.round(val[1] * 1e4) / 1e4; }

// Cycles per loop for a rig's `k` (cycles per 8 s), at least one so it always moves.
function cyclesIn(k, L) { return Math.max(1, Math.round(k * L / 8)); }

// A rotation that wobbles around 0: a fundamental plus a phase-shifted octave, minus
// that octave's start value so the track begins (and, being periodic, ends) at 0.
function wobble(amp, cycles, ph) {
  var p = ph || 0, s0 = Math.sin(p);
  return function (phase) {
    var a = 2 * Math.PI * cycles * phase;
    return [amp * (0.65 * Math.sin(a) + 0.35 * (Math.sin(2 * a + p) - s0))];
  };
}

// Where the eyes go, as [phase, forward, down] in units of the eyeball radius:
// a look forward and up, a glance back over the shoulder, a look down, then home.
// The eyes jump between them (a saccade); the head follows a beat later, more slowly.
var GAZE = [[0, 0, 0], [0.14, 0.55, -0.45], [0.38, -0.75, -0.1], [0.6, 0.2, 0.6], [0.8, 0, 0]];
// How far the head lifts its snout for each gaze, in units of the rig's headAmp.
var HEAD_LIFT = [0, 1, -0.4, -0.9, 0];
// Blinks: the start phase of each (one just before the glance back, as a real gaze
// shift brings a blink with it) and the shape of one blink in seconds.
var BLINKS = [0.335, 0.86];
var BLINK_CLOSE = 0.08, BLINK_HOLD = 0.05, BLINK_OPEN = 0.14;

// A blink band growing from eyelid line `ln` toward the other line `other`: a rect in
// the line's own frame, scaled from 0 (a line, nothing drawn) to 1 (reaching just past
// the midline) about the line itself, with a thin darker strip on its leading edge so
// the lid reads as a lid closing rather than a flat disc (the two edges meet as one
// line when the eye is shut). Base transform scale(1 0), so any renderer that ignores
// the animation draws no lid.
function lidBand(ln, other, color, edge, anim) {
  var dx = ln[1][0] - ln[0][0], dy = ln[1][1] - ln[0][1], len = Math.sqrt(dx * dx + dy * dy);
  var ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  var side = (other[0][0] - ln[0][0]) * nx + (other[0][1] - ln[0][1]) * ny;
  var reach = Math.abs(side) / 2 + 2, ext = 40;
  var ang = Math.atan2(uy, ux) * 180 / Math.PI;
  return '<g transform="translate(' + f3(ln[0][0]) + ' ' + f3(ln[0][1]) + ') rotate(' + f3(ang) + ')">' +
    '<g transform="scale(1 0)">' + anim +
    '<rect x="' + -ext + '" y="' + f3(side < 0 ? -reach : 0) + '" width="' + f3(len + 2 * ext) +
    '" height="' + f3(reach) + '" fill="' + color + '"/>' +
    '<rect x="' + -ext + '" y="' + f3(side < 0 ? -reach : reach - 4) + '" width="' + f3(len + 2 * ext) +
    '" height="4" fill="' + edge + '"/></g></g>';
}

function aliveLoop(cfg, v) {
  var rig = cfg.motion;
  var L = clamp(Math.round(num(v.loop, 8)), 4, 20);
  var e = clamp(num(v.energy, 60), 0, 100) / 60;          // 1 at the default liveliness
  // loopMs rides on the scene as data-clip-ms, so the export bar's Duration follows one loop.
  var mo = { on: true, end: '</g>', loop: L, loopMs: L * 1000 };

  // Eye moves are quick and the head's are slower; both shrink on a short loop so the
  // poses still get time to hold.
  var sac = Math.min(0.3, 0.04 * L), turn = Math.min(0.7, 0.09 * L), lag = Math.min(0.06, 0.01 * L);
  var reach = 0.55 + 0.45 * Math.min(e, 1.4);             // how far the eyes travel
  var gaze = [[0, pupilOffset(cfg, v, 0, 0)]], head = [[0, [0]]];
  for (var i = 1; i < GAZE.length; i++) {
    var at = GAZE[i][0] * L, prev = gaze[gaze.length - 1][1];
    var to = pupilOffset(cfg, v, GAZE[i][1] * reach * rig.snout, GAZE[i][2] * reach);
    gaze.push([at - sac, prev], [at, to]);
    var hPrev = head[head.length - 1][1];
    var hTo = [HEAD_LIFT[i] * rig.headAmp * e * rig.lift];
    head.push([at - sac + lag, hPrev], [at - sac + lag + turn, hTo]);
  }
  gaze.push([L, gaze[gaze.length - 1][1]]);
  head.push([L, head[head.length - 1][1]]);
  // A non-additive translate REPLACES the pupil's baked translate for the whole loop;
  // its first value is that same translate, so frame 0 is the still.
  mo.pupil = smil('translate', easedKeys(gaze, L), L, pairFmt, false);
  if (cfg.head) {
    var hp = cfg.head.pivot, hm = cfg.head.mirror ? -1 : 1;
    mo.head = smil('rotate', easedKeys(head.map(function (s) { return [s[0], [s[1][0] * hm]]; }), L), L, rotFmt(hp), true);
  }

  // Blinks, as one band per eyelid line (see lidBand).
  if (rig.lids && !cfg.noBlink) {
    var lb = [[0, [1, 0]]];
    BLINKS.forEach(function (b) {
      var t0 = b * L;
      lb.push([t0, [1, 0]], [t0 + BLINK_CLOSE, [1, 1]], [t0 + BLINK_CLOSE + BLINK_HOLD, [1, 1]],
        [t0 + BLINK_CLOSE + BLINK_HOLD + BLINK_OPEN, [1, 0]]);
    });
    lb.push([L, [1, 0]]);
    var blink = smil('scale', easedKeys(lb, L), L, scaleFmt, false);
    var lids = rig.lids;
    mo.lids = '<g clip-path="url(#' + lids.clip + ')"' + (lids.tf ? ' transform="' + lids.tf + '"' : '') + '>' +
      lidBand(lids.a, lids.b, lids.color, lids.edge, blink) + lidBand(lids.b, lids.a, lids.color, lids.edge, blink) + '</g>';
  }

  // Breathing: a slight swell about where the body rests, about one breath per 4 s.
  // An SMIL scale is about the origin, so it is stacked between two constant
  // translates (additive="sum" composes them in document order).
  if (rig.breath) {
    var bp = rig.breath, bc = cyclesIn(2, L);
    var swell = periodicKeys(function (phase) {
      var s = (1 - Math.cos(2 * Math.PI * bc * phase)) / 2;
      return [1 + 0.008 * e * s, 1 + 0.018 * e * s];
    }, L);
    var hold = function (x, y) { return smil('translate', { times: [0, 1], vals: [[x, y], [x, y]] }, L, pairFmt, true); };
    mo.breath = '<g class="gk-breath">' + hold(bp[0], bp[1]) + smil('scale', swell, L, scaleFmt, true) + hold(-bp[0], -bp[1]);
  }

  // The scene moves under the Geeko: the curious branch sways, the dangling body swings.
  var big = rig.sway || rig.swing;
  if (big) {
    var bcyc = cyclesIn(big.k, L), bamp = big.amp * e;
    mo.sway = smil('rotate', periodicKeys(function (phase) {
      var a = 2 * Math.PI * bcyc * phase;
      return [bamp * (0.75 * Math.sin(a) + 0.25 * Math.sin(2 * a))];
    }, L), L, rotFmt(big.pivot), true);
  }
  if (rig.leaves) {
    Object.keys(rig.leaves).forEach(function (key) {
      var lf = rig.leaves[key];
      mo[key] = '<g class="gk-' + key + '">' +
        smil('rotate', periodicKeys(wobble(lf.amp * e, cyclesIn(lf.k, L), lf.ph), L), L, rotFmt(lf.pivot), true);
    });
  }
  if (rig.tail && cfg.tail) {
    mo.tail = smil('rotate', periodicKeys(wobble(rig.tail.amp * e, cyclesIn(rig.tail.k, L), rig.tail.ph), L), L,
      rotFmt(cfg.tail.pivot), true);
  }
  if (rig.legs) {
    Object.keys(rig.legs).forEach(function (key) {
      var leg = rig.legs[key], joint = cfg[key];
      if (!joint) return;
      var lc = cyclesIn(leg.k, L), la = leg.amp * e * (joint.mirror ? -1 : 1);
      mo[key] = smil('rotate', periodicKeys(function (phase) {
        return [la * Math.sin(2 * Math.PI * lc * phase)];
      }, L), L, rotFmt(joint.pivot), true);
    });
  }
  return mo;
}

function onInit(ctx) { return compute(ctx.model); }
function onInput(ctx) { return compute(ctx.model); }

function beforeExport(ctx) {
  // JPG & CMYK-TIFF have no alpha: fill any letterboxing with the scene colour so
  // there are no transparent/black margins. SVG & PDF carry the scene's own rect.
  if (ctx.format === 'jpg' || ctx.format === 'jpeg' || ctx.format === 'cmyk-tiff') {
    ctx.opts.background = _bg;
  }
}
