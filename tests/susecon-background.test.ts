// SUSECON background tool contract tests.
//
// Lives in the private SUSE pack beside the tool, so the look descriptions stay
// out of the public repo. `pnpm test` does not collect this directory; run it
// from the repo root with:
//   node --test brands/suse/tests/susecon-background.test.ts
//
// Covers the hooks (sanitising, colourway resolution, the config the template
// mounts) through the real engine loader and runtime, and the renderer's pure
// timeline (lib/orb.js) without a GPU: loop closure, continuity and the wipe.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadTool } from '../../../engine/src/loader.ts';
import { createRuntime } from '../../../engine/src/runtime.ts';
import { baseHost } from '../../../tests/helpers/host.ts';

const here = dirname(fileURLToPath(import.meta.url));
const TOOLS = join(here, '..', 'tools');
const TOOL = join(TOOLS, 'susecon-background');
const REPO = join(here, '..', '..', '..');
const fetchFile = (path: string) => readFile(join(TOOLS, path), 'utf8');

const tool: any = await loadTool('susecon-background', fetchFile);
const hooksSource = readFileSync(join(TOOL, 'hooks.js'), 'utf8');
const orbSource = readFileSync(join(TOOL, 'lib', 'orb.js'), 'utf8');

const SUSE: Record<string, string> = {
  pine: '#0c322c', jungle: '#30ba78', mint: '#90ebcd', persimmon: '#fe7c3f', midnight: '#192072',
  waterhole: '#2453ff', fog: '#efefef', white: '#ffffff', teal: '#00bda7', lime: '#a1ef8b', sky: '#7dc6e2',
  lilac: '#e8c1f7', amethyst: '#5d4f99', peach: '#f9cabf', marigold: '#fcb244', rust: '#bd3314',
};
const SPECTRUM = new Set(['teal', 'lime', 'sky', 'lilac', 'amethyst', 'peach', 'marigold', 'rust']);
const tokenHost = {
  tokens: {
    colors: async () => Object.entries(SUSE).map(([k, v]) => ({ ref: `{color.${SPECTRUM.has(k) ? 'spectrum' : 'brand'}.${k}}`, value: v })),
  },
};

/** A fresh, independent copy of the hooks (own palette cache and memo). */
function freshHooks(host: unknown = tokenHost) {
  return new Function('host', hooksSource + '\nreturn { onInit, onInput, hexToOklch };')(host);
}
function model(values: Record<string, unknown>) {
  return tool.manifest.inputs.map((i: any) => {
    let v = Object.hasOwn(values, i.id) ? values[i.id] : i.default;
    if (typeof v === 'string') {
      const m = /^\{color\.(?:brand|spectrum)\.([a-z-]+)\}$/.exec(v);
      if (m) v = SUSE[m[1]];
    }
    return { id: i.id, value: v };
  });
}
async function cfgOf(values: Record<string, unknown>, host?: unknown) {
  const res = await freshHooks(host).onInit({ model: model(values) });
  const m = /data-sb='([^']*)'/.exec(res.svgContent);
  assert.ok(m, 'host carries its config');
  const clip = /data-clip-ms="(\d+)"/.exec(res.svgContent);
  return { cfg: JSON.parse(m![1].replace(/&#39;/g, "'")), clipMs: Number(clip?.[1]), html: res.svgContent as string };
}
const HEX = /^#[0-9a-f]{6}$/;
const ROLES = ['ground', 'ground2', 'deep', 'key', 'core', 'lines', 'flare', 'haze', 'accent'];

// ─── manifest and wire contract ────────────────────────────────────────────

test('manifest loads through the engine and pins the scenes wire order', () => {
  assert.equal(tool.manifest.id, 'susecon-background');
  const scenes = tool.manifest.inputs.find((i: any) => i.id === 'scenes');
  const order = JSON.parse(readFileSync(join(REPO, 'schemas', 'blocks-wire-order.json'), 'utf8'));
  const pinned = order.inputs['susecon-background:scenes'];
  assert.deepEqual(scenes.fields.map((f: any) => f.id), pinned);
});

test('the runtime mounts the tool and hydrates the host + fallback wash', async () => {
  const rt = await createRuntime(tool, baseHost({}), {});
  const html = rt.getHydrated() as string;
  assert.match(html, /class="sb-host"/);
  assert.match(html, /class="sb-wash"/);
  assert.match(html, /data-clip-ms="12000"/);
});

// ─── determinism and sanitising ────────────────────────────────────────────

test('hooks and renderer are deterministic: no Math.random, identical output across loads', async () => {
  assert.ok(!/Math\.random\s*\(/.test(hooksSource), 'hooks.js');
  assert.ok(!/Math\.random\s*\(/.test(orbSource), 'lib/orb.js');
  for (const values of [{}, { colourway: 'random', colourSeed: { seed: 42 } }, { colourway: 'seeds' }, { look: 'cloud', colourway: 'mint', energy: 80 }]) {
    const a = await cfgOf(values);
    const b = await cfgOf(values);
    assert.equal(a.html, b.html);
  }
});

test('enums, numbers, colours and scenes are clamped to their contracts', async () => {
  const { cfg } = await cfgOf({
    look: 'nope', framing: '<script>', colourway: 'x', colourSeed: { seed: -5 }, glow: 900, linework: -3, loop: 0,
    seedDark: 'red;}', placement: { x: 99, y: 'a', zoom: 0 }, speed: 40, energy: -2, bpm: 9999,
    scenes: Array.from({ length: 12 }, () => ({ look: 'bad', colourway: 'bad', framing: 'custom', hold: -1, transition: 99, style: 'zz' })),
  });
  assert.equal(cfg.base.look, 'glass');
  assert.equal(cfg.base.framing, 'full');
  assert.equal(cfg.glow, 1);
  assert.equal(cfg.lines, 0);
  assert.equal(cfg.loop, 2);
  assert.equal(cfg.base.placement.x, 1.5);
  assert.equal(cfg.base.placement.y, 0);
  assert.equal(cfg.base.placement.zoom, 0.3);
  assert.equal(cfg.speed, 8);
  assert.equal(cfg.base.energy, 0);
  assert.equal(cfg.bpm, 180);
  assert.equal(cfg.scenes.length, 8);
  for (const sc of cfg.scenes) {
    assert.equal(sc.framing, 'full');
    assert.equal(sc.style, 'morph');
    assert.equal(sc.hold, 0);
    assert.equal(sc.trans, 20);
  }
  for (const r of ROLES) assert.match(cfg.base.colours[r], HEX, r);
});

test('one scene is a held look; the clip length follows the loop or the scene times', async () => {
  const one = await cfgOf({ loop: 9, scenes: [{ look: 'cloud', colourway: 'same', framing: 'full', hold: 3, transition: 2, style: 'morph' }] });
  assert.deepEqual(one.cfg.scenes, []);
  assert.equal(one.clipMs, 9000);
  const two = await cfgOf({ scenes: [
    { look: 'glass', colourway: 'same', framing: 'full', hold: 3, transition: 2, style: 'morph' },
    { look: 'horizon', colourway: 'amethyst', framing: 'full', hold: 4, transition: 1.5, style: 'wipe' },
  ] });
  assert.equal(two.clipMs, 10500);
  assert.notEqual(two.cfg.scenes[1].colours.ground, two.cfg.scenes[0].colours.ground);
});

// ─── colourways ────────────────────────────────────────────────────────────

test('named themes resolve every role to hex, with dark grounds and lifted cores', async () => {
  const h = freshHooks();
  for (const theme of ['jungle', 'amethyst', 'waterhole', 'persimmon', 'mint']) {
    const { cfg } = await cfgOf({ colourway: theme });
    const c = cfg.base.colours;
    for (const r of ROLES) assert.match(c[r], HEX, `${theme}.${r}`);
    const g = h.hexToOklch(c.ground), core = h.hexToOklch(c.core);
    if (theme === 'mint') { assert.equal(c.light, true); assert.ok(g.l > 0.8); continue; }
    assert.ok(g.l < 0.25, `${theme} ground L ${g.l}`);
    assert.ok(core.l > 0.82, `${theme} core L ${core.l}`);
  }
  // Jungle reproduces the sampled SUSECON hot rim: jungle hue pushed past the palette.
  const { cfg } = await cfgOf({ colourway: 'jungle' });
  const core = h.hexToOklch(cfg.base.colours.core);
  assert.ok(Math.abs(core.h - 157) < 6 && core.c > 0.17, JSON.stringify(core));
});

test('random draws stay in their windows, extrapolate past the palette and vary by seed', async () => {
  const h = freshHooks();
  const keys = new Set<number>();
  for (let seed = 1; seed <= 120; seed++) {
    const { cfg } = await cfgOf({ colourway: 'random', colourSeed: { seed } });
    const c = cfg.base.colours;
    for (const r of ROLES) assert.match(c[r], HEX, `seed ${seed} ${r}`);
    const g = h.hexToOklch(c.ground), k = h.hexToOklch(c.key);
    if (c.light) assert.ok(g.l > 0.8, `seed ${seed} light ground`);
    else assert.ok(g.l >= 0.15 && g.l <= 0.24, `seed ${seed} ground L ${g.l}`);
    assert.ok(k.c > 0.1, `seed ${seed} key chroma ${k.c}`);
    keys.add(Math.round(k.h / 30));
  }
  assert.ok(keys.size >= 5, `glow hues across seeds: ${keys.size} buckets`);
});

test('the palette falls back to SUSE values when the token bridge is missing', async () => {
  const withTokens = await cfgOf({ colourway: 'jungle' });
  const without = await cfgOf({ colourway: 'jungle' }, {});
  assert.deepEqual(without.cfg.base.colours, withTokens.cfg.base.colours);
});

test('my colours: a light dark seed makes a light background', async () => {
  const { cfg } = await cfgOf({ colourway: 'seeds', seedDark: '#eafaf4', seedGlow: '#00bda7', seedAccent: '#fe7c3f' });
  assert.equal(cfg.base.colours.light, true);
  const dark = await cfgOf({ colourway: 'seeds', seedDark: '#192072', seedGlow: '#fe7c3f', seedAccent: '#00bda7' });
  assert.equal(dark.cfg.base.colours.light, false);
});

// ─── renderer timeline (no GPU) ────────────────────────────────────────────

function orb() {
  const win: any = {};
  new Function('window', 'document', orbSource)(win, {});
  return win.SuseconOrb;
}
/** Equal, or a whole number of turns apart (travelling phases keep counting so
    a blend between scenes never sees a wrap; the shader only reads them
    through sin and cos). */
function same(v: number, w: number): boolean {
  const d = Math.abs(v - w), turns = d / (Math.PI * 2);
  return d < 1e-6 || (d > 1 && Math.abs(turns - Math.round(turns)) < 1e-9);
}
function flat(spans: any[]): number[] {
  const out: number[] = [];
  const walk = (v: any) => {
    if (typeof v === 'number') out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.keys(v).sort().forEach((k) => walk(v[k]));
  };
  spans.forEach((sp) => { out.push(sp.x0, sp.x1); walk(sp.s); });
  return out;
}

test('every look closes its loop: the frame at 0 equals the frame at 1', async () => {
  const O = orb();
  for (const look of ['glass', 'fibres', 'cloud', 'horizon', 'split']) {
    const { cfg } = await cfgOf({ look, colourway: 'jungle', motion: 100 });
    const tl = O._buildTimeline(cfg);
    const a = flat(O._frameAt(tl, cfg, 0, 16 / 9));
    const b = flat(O._frameAt(tl, cfg, 1, 16 / 9));
    assert.equal(a.length, b.length);
    a.forEach((v, i) => assert.ok(same(v, b[i]), `${look} value ${i}: ${v} vs ${b[i]}`));
  }
});

test('scene timelines are continuous, close their loop, and the wipe moves a seam', async () => {
  const O = orb();
  const scenes = [
    { look: 'glass', colourway: 'same', framing: 'full', hold: 2, transition: 2, style: 'morph' },
    { look: 'horizon', colourway: 'amethyst', framing: 'edge-left', hold: 2, transition: 2, style: 'morph' },
    { look: 'cloud', colourway: 'same', framing: 'full', hold: 2, transition: 1, style: 'wipe' },
  ];
  const { cfg } = await cfgOf({ colourway: 'jungle', motion: 80, scenes });
  const tl = O._buildTimeline(cfg);
  assert.equal(tl.total, 11);
  const first = flat(O._frameAt(tl, cfg, 0, 16 / 9));
  const last = flat(O._frameAt(tl, cfg, 1, 16 / 9));
  first.forEach((v, i) => assert.ok(same(v, last[i]), `loop value ${i}: ${v} vs ${last[i]}`));
  // Continuity: tiny steps never jump, except the strand set swapping at a
  // transition's midpoint (a fade through zero) and the wipe seam.
  const N = 4400;
  let prev = O._frameAt(tl, cfg, 0, 16 / 9);
  for (let j = 1; j <= N; j++) {
    const cur = O._frameAt(tl, cfg, j / N, 16 / 9);
    if (cur.length === 1 && prev.length === 1) {
      const p = prev[0].s, c = cur[0].s;
      for (const key of ['orb', 'cam', 'rim', 'glass', 'beam']) {
        p[key].forEach((v: number, i: number) => assert.ok(Math.abs(v - c[key][i]) < 0.02, `${key}[${i}] jumps at ${j / N}: ${v} -> ${c[key][i]}`));
      }
    }
    prev = cur;
  }
  // Mid-wipe: the cloud's spans end at the seam and the glass begins there.
  const wipe = O._frameAt(tl, cfg, 10.5 / 11, 16 / 9);
  assert.equal(wipe.length, 2);
  assert.ok(Math.abs(wipe[0].x1 - 0.5) < 0.01 && Math.abs(wipe[1].x0 - 0.5) < 0.01, JSON.stringify(wipe.map((s: any) => [s.x0, s.x1])));
});

test('the split look is the same sphere in two states, seamed at 49%', async () => {
  const O = orb();
  const { cfg } = await cfgOf({ look: 'split', colourway: 'jungle' });
  const spans = O._frameAt(O._buildTimeline(cfg), cfg, 0.3, 16 / 9);
  assert.equal(spans.length, 2);
  assert.equal(spans[0].x1, 0.49);
  assert.equal(spans[0].s.sf[0], 1, 'left half is fibres');
  assert.equal(spans[1].s.orb[3], 1, 'right half is glass');
});

test('linework is present and moving in every look that carries it', async () => {
  const O = orb();
  for (const look of ['glass', 'fibres', 'cloud']) {
    const { cfg } = await cfgOf({ look, colourway: 'jungle' });
    const tl = O._buildTimeline(cfg);
    const a = O._frameAt(tl, cfg, 0.1, 16 / 9)[0].s;
    const b = O._frameAt(tl, cfg, 0.35, 16 / 9)[0].s;
    assert.ok(a.sk[1] >= 10, `${look} has ${a.sk[1]} strands`);
    assert.ok(a.sk[2] > 0, `${look} strands visible`);
    const moving = ['rbT', 'rbP', 'rbW1', 'sw2', 'sf', 'sr'].some((k) => a[k].some((v: number, i: number) => Math.abs(v - b[k][i]) > 1e-4));
    assert.ok(moving, `${look} linework animates`);
  }
  const still = await cfgOf({ look: 'glass', colourway: 'jungle', motion: 0 });
  const tl = O._buildTimeline(still.cfg);
  const a = O._frameAt(tl, still.cfg, 0.1, 16 / 9)[0].s;
  const b = O._frameAt(tl, still.cfg, 0.6, 16 / 9)[0].s;
  assert.deepEqual(a.rbT, b.rbT, 'motion 0 holds the linework still');
});

// ─── placement, speed and energy ───────────────────────────────────────────

test('placement moves and scales the orb and what hangs off it, not the light pools', async () => {
  const O = orb();
  for (const look of ['glass', 'fibres', 'cloud', 'horizon']) {
    const plain = await cfgOf({ look, colourway: 'jungle', motion: 0 });
    const moved = await cfgOf({ look, colourway: 'jungle', motion: 0, placement: { x: 0.4, y: -0.1, zoom: 1.5 } });
    const a = O._frameAt(O._buildTimeline(plain.cfg), plain.cfg, 0.2, 16 / 9)[0].s;
    const b = O._frameAt(O._buildTimeline(moved.cfg), moved.cfg, 0.2, 16 / 9)[0].s;
    assert.ok(Math.abs(b.orb[0] - a.orb[0] - 0.4) < 1e-9, `${look} x`);
    assert.ok(Math.abs(b.orb[1] - a.orb[1] + 0.1) < 1e-9, `${look} y`);
    assert.ok(Math.abs(b.orb[2] / a.orb[2] - 1.5) < 1e-9, `${look} zoom`);
    assert.deepEqual(b.pools.map((p: any) => p.v), a.pools.map((p: any) => p.v), `${look} pools stay`);
    if (look === 'horizon') assert.ok(Math.abs(b.refl[1] - (b.orb[1] - b.orb[2])) < 1e-9, 'reflection follows the rim');
    if (look === 'fibres') assert.ok(Math.abs(b.sw[0] - b.orb[1]) < 1e-9, 'fibre guide passes through the orb');
  }
});

test('speed multiplies whole cycles, so every speed still closes the loop', async () => {
  const O = orb();
  for (const speed of [1, 4, 8]) {
    const { cfg } = await cfgOf({ look: 'glass', colourway: 'jungle', speed, energy: 70 });
    const tl = O._buildTimeline(cfg);
    const a = flat(O._frameAt(tl, cfg, 0, 16 / 9));
    const b = flat(O._frameAt(tl, cfg, 1, 16 / 9));
    a.forEach((v, i) => assert.ok(same(v, b[i]), `speed ${speed} value ${i}: ${v} vs ${b[i]}`));
  }
  const slow = await cfgOf({ look: 'glass', colourway: 'jungle', speed: 1 });
  const fast = await cfgOf({ look: 'glass', colourway: 'jungle', speed: 6 });
  const d = (cfg: any) => {
    const tl = O._buildTimeline(cfg);
    const p = O._frameAt(tl, cfg, 0.1, 16 / 9)[0].s, q = O._frameAt(tl, cfg, 0.11, 16 / 9)[0].s;
    return Math.abs(p.rbT[1] - q.rbT[1]) + Math.abs(p.hotA[0] - q.hotA[0]);
  };
  assert.ok(d(fast.cfg) > 3 * d(slow.cfg), 'faster speed moves further per step');
});

test('energy: calm at 0, waves that kick on the beat when high, and a scene can build from calm to active', async () => {
  const O = orb();
  const calm = await cfgOf({ look: 'glass', colourway: 'jungle', energy: 0 });
  const live = await cfgOf({ look: 'glass', colourway: 'jungle', energy: 90, bpm: 120, loop: 12 });
  const at = (cfg: any, u: number) => O._frameAt(O._buildTimeline(cfg), cfg, u, 16 / 9)[0].s;
  assert.deepEqual(at(calm.cfg, 0).act, [0, 0, 0, 0]);
  // 120 bpm over 12 s is 24 beats: a kick peaks 6% into each beat; half a beat later it has gone.
  const onBeat = at(live.cfg, 0.06 / 24), offBeat = at(live.cfg, 0.56 / 24);
  assert.ok(onBeat.act[0] > 0.02, `rim waves on the beat: ${onBeat.act[0]}`);
  assert.ok(onBeat.act[3] > 0.85 && offBeat.act[3] < 0.1, `kick ${onBeat.act[3]} -> ${offBeat.act[3]}`);
  assert.ok(onBeat.act[0] > 1.5 * offBeat.act[0], 'waves swell on the beat');
  assert.ok(onBeat.hotB[0] > at(calm.cfg, 0).hotB[0], 'light kicks');
  // A clip that builds: the energy interpolates through the transition.
  const build = await cfgOf({ colourway: 'jungle', scenes: [
    { look: 'glass', colourway: 'same', framing: 'full', hold: 2, transition: 2, style: 'morph', energy: 0 },
    { look: 'glass', colourway: 'same', framing: 'full', hold: 2, transition: 2, style: 'morph', energy: 100 },
  ] });
  const tl = O._buildTimeline(build.cfg);
  const wave = (u: number) => O._frameAt(tl, build.cfg, u, 16 / 9)[0].s.act[1];
  assert.equal(wave(1 / 8), 0, 'first scene is calm');
  assert.ok(wave(5 / 8) > 0, 'second scene is active');
});

// ─── light motion ──────────────────────────────────────────────────────────

test('light motion: orbit turns the pools, shade and beam on the frame ellipse and closes the loop', async () => {
  const O = orb();
  const ex = 16 / 9 / 2;
  const { cfg } = await cfgOf({ look: 'cloud', colourway: 'jungle', lightMotion: 'orbit', lightSpeed: 2, motion: 0 });
  const tl = O._buildTimeline(cfg);
  const at = (u: number) => O._frameAt(tl, cfg, u, 16 / 9)[0].s;
  const s0 = at(0), sq = at(0.125);
  // Two turns per loop: an eighth of the loop is a quarter turn.
  assert.ok(Math.abs(sq.beamR - Math.PI / 2) < 1e-9, `beam angle ${sq.beamR}`);
  const norm = (p: any) => Math.hypot(p.v[0] / ex, p.v[1] / 0.5);
  s0.pools.forEach((p: any, i: number) => {
    if (!p.v[3]) return;
    assert.ok(Math.abs(norm(p) - norm(sq.pools[i])) < 1e-9, `pool ${i} stays on its ellipse`);
    assert.ok(Math.hypot(p.v[0] - sq.pools[i].v[0], p.v[1] - sq.pools[i].v[1]) > 0.05, `pool ${i} moved`);
  });
  assert.ok(Math.abs(sq.hotA[0] - s0.hotA[0] - Math.PI / 2) < 1e-9, 'highlights follow the light');
  const a = flat(O._frameAt(tl, cfg, 0, 16 / 9)), b = flat(O._frameAt(tl, cfg, 1, 16 / 9));
  a.forEach((v, i) => assert.ok(same(v, b[i]), `orbit loop value ${i}: ${v} vs ${b[i]}`));
});

test('light motion: still holds the pools, sweep returns, swirl turns neighbours apart, follow can be off', async () => {
  const O = orb();
  const frame = async (values: Record<string, unknown>, u: number) => {
    const { cfg } = await cfgOf({ look: 'glass', colourway: 'jungle', ...values });
    return O._frameAt(O._buildTimeline(cfg), cfg, u, 16 / 9)[0].s;
  };
  const still0 = await frame({ lightMotion: 'still' }, 0.1), still1 = await frame({ lightMotion: 'still' }, 0.6);
  assert.deepEqual(still0.pools.map((p: any) => p.v.slice(0, 2)), still1.pools.map((p: any) => p.v.slice(0, 2)));
  const sweepA = await frame({ lightMotion: 'sweep', lightSwing: 90 }, 0.25);
  assert.ok(Math.abs(sweepA.beamR - Math.PI / 2) < 1e-9, `sweep peaks at its swing: ${sweepA.beamR}`);
  const sw = await frame({ lightMotion: 'swirl' }, 0.2);
  assert.ok(Math.abs(sw.pools[0].sh[2] + sw.pools[1].sh[2]) < 1e-9, 'neighbouring lights turn in opposite directions');
  const fixedHot = await frame({ lightMotion: 'orbit', highlightsFollow: false, motion: 0 }, 0.3);
  const base = await frame({ lightMotion: 'still', motion: 0 }, 0.3);
  assert.deepEqual(fixedHot.hotA, base.hotA, 'highlights stay put when follow is off');
});

// ─── colour blending ───────────────────────────────────────────────────────

test('colour blending: vivid by default, sanitised, and passed to the renderer', async () => {
  assert.equal((await cfgOf({})).cfg.blend, 'vivid');
  assert.equal((await cfgOf({ blend: 'muddy' })).cfg.blend, 'vivid');
  const s = await cfgOf({ blend: 'srgb', hueRoute: 'long' });
  assert.equal(s.cfg.blend, 'srgb');
  assert.equal(s.cfg.hue, 'long');
  const drawCall = orbSource.split('\n').find((l) => l.includes('r.draw(frameAt('));
  assert.ok(drawCall && drawCall.includes('{ mode: cfg.blend, hue: cfg.hue }'), String(drawCall));
});

test('colour blending: vivid keeps chroma through the middle where smooth and sRGB lose it', () => {
  const O = orb();
  const a = O._rgbToLab('#fcb244'), b = O._rgbToLab('#5d4f99'); // marigold to amethyst
  const chroma = (lab: number[]) => Math.hypot(lab[1], lab[2]);
  const ends = Math.min(chroma(a), chroma(b));
  const vivid = O._lerpColour(a, b, 0.5, { mode: 'vivid', hue: 'short' });
  const smooth = O._lerpColour(a, b, 0.5, { mode: 'smooth' });
  const srgb = O._lerpColour(a, b, 0.5, { mode: 'srgb' });
  assert.ok(chroma(vivid) >= 0.95 * ends, `vivid mid chroma ${chroma(vivid)} vs ends ${ends}`);
  assert.ok(chroma(smooth) < 0.6 * chroma(vivid), `smooth greys out: ${chroma(smooth)}`);
  assert.ok(chroma(srgb) < 0.6 * chroma(vivid), `sRGB greys out: ${chroma(srgb)}`);
  // The long way only applies between clearly different hues.
  const navy = O._rgbToLab('#191335'), navy2 = O._rgbToLab('#0b0a24');
  const near = O._lerpColour(navy, navy2, 0.5, { mode: 'vivid', hue: 'long' });
  const hue = (lab: number[]) => Math.atan2(lab[2], lab[1]);
  const dh = Math.abs(((hue(near) - hue(navy) + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI);
  assert.ok(dh < 0.6, `near hues stay near: ${dh}`);
});
