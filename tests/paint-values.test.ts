import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { loadTool } from '../../../engine/src/loader.ts';
import { createRuntime } from '../../../engine/src/runtime.ts';
import { hydrate } from '../../../engine/src/template.ts';
import { baseHost } from '../../../tests/helpers/host.ts';

const tools = new URL('../tools/', import.meta.url);
const fetchFile = (path: string) => readFile(new URL(path, tools), 'utf8');
const text = {
  preload: async () => {},
  toPath: async () => ({ d: 'M0 0H10V10Z', advanceWidth: 10, bbox: { x1: 0, y1: -10, x2: 10, y2: 0 } }),
};

test('lockup hooks retain supported backgrounds and omit invalid paint', async () => {
  const tool = await loadTool('brand-lockup', fetchFile);
  const source = await readFile(new URL('brand-lockup/hooks.js', tools), 'utf8');
  const host = baseHost({ text });
  for (const background of ['invalid " paint', 'url(paint.svg)', 'rgb(nope)', '#abc', 'rgba(1, 2, 3, 0.5)', 'transparent']) {
    const hook = new Function('host', source + '\nreturn { onInit };')(host);
    const model = tool.manifest.inputs.map(input => ({ ...input, value: input.id === 'background' ? background : input.default }));
    const result = await hook.onInit({ model, host });
    if (background === '#abc' || background.startsWith('rgba')) assert.ok(result.inner.includes(`fill="${background}"`));
    else assert.ok(!result.inner.startsWith('<rect'));
  }
  const runtime = await createRuntime(tool, host, { background: 'invalid " paint' });
  assert.ok(!runtime.getHydrated().includes('invalid'));
});

test('ad images use an image MIME without response parameters', async () => {
  const source = await readFile(new URL('digi-ad/hooks.js', tools), 'utf8');
  const dom = new JSDOM('<!doctype html>');
  const blob = new dom.window.Blob(['image bytes'], { type: 'image/png; profile="sample"' });
  const hook = new Function('host', 'fetch', 'FileReader', 'Blob', source + '\nreturn { inlineAsset };')(
    baseHost(), async () => ({ blob: async () => blob }), dom.window.FileReader, dom.window.Blob,
  );
  const url = await hook.inlineAsset('asset:sample');
  assert.match(url, /^data:image\/png;base64,[a-zA-Z0-9+/=]+$/);
  const nonImage = new dom.window.Blob(['plain bytes'], { type: 'text/plain' });
  const other = new Function('host', 'fetch', 'FileReader', 'Blob', source + '\nreturn { inlineAsset };')(
    baseHost(), async () => ({ blob: async () => nonImage }), dom.window.FileReader, dom.window.Blob,
  );
  assert.equal(await other.inlineAsset('asset:other'), '');
  dom.window.close();
});

test('ad scene styles are escaped in the hydrated markup', async () => {
  const tool = await loadTool('digi-ad', fetchFile);
  const source = await readFile(new URL('digi-ad/hooks.js', tools), 'utf8');
  const reader = new JSDOM('<!doctype html>');
  const blob = new reader.window.Blob(['image bytes'], { type: 'image/png; profile="sample"' });
  const host = baseHost();
  const hook = new Function('host', 'fetch', 'FileReader', 'Blob', source + '\nreturn { onInit };')(
    host, async () => ({ blob: async () => blob }), reader.window.FileReader, reader.window.Blob,
  );
  const model = tool.manifest.inputs.map(input => ({ ...input, value: input.id === 'scenes'
    ? [{ kind: 'title', bgColor: '#123456', headline: 'Example', image: { url: 'asset:sample' } }]
    : input.default,
  }));
  const values = await hook.onInit({ model, host });
  const html = hydrate(tool.template, values);
  const dom = new JSDOM(html);
  const scene = dom.window.document.querySelector('.dg-scene')! as HTMLElement;
  assert.equal(scene.style.backgroundColor, 'rgb(18, 52, 86)');
  assert.match(scene.style.backgroundImage, /^url\("?data:image\/png;base64,/);
  assert.deepEqual(scene.getAttributeNames(), ['class', 'style']);
  assert.equal(dom.window.document.querySelector('.dg-headline')!.textContent, 'Example');
  dom.window.close();
  reader.window.close();
});
