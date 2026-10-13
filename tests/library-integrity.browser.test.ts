// SPDX-License-Identifier: MPL-2.0
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import test from 'node:test';
import { chromium } from 'playwright';
import type { Browser } from 'playwright';
import { resolveVerifiedToolReferences } from '../../../shells/web/src/catalog/tool-references.ts';
import { CATALOG_SIG_ALG, signCatalogEnvelope } from '../../../engine/src/catalog-integrity.ts';
import { loadTool } from '../../../engine/src/loader.ts';
import { catalogToolFiles } from '../../../scripts/materialize-catalog-delivery.ts';

const pack = new URL('../', import.meta.url);
const executablePath = process.env.LOLLY_BROWSER_PATH || chromium.executablePath();
const revision = 'b'.repeat(16);
const libraries = [
  { id: '3d', file: 'lib/three.min.js', global: 'LollyThreeGpu' },
  { id: 'susecon-background', file: 'lib/orb.js', global: 'SuseconOrb' },
];

async function listen(server: Server): Promise<number> {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return address.port;
}

test('authored library requests execute matching bytes and refuse changed bytes', {
  skip: existsSync(executablePath) ? false : 'set LOLLY_BROWSER_PATH to an installed browser', timeout: 60_000,
}, async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const envelope = await signCatalogEnvelope({
    alg: CATALOG_SIG_ALG, keyId: 'fixture', signedAt: '2026-10-13T00:00:00.000Z',
    indexHash: 'a'.repeat(64), files: catalogToolFiles(new URL('tools', pack).pathname),
    toolDirs: Object.fromEntries(libraries.map(({ id }) => [id, 'b'.repeat(64)])),
  }, pair.privateKey);
  let changed = false;
  const requests: string[] = [];
  const server = createServer((req, res) => {
    const library = libraries.find(({ id, file }) => req.url === `/tools/${id}@${revision}/${file}`);
    if (!library) { res.writeHead(404); res.end(); return; }
    requests.push(req.url!);
    const bytes = readFileSync(new URL(`tools/${library.id}/${library.file}`, pack));
    res.writeHead(200, { 'content-type': 'text/javascript', 'access-control-allow-origin': '*', 'cache-control': 'no-store' });
    res.end(changed ? Buffer.concat([bytes, Buffer.from('\n/* updated bytes */\n')]) : bytes);
  });
  const port = await listen(server);
  const assetOrigin = `http://127.0.0.1:${port}`;
  const pageServer = createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<main id="tool"></main>'); });
  const pagePort = await listen(pageServer);
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ executablePath, headless: true });
    for (const library of libraries) {
      const tool = await loadTool(library.id, async path => readFileSync(new URL(`tools/${path}`, pack), 'utf8'),
        { integrity: { envelope, publicKey: pair.publicKey } });
      const source = resolveVerifiedToolReferences(tool.template, envelope, path => assetOrigin + path);
      const template = source
        .replace('{{{_state}}}', JSON.stringify({ modelUrl: '/missing.glb', width: 2, height: 2 }))
        .replace('{{{svgContent}}}', '<div class="sb-host" data-sb=\'{"base":{}}\'></div>');
      for (changed of [false, true]) {
        const context = await browser.newContext();
        const page = await context.newPage();
        const path = `/tools/${library.id}@${revision}/${library.file}`;
        try {
          await page.goto(`http://127.0.0.1:${pagePort}`);
          await page.evaluate(html => {
            const events: { type: string; src: string; integrity: string; crossOrigin: string }[] = [];
            Object.assign(window, { libraryEvents: events });
            for (const type of ['load', 'error']) document.addEventListener(type, event => {
              const tag = event.target;
              if (tag instanceof HTMLScriptElement && tag.src) events.push({ type, src: tag.src, integrity: tag.integrity, crossOrigin: tag.crossOrigin || '' });
            }, true);
            const host = document.getElementById('tool')!;
            host.innerHTML = html;
            for (const old of host.querySelectorAll('script:not([type="application/json"])')) {
              const fresh = document.createElement('script');
              fresh.textContent = old.textContent;
              old.replaceWith(fresh);
            }
          }, template);
          await page.waitForFunction(({ path, expected }) => {
            const events = (window as unknown as { libraryEvents: { type: string; src: string }[] }).libraryEvents;
            return events.some(event => event.src.endsWith(path) && event.type === expected);
          }, { path, expected: changed ? 'error' : 'load' });
          const result = await page.evaluate(name => ({
            loaded: !!(window as unknown as Record<string, unknown>)[name],
            events: (window as unknown as { libraryEvents: { integrity: string; crossOrigin: string; src: string }[] }).libraryEvents,
          }), library.global);
          assert.equal(result.loaded, !changed);
          const event = result.events.find(item => item.src.endsWith(path));
          assert.ok(event);
          assert.match(event.integrity, /^sha384-[A-Za-z0-9+/]{64}$/);
          assert.equal(event.crossOrigin, 'anonymous');
          assert.ok(requests.includes(path));
          if (changed && library.id === 'susecon-background') {
            assert.equal(await page.locator('[data-export-error]').count(), 1);
          }
        } finally { await context.close(); }
      }
    }
  } finally {
    await browser?.close();
    await Promise.all([new Promise<void>(resolve => server.close(() => resolve())), new Promise<void>(resolve => pageServer.close(() => resolve()))]);
  }
});
