// SPDX-License-Identifier: MPL-2.0
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadTool } from '../../../engine/src/loader.ts';
import { CATALOG_SIG_ALG, sha256Hex, signCatalogEnvelope } from '../../../engine/src/catalog-integrity.ts';
import { catalogToolFiles } from '../../../scripts/materialize-catalog-delivery.ts';
import { resolveVerifiedToolReferences } from '../../../shells/web/src/catalog/tool-references.ts';

const pack = new URL('../', import.meta.url);
const libraries = [
  { id: '3d', file: 'lib/three.min.js' },
  { id: 'susecon-background', file: 'lib/orb.js' },
];

for (const { id, file } of libraries) {
  test(`${id} library pin matches the exact shipped bytes`, () => {
    const source = readFileSync(new URL(`tools/${id}/template.html`, pack), 'utf8');
    const bytes = readFileSync(new URL(`tools/${id}/${file}`, pack));
    const digest = 'sha384-' + createHash('sha384').update(bytes).digest('base64');
    const pins = [...source.matchAll(/\w+\.integrity = '([^']+)'/g)].map(match => match[1]);
    assert.deepEqual(pins, [digest]);
    assert.match(source, /\.crossOrigin = 'anonymous'/);
    assert.notEqual('sha384-' + createHash('sha384').update(Buffer.concat([bytes, Buffer.from('\n')])).digest('base64'), digest);
  });
}

test('signed original templates bind library pins before reference resolution', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const files = catalogToolFiles(new URL('tools', pack).pathname);
  const envelope = await signCatalogEnvelope({
    alg: CATALOG_SIG_ALG, keyId: 'fixture', signedAt: '2026-10-13T00:00:00.000Z',
    indexHash: 'a'.repeat(64), files,
    toolDirs: Object.fromEntries(libraries.map(({ id }) => [id, 'b'.repeat(64)])),
  }, pair.privateKey);
  for (const { id, file } of libraries) {
    const fetch = async (path: string) => readFileSync(new URL(`tools/${path}`, pack), 'utf8');
    const tool = await loadTool(id, fetch, { integrity: { envelope, publicKey: pair.publicKey } });
    const original = tool.template;
    assert.equal(files[`${id}/template.html`], await sha256Hex(new TextEncoder().encode(original)));
    assert.equal(files[`${id}/${file}`], await sha256Hex(readFileSync(new URL(`tools/${id}/${file}`, pack))));
    const resolved = resolveVerifiedToolReferences(original, envelope);
    assert.ok(resolved.includes(`/tools/${id}@${'b'.repeat(16)}/${file}`));
    assert.deepEqual(resolved.match(/sha384-[A-Za-z0-9+/=]+/g), original.match(/sha384-[A-Za-z0-9+/=]+/g));
    await assert.rejects(loadTool(id, async path => {
      const source = await fetch(path);
      return path === `${id}/template.html` ? source.replace(/sha384-[A-Za-z0-9+/=]+/, 'sha384-invalid') : source;
    }, { integrity: { envelope, publicKey: pair.publicKey } }), /catalog integrity/);
  }
});
