// SPDX-License-Identifier: MPL-2.0
// Focused tests for tool.mjs and the workflow's security shape.
// Run: node --test .github/lolly-ing-preview/tool.test.mjs
// Optional: LOLLY_WORK_DIR=<lolly-work checkout> also checks the boot config
// against Work's own config parser and startup checks.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { after, describe, test } from 'node:test';
import * as tool from './tool.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKFLOW = readFileSync(join(HERE, '../workflows/lolly-ing-preview.yml'), 'utf8');
const temp = mkdtempSync(join(tmpdir(), 'lolly-ing-preview-test-'));
after(() => rmSync(temp, { recursive: true, force: true }));
let n = 0;
const dir = (name = 'd') => { const path = join(temp, `${name}-${++n}`); mkdirSync(path, { recursive: true }); return path; };
const put = (root, rel, content) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), content); };

const L = 'a'.repeat(40), W = 'b'.repeat(40), S = 'c'.repeat(40);
const freshPin = () => {
  const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  return { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y };
};
const RELEASE_JWK = { kty: 'EC', crv: 'P-256', ...tool.RELEASE_PUBLIC };

describe('inputs and pin', () => {
  test('accepts three full SHAs and an optional floor', () => {
    assert.deepEqual(tool.checkInputs({ LSHA: L, WSHA: W, SSHA: S }), { lsha: L, wsha: W, ssha: S, minSeq: null });
    assert.equal(tool.checkInputs({ LSHA: L, WSHA: W, SSHA: S, MIN_SEQ: '3009' }).minSeq, 3009);
  });
  test('refuses short, uppercase or injected SHAs and a bad floor', () => {
    for (const bad of ['abc', L.toUpperCase(), `${L.slice(0, 39)};`, `${L}\n`, 'main']) {
      assert.throws(() => tool.checkInputs({ LSHA: bad, WSHA: W, SSHA: S }), tool.Refusal);
    }
    for (const bad of ['0', '-1', '1.5', '01', 'x', '99999999999999999']) {
      assert.throws(() => tool.checkInputs({ LSHA: L, WSHA: W, SSHA: S, MIN_SEQ: bad }), tool.Refusal);
    }
  });
  test('the release key thumbprint constant is the RFC 7638 thumbprint of its public half', () => {
    assert.equal(tool.thumbprint(RELEASE_JWK), tool.RELEASE_THUMBPRINT);
  });
  test('refuses the release pin in any spelling', () => {
    assert.throws(() => tool.parsePin(JSON.stringify(RELEASE_JWK)), /release key/);
    assert.throws(() => tool.parsePin(JSON.stringify({ ...RELEASE_JWK, kid: 'other' })), /release key/);
  });
  test('refuses the lolly.tools preview key', () => {
    const pin = { kty: 'EC', crv: 'P-256', x: 'IeLSk-4i--bwu4VU0lZerw6m-RtnUN5kb1aUVBSfHnU',
      y: 'w6mzJvJ7TogpxQMuysRzB7533aKXg45YFX-0AzKx4Jo' };
    assert.equal(tool.thumbprint(pin), tool.TOOLS_PREVIEW_THUMBPRINT);
    assert.throws(() => tool.parsePin(JSON.stringify(pin)), /lolly.tools preview key/);
    assert.throws(() => tool.parsePin(JSON.stringify({ ...pin, kid: 'other' })), /lolly.tools preview key/);
  });
  test('accepts a fresh public key and returns the canonical pin', () => {
    const pin = freshPin();
    const parsed = tool.parsePin(JSON.stringify({ ...pin, alg: 'ES256', use: 'sig' }));
    assert.deepEqual(parsed.pin, pin);
    assert.equal(parsed.json, JSON.stringify(pin));
    assert.equal(parsed.thumbprint, tool.thumbprint(pin));
  });
  test('refuses private material, other curves, unknown members and points off the curve', () => {
    const pin = freshPin();
    assert.throws(() => tool.parsePin(JSON.stringify({ ...pin, d: pin.x })), /private key material/);
    assert.throws(() => tool.parsePin(JSON.stringify({ ...pin, crv: 'P-384' })), /P-256/);
    assert.throws(() => tool.parsePin(JSON.stringify({ ...pin, p: 'x' })), /unexpected members/);
    assert.throws(() => tool.parsePin(JSON.stringify({ ...pin, y: pin.x })), /not a point|P-256/);
    assert.throws(() => tool.parsePin(''), /not set/);
  });
});

describe('gate', () => {
  const env = { LSHA: L, WSHA: W, SSHA: S, GITHUB_SHA: S, GITHUB_REPOSITORY: 'lolly-tools/suse-lolly', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main', GITHUB_TOKEN: 't', GITHUB_RUN_ATTEMPT: '1', GITHUB_ACTOR: 'ndftz', TRIGGERING_ACTOR: 'ndftz' };
  const run = (repo, sha, extra = {}) => ({ id: 100, run_attempt: 1, head_sha: sha, path: '.github/workflows/ci.yml', event: 'push', head_branch: 'main',
    status: 'completed', conclusion: 'success', repository: { full_name: repo }, head_repository: { full_name: repo }, ...extra });
  const routes = (overrides = {}) => ({
    [`/repos/lolly-tools/lolly/compare/main...${L}?per_page=1`]: { status: 'behind', behind_by: 3, merge_base_commit: { sha: L } },
    [`/repos/lolly-tools/lolly-work/compare/main...${W}?per_page=1`]: { status: 'identical', behind_by: 0, merge_base_commit: { sha: W } },
    [`/repos/lolly-tools/suse-lolly/compare/main...${S}?per_page=1`]: { status: 'behind', behind_by: 1, merge_base_commit: { sha: S } },
    [`/repos/lolly-tools/lolly/actions/workflows/ci.yml/runs?head_sha=${L}&event=push&branch=main&per_page=50`]: { workflow_runs: [run('lolly-tools/lolly', L, { conclusion: 'cancelled', id: 99 }), run('lolly-tools/lolly', L)] },
    [`/repos/lolly-tools/lolly-work/actions/workflows/ci.yml/runs?head_sha=${W}&event=push&branch=main&per_page=50`]: { workflow_runs: [run('lolly-tools/lolly-work', W, { id: 200, run_attempt: 2 })] },
    [`/repos/lolly-tools/lolly-work/contents/vendor/lolly?ref=${W}`]: { type: 'submodule', sha: L },
    [`/repos/lolly-tools/lolly-work/contents/engine-pin.json?ref=${W}`]: { type: 'file', encoding: 'base64', size: 60, content: Buffer.from(JSON.stringify({ generatedFrom: L, engine: { version: '1.281.0' } })).toString('base64') },
    [`/repos/lolly-tools/lolly/contents/brands/suse?ref=${L}`]: { type: 'submodule', sha: 'd'.repeat(40) },
    ...overrides,
  });
  const fakeFetch = (table, seen = []) => async (url, init) => {
    const path = url.replace('https://api.github.com', '');
    seen.push({ path, auth: init.headers.authorization });
    if (!(path in table)) return { status: 404, json: async () => ({}) };
    const value = table[path];
    if (value instanceof Error) throw value;
    if (typeof value === 'number') return { status: value, json: async () => ({}) };
    return { status: 200, json: async () => value };
  };
  const noSleep = async () => {};

  test('records ancestry, the newest green push run of each repository and the engine pin', async () => {
    const seen = [];
    const record = await tool.gate(env, fakeFetch(routes(), seen), noSleep);
    assert.deepEqual(record.sources, { lolly: L, work: W, suse: S });
    assert.deepEqual(record.ci.lolly, { id: 100, attempt: 1, url: null, updatedAt: null });
    assert.equal(record.ci.work.attempt, 2);
    assert.equal(record.enginePin.generatedFrom, L);
    assert.equal(record.lollySuseGitlink, 'd'.repeat(40));
    assert.ok(seen.every((call) => call.auth === 'Bearer t'));
    assert.ok(seen.every((call) => !/\/(?:git\/refs|dispatches|pulls|merges)/.test(call.path)), 'read-only endpoints only');
  });
  test('refuses a commit that is not on main', async () => {
    const table = routes({ [`/repos/lolly-tools/suse-lolly/compare/main...${S}?per_page=1`]: { status: 'diverged', merge_base_commit: { sha: 'e'.repeat(40) } } });
    await assert.rejects(tool.gate(env, fakeFetch(table), noSleep), /not on lolly-tools\/suse-lolly main/);
  });
  test('refuses when the only push runs were cancelled, or came from another repository', async () => {
    const cancelled = routes({ [`/repos/lolly-tools/lolly/actions/workflows/ci.yml/runs?head_sha=${L}&event=push&branch=main&per_page=50`]: { workflow_runs: [run('lolly-tools/lolly', L, { conclusion: 'cancelled' })] } });
    await assert.rejects(tool.gate(env, fakeFetch(cancelled), noSleep), /no successful/);
    const fork = routes({ [`/repos/lolly-tools/lolly-work/actions/workflows/ci.yml/runs?head_sha=${W}&event=push&branch=main&per_page=50`]: { workflow_runs: [run('lolly-tools/lolly-work', W, { head_repository: { full_name: 'someone/lolly-work' } })] } });
    await assert.rejects(tool.gate(env, fakeFetch(fork), noSleep), /no successful/);
    const otherWorkflow = routes({ [`/repos/lolly-tools/lolly/actions/workflows/ci.yml/runs?head_sha=${L}&event=push&branch=main&per_page=50`]: { workflow_runs: [run('lolly-tools/lolly', L, { path: '.github/workflows/other.yml' })] } });
    await assert.rejects(tool.gate(env, fakeFetch(otherWorkflow), noSleep), /no successful/);
  });
  test('refuses a Work commit whose gitlink or engine pin is not LSHA', async () => {
    const gitlink = routes({ [`/repos/lolly-tools/lolly-work/contents/vendor/lolly?ref=${W}`]: { type: 'submodule', sha: 'f'.repeat(40) } });
    await assert.rejects(tool.gate(env, fakeFetch(gitlink), noSleep), /vendors Lolly/);
    const pin = routes({ [`/repos/lolly-tools/lolly-work/contents/engine-pin.json?ref=${W}`]: { type: 'file', encoding: 'base64', size: 60, content: Buffer.from(JSON.stringify({ generatedFrom: 'f'.repeat(40) })).toString('base64') } });
    await assert.rejects(tool.gate(env, fakeFetch(pin), noSleep), /engine-pin.json was generated from/);
  });
  test('refuses a dispatch from another ref, event or repository before any API call', async () => {
    const seen = [];
    await assert.rejects(tool.gate({ ...env, GITHUB_REF: 'refs/heads/feature' }, fakeFetch(routes(), seen), noSleep), /from main/);
    await assert.rejects(tool.gate({ ...env, GITHUB_EVENT_NAME: 'push' }, fakeFetch(routes(), seen), noSleep), /workflow_dispatch/);
    await assert.rejects(tool.gate({ ...env, GITHUB_REPOSITORY: 'someone/suse-lolly' }, fakeFetch(routes(), seen), noSleep), /runs only in/);
    // The deploy command binds the run's head SHA to SSHA, so a dispatch must build main's head.
    await assert.rejects(tool.gate({ ...env, GITHUB_SHA: 'e'.repeat(40) }, fakeFetch(routes(), seen), noSleep), /is not this run's commit/);
    await assert.rejects(tool.gate({ ...env, GITHUB_RUN_ATTEMPT: '2' }, fakeFetch(routes(), seen), noSleep), /fresh private run/);
    await assert.rejects(tool.gate({ ...env, GITHUB_ACTOR: 'other' }, fakeFetch(routes(), seen), noSleep), /dispatched by ndftz/);
    assert.equal(seen.length, 0);
  });
  test('retries server errors and network failures, then refuses', async () => {
    let calls = 0;
    const flaky = async (url, init) => { calls++; if (calls < 3) throw new Error('reset'); return fakeFetch(routes())(url, init); };
    await tool.gate(env, flaky, noSleep);
    const down = fakeFetch(routes({ [`/repos/lolly-tools/lolly/compare/main...${L}?per_page=1`]: 502 }));
    await assert.rejects(tool.gate(env, down, noSleep), /HTTP 502/);
  });
});

describe('source records', () => {
  test('stored formats use the deploy tool anchors and mark missing or ambiguous ones', () => {
    const lolly = dir('lolly');
    put(lolly, 'shells/web/src/bridge/db.ts', 'const DB_VERSION = 7;\n');
    put(lolly, 'shells/web/src/bridge/revision-archive-format.ts', 'export interface RevisionArchive {\n  version: 2;\n}\n');
    put(lolly, 'shells/web/src/collab/join-route.ts', 'export const CHANNEL_MESSAGE_VERSION = 1;\nexport const CHANNEL_MESSAGE_VERSION = 2;\n');
    const { formats, missing } = tool.storedFormats(lolly);
    assert.deepEqual(formats, { channelMessage: null, indexedDb: 7, revisionArchive: 2, session: null });
    assert.deepEqual(missing.sort(), ['channelMessage', 'session']);
  });
  test('migrations are the .sql files in name order with their sha256', () => {
    const migrations = dir('migrations');
    put(migrations, '0002_b.sql', 'b'); put(migrations, '0001_a.sql', 'a'); put(migrations, 'README.md', 'x');
    assert.deepEqual(tool.migrations(migrations), [
      { name: '0001_a.sql', sha256: tool.sha256(Buffer.from('a')) },
      { name: '0002_b.sql', sha256: tool.sha256(Buffer.from('b')) },
    ]);
  });
  test('the build-settings record carries the fixed literals and hashes the CA trust', () => {
    const settings = tool.buildSettings({ CONNECTOR_ORIGINS: '', CA_TRUST: '{"version":1}' }, 'kid');
    assert.equal(settings.liveRelay, 'https://lolly.ing/live');
    assert.equal(settings.connectorOrigins, null);
    assert.equal(settings.caEnrollmentTrustSha256, tool.sha256(Buffer.from('{"version":1}')));
    assert.throws(() => tool.buildSettings({ CA_TRUST: '-----BEGIN PRIVATE KEY-----' }, 'kid'), /public trust/);
  });
});

/** A small signed-looking lolly.ing shell. */
function fakeShell(pin, keyId, { seq = 3, scriptExtra = '', receipt = {} } = {}) {
  const root = dir('shell');
  put(root, 'index.html', '<!doctype html><title>lolly.ing</title>');
  put(root, '_app/main.abc.js', `const pin=${JSON.stringify(JSON.stringify(pin))};fetch("/api/v1/org-config");${scriptExtra}`);
  put(root, '_app/other.def.js', 'export const x = 1;');
  put(root, 'catalog/tools/index.json', '{"tools":[]}');
  put(root, 'catalog/tools/index.sig.json', JSON.stringify({ keyId, seq, toolDirs: {}, files: {} }));
  put(root, 'release-frontend.sig.json', JSON.stringify({ kind: 'lolly-release-frontend', version: 1, source: L, target: 'web', profile: 'suse',
    files: { 'index.html': tool.sha256(readFileSync(join(root, 'index.html'))) }, ...receipt }));
  return root;
}

describe('shell, custody and pack', () => {
  const pin = freshPin(), keyId = tool.thumbprint(pin);
  test('a lolly.ing shell passes and reports its facts', () => {
    const facts = tool.shellCheck({ root: fakeShell(pin, keyId), pin, keyId, lsha: L, minSeq: 2 });
    assert.equal(facts.catalogSeq, 3);
    assert.equal(facts.keyId, keyId);
    assert.equal(facts.scriptsCarryingPin, 1);
  });
  test('refuses the release public key anywhere in the shell', () => {
    const root = fakeShell(pin, keyId, { scriptExtra: `const old="${tool.RELEASE_PUBLIC.x}";` });
    assert.throws(() => tool.shellCheck({ root, pin, keyId, lsha: L }), /release public key/);
  });
  test('refuses a catalog signed by another key, a low sequence, a missing pin or marker', () => {
    assert.throws(() => tool.shellCheck({ root: fakeShell(pin, tool.RELEASE_THUMBPRINT), pin, keyId, lsha: L }), /not the lolly.ing key/);
    assert.throws(() => tool.shellCheck({ root: fakeShell(pin, keyId, { seq: 2 }), pin, keyId, lsha: L, minSeq: 3009 }), /below MIN_SEQ/);
    const other = freshPin();
    assert.throws(() => tool.shellCheck({ root: fakeShell(other, keyId), pin, keyId, lsha: L }), /does not carry|no application script/);
    const noMarker = fakeShell(pin, keyId);
    writeFileSync(join(noMarker, '_app/main.abc.js'), `const pin=${JSON.stringify(JSON.stringify(pin))};`);
    assert.throws(() => tool.shellCheck({ root: noMarker, pin, keyId, lsha: L }), /org-config/);
  });
  test('refuses a receipt for another source or profile', () => {
    assert.throws(() => tool.shellCheck({ root: fakeShell(pin, keyId, { receipt: { source: W } }), pin, keyId, lsha: L }), /receipt/);
    assert.throws(() => tool.shellCheck({ root: fakeShell(pin, keyId, { receipt: { profile: 'lolly-demo' } }), pin, keyId, lsha: L }), /receipt/);
  });
  test('the tree manifest is sorted like Work reads it and refuses links', () => {
    const root = dir('tree');
    for (const rel of ['b.txt', 'a/z.txt', 'a-b/c.txt', 'A.txt', 'a/b/c.txt']) put(root, rel, rel);
    const manifest = tool.treeManifest(root);
    const paths = manifest.files.map((f) => f.path);
    assert.deepEqual(paths, [...paths].sort());
    assert.equal(manifest.totalBytes, manifest.files.reduce((s, f) => s + f.size, 0));
    symlinkSync('b.txt', join(root, 'link'));
    assert.throws(() => tool.treeManifest(root), /link or special/);
  });
  test('custody is deterministic and has the exact shape the pack producer reads', () => {
    const shell = fakeShell(pin, keyId), lolly = dir('lolly');
    put(lolly, 'scripts/verify-release-catalog.ts', '// verifier');
    const one = tool.writeCustody({ root: shell, lolly, lsha: L, pin, outDir: dir('custody') });
    const outDir = dir('custody');
    const two = tool.writeCustody({ root: shell, lolly, lsha: L, pin, outDir });
    assert.equal(one.custodySha256, two.custodySha256);
    const custody = JSON.parse(readFileSync(join(outDir, 'release-custody.json'), 'utf8'));
    assert.deepEqual(Object.keys(custody).sort(), ['lollySource', 'manifest', 'profile', 'publicPin', 'status', 'verifier', 'version']);
    assert.equal(custody.status, 'SIGNED_LOLLY_RELEASE_REVIEWED');
    assert.equal(custody.verifier.path, 'scripts/verify-release-catalog.ts');
    assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(outDir, 'public.jwk.json'), 'utf8'))).sort(), ['crv', 'kty', 'x', 'y']);
    const manifest = JSON.parse(readFileSync(join(outDir, 'final-dist.manifest.json'), 'utf8'));
    assert.deepEqual(Object.keys(manifest).sort(), ['files', 'totalBytes', 'version']);
    put(shell, 'extra.txt', 'changed');
    assert.notEqual(tool.writeCustody({ root: shell, lolly, lsha: L, pin, outDir: dir('custody') }).custodySha256, one.custodySha256);
  });
  test('pack facts need a finished release-mode record and no build envelope', () => {
    const pack = dir('pack');
    put(pack, 'catalog/tools/index.json', '{}');
    put(pack, '.lolly-pack-source.json', JSON.stringify({ version: 2, commit: L, profile: 'suse', derivation: { kind: 'verified-signed-release' } }));
    assert.equal(tool.packFacts(pack, L).files, 2);
    put(pack, 'catalog/tools/index.sig.json', '{}');
    assert.throws(() => tool.packFacts(pack, L), /build envelope/);
    const sourceMode = dir('pack');
    put(sourceMode, 'catalog/tools/index.json', '{}');
    put(sourceMode, '.lolly-pack-source.json', JSON.stringify({ version: 1, commit: L, profile: 'suse' }));
    assert.throws(() => tool.packFacts(sourceMode, L), /release mode/);
  });
  test('tree-perms refuses files a non-root user owns, writable files and links', () => {
    const root = dir('perms');
    put(root, 'a.txt', 'a');
    if (process.getuid?.() !== 0) assert.throws(() => tool.treePerms([root]), /not owned by root/);
    const linked = dir('perms');
    symlinkSync('/etc/hosts', join(linked, 'l'));
    assert.throws(() => tool.treePerms([join(linked, 'l')]), /symbolic link/);
  });
  test('the source envelope must name the lolly.ing key', () => {
    const good = Buffer.from(JSON.stringify({ keyId, seq: 1, files: { 'a/tool.json': 'x' } }));
    assert.equal(tool.envelopeCheck(good, keyId).seq, 1);
    assert.throws(() => tool.envelopeCheck(Buffer.from(JSON.stringify({ keyId: tool.RELEASE_THUMBPRINT, seq: 1, files: { a: 'x' } })), keyId), /not the lolly.ing key/);
  });
});

describe('boot config and smoke', () => {
  const pin = freshPin();
  test('the boot config is lolly.ing shaped, gated, durable and credential free', () => {
    const config = tool.bootConfig({ pin, generation: 5 });
    assert.equal(config.instance.shellDir, '/app/shell');
    assert.equal(config.instance.pack, '/app/packs/lolly-ing');
    assert.equal(config.policy.defaultAccessMode, 'gated');
    assert.equal(config.instance.catalogPublicationGeneration, 5);
    assert.ok(!JSON.stringify(config).match(/secret|password"\s*:\s*"/i));
    assert.throws(() => tool.bootConfig({ pin, generation: 0 }), /positive/);
  });
  test('Work accepts the boot config and its startup checks pass (needs LOLLY_WORK_DIR)', { skip: !process.env.LOLLY_WORK_DIR }, async () => {
    const work = process.env.LOLLY_WORK_DIR;
    const { parseConfig } = await import(pathToFileURL(join(work, 'server/src/config/instance.ts')).href);
    const { startupChecks } = await import(pathToFileURL(join(work, 'server/src/setup/checks.ts')).href);
    const config = parseConfig(JSON.stringify(tool.bootConfig({ pin, generation: 5 })));
    const shell = fakeShell(pin, tool.thumbprint(pin));
    config.instance.shellDir = shell;
    const checks = startupChecks(config, { session: 'x'.repeat(64), link: 'y'.repeat(64) }, true, { NODE_ENV: 'production' });
    const failed = checks.filter((c) => c.status === 'fail');
    assert.deepEqual(failed, []);
    assert.ok(checks.some((c) => c.id === 'web-shell' && c.status === 'pass'));
    assert.ok(checks.some((c) => c.id === 'identity' && c.status === 'pass'));
  });

  const serve = (handler) => new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
  const index = Buffer.from('<!doctype html>');
  const instance = (overrides = {}) => (req, res) => {
    const route = { '/healthz': [200, JSON.stringify({ ok: true, name: 'lolly.ing', accessMode: 'gated' })],
      '/readyz': [200, JSON.stringify({ ok: true, store: 'postgres' })], '/': [200, index], '/info/': [200, 'docs'],
      '/catalog/tools/index.json': [401, '{}'], ...overrides }[req.url] ?? [404, ''];
    res.writeHead(route[0], { 'content-security-policy': "default-src 'self'; script-src 'self' blob:" });
    res.end(route[1]);
  };
  test('passes a healthy gated instance', async () => {
    const { server, base } = await serve(instance());
    try {
      const result = await tool.smoke({ base, indexSha256: tool.sha256(index), sleep: async () => {} });
      assert.equal(result.anonymousCatalog.status, 401);
    } finally { server.close(); }
  });
  test('refuses another index, an open catalog or an instance that never becomes ready', async () => {
    for (const [overrides, pattern, waits] of [
      [{}, /signed index.html/, {}],
      [{ '/catalog/tools/index.json': [200, '{}'] }, /expected 401/, {}],
      [{ '/readyz': [503, '{}'] }, /readyz did not answer 200/, { readyWaitMs: 50 }],
    ]) {
      const { server, base } = await serve(instance(overrides));
      try {
        const sha = pattern.source.includes('signed') ? tool.sha256(Buffer.from('other')) : tool.sha256(index);
        await assert.rejects(tool.smoke({ base, indexSha256: sha, sleep: async () => {}, ...waits }), pattern);
      } finally { server.close(); }
    }
  });
});

describe('OCI facts', () => {
  test('reads digest, config and DiffIDs from an OCI layout tar and checks every blob', async () => {
    const layout = dir('oci');
    const blob = (bytes) => { const digest = tool.sha256(bytes); put(layout, `blobs/sha256/${digest}`, bytes); return `sha256:${digest}`; };
    const layerSrc = dir('layer');
    put(layerSrc, `app/shell/${'x'.repeat(120)}/index.html`, 'hello');
    const layerTar = join(temp, `layer-${++n}.tar`);
    execFileSync('tar', ['-cf', layerTar, '-C', layerSrc, '.']);
    const layerBytes = readFileSync(layerTar);
    const layer = blob(layerBytes);
    const config = blob(Buffer.from(JSON.stringify({ architecture: 'amd64', os: 'linux', rootfs: { type: 'layers', diff_ids: [layer] } })));
    const manifest = blob(Buffer.from(JSON.stringify({ schemaVersion: 2, mediaType: 'application/vnd.oci.image.manifest.v1+json',
      config: { mediaType: 'application/vnd.oci.image.config.v1+json', digest: config, size: 1 },
      layers: [{ mediaType: 'application/vnd.oci.image.layer.v1.tar', digest: layer, size: layerBytes.length }] })));
    put(layout, 'oci-layout', '{"imageLayoutVersion":"1.0.0"}');
    put(layout, 'index.json', JSON.stringify({ schemaVersion: 2, manifests: [{ mediaType: 'application/vnd.oci.image.manifest.v1+json', digest: manifest, size: 1,
      annotations: { 'io.containerd.image.name': 'docker.io/library/lolly-ing-instance:run-1-1' } }] }));
    const archive = join(temp, 'image.oci.tar');
    execFileSync('tar', ['-cf', archive, '-C', layout, '.']);
    const facts = await tool.ociFacts(archive);
    assert.equal(facts.imageDigest, manifest);
    assert.equal(facts.configDigest, config);
    assert.deepEqual(facts.diffIds, [layer]);
    assert.equal(facts.archiveSha256, tool.sha256(readFileSync(archive)));
    assert.ok(tool.tarEntries(layerTar).has(`app/shell/${'x'.repeat(120)}/index.html`), 'long names survive');
    writeFileSync(join(layout, 'blobs/sha256', layer.slice(7)), Buffer.alloc(layerBytes.length));
    const broken = join(temp, 'broken.oci.tar');
    execFileSync('tar', ['-cf', broken, '-C', layout, '.']);
    await assert.rejects(tool.ociFacts(broken), /does not match its digest/);
  });
});

describe('private approval requests', () => {
  const now = 1_800_000_000;
  const migrationsList = [{ name: '0002_b.sql', sha256: '2'.repeat(64) }, { name: '0001_a.sql', sha256: '1'.repeat(64) }];
  const buildBlobs = Object.fromEntries(tool.BUILD_PATHS.map((path) => [path, 'd'.repeat(40)]));
  const env = {
    LSHA: L, WSHA: W, SSHA: S, GITHUB_REPOSITORY: 'lolly-tools/suse-lolly', GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REF: 'refs/heads/main', GITHUB_RUN_ID: '12345', GITHUB_RUN_ATTEMPT: '1', GITHUB_SHA: S,
    PIN_THUMBPRINT: 'k'.repeat(43), MAINTENANCE: 'true', MIN_SEQ: '3010',
  };
  const gateRecord = { version: 1, sources: { lolly: L, work: W, suse: S }, minSeq: 3010 };
  const request = (stage) => ({ ...tool.approvalSpec({ env, stage, gateRecord, migrationsList, buildBlobs,
    artifactSha256: stage === 'final' ? 'f'.repeat(64) : null }),
  nonce: (stage === 'source' ? 'a' : 'b').repeat(64), issuedAt: now - 60, expiresAt: now + 300 });
  const bundle = (stage) => ({ request: request(stage), run: { id: stage === 'source' ? '6789' : '6790', attempt: 1 } });
  test('the private request binds all sources, run, settings and migration bytes', () => {
    const result = request('source');
    assert.deepEqual(result.privateRun, { repository: 'lolly-tools/suse-lolly', id: '12345', attempt: 1, workflowSha: S });
    assert.equal(result.migrationManifest, tool.sha256('lolly-work migration manifest v1\n'
      + `0001_a.sql\t${'1'.repeat(64)}\n0002_b.sql\t${'2'.repeat(64)}\n`));
    assert.equal(result.maintenance, true);
    assert.equal(result.minSeq, '3010');
    assert.equal(result.artifactSha256, null);
    assert.throws(() => tool.migrationManifest([...migrationsList, migrationsList[0]]), /repeated files/);
    assert.throws(() => tool.approvalSpec({ env: { ...env, GITHUB_RUN_ATTEMPT: '2' }, stage: 'source', gateRecord, migrationsList, buildBlobs }), /first attempt/);
    assert.throws(() => tool.approvalSpec({ env, stage: 'final', gateRecord, migrationsList, buildBlobs }), /unsigned frontend hash/);
  });
  test('evidence is accepted only for the exact request digest and pinned reviewer', () => {
    const r = request('source');
    const evidence = { version: 1, requestSha256: tool.approvalRequestDigest(r), stage: 'source', run: { id: '6789', attempt: 1 }, approver: 'ndftz' };
    assert.deepEqual(tool.approvalBundle(r, evidence), bundle('source'));
    assert.throws(() => tool.approvalBundle({ ...r, maintenance: false }, evidence), /another request/);
    assert.throws(() => tool.approvalBundle(r, { ...evidence, approver: 'other' }), /pinned reviewer/);
    assert.throws(() => tool.approvalBundle(r, { ...evidence, run: { id: '6789', attempt: 2 } }), /rerun/);
  });
  test('before key use, the binding rejects another build, stage, artifact or expired request', () => {
    assert.equal(tool.checkApprovalBundle(bundle('source'), { env, stage: 'source', now }).run.id, '6789');
    for (const patch of [{ stage: 'final' }, { sources: { ...request('source').sources, work: 'e'.repeat(40) } },
      { privateRun: { ...request('source').privateRun, id: '999' } }, { pinThumbprint: 'x'.repeat(43) },
      { minSeq: '' }, { maintenance: false }, { expiresAt: now - 1 }, { extra: true }]) {
      const changed = bundle('source'); changed.request = { ...changed.request, ...patch };
      assert.throws(() => tool.checkApprovalBundle(changed, { env, stage: 'source', now }), tool.Refusal);
    }
    assert.throws(() => tool.checkApprovalBundle(bundle('final'), { env, stage: 'final', artifactSha256: 'e'.repeat(64), now }), /another unsigned/);
  });
  test('the private manifest persists both approvals and independently binds the unsigned frontend hash', () => {
    const pin = env.PIN_THUMBPRINT;
    const values = {
      run: { repository: 'lolly-tools/suse-lolly', workflowSha: S, runId: 12345, runAttempt: 1 }, gateRecord,
      server: { imageId: 'sha256:' + '1'.repeat(64) }, sign: {}, shell: { keyId: pin, indexSha256: 'e'.repeat(64), catalogSeq: 3011 },
      pack: {}, oci: { archiveSha256: 'd'.repeat(64), imageDigest: 'sha256:' + 'd'.repeat(64) },
      boot: { readyz: { status: 200 }, index: { sha256: 'e'.repeat(64) } }, migrationsList, storedFormatsRecord: {},
      buildSettings: { pinThumbprint: pin }, enginePin: { generatedFrom: L },
      approvals: { source: bundle('source'), final: bundle('final') }, frontendInputSha256: 'f'.repeat(64), buildBlobs, now,
    };
    const result = tool.finalManifest(values);
    assert.deepEqual(result.approvals, values.approvals);
    assert.equal(result.frontendInputSha256, 'f'.repeat(64));
    assert.throws(() => tool.finalManifest({ ...values, frontendInputSha256: '0'.repeat(64) }), /another unsigned/);
    assert.throws(() => tool.finalManifest({ ...values, approvals: { source: values.approvals.source } }), /both public/);
    assert.throws(() => tool.finalManifest({ ...values, migrationsList: [{ ...migrationsList[0], sha256: 'a'.repeat(64) }] }), /another migration/);
    assert.throws(() => tool.finalManifest({ ...values, buildBlobs: { ...buildBlobs, [tool.BUILD_PATHS[0]]: 'e'.repeat(40) } }), /other private build code/);
    const sameNonce = JSON.parse(JSON.stringify(values.approvals)); sameNonce.final.request.nonce = sameNonce.source.request.nonce;
    assert.throws(() => tool.finalManifest({ ...values, approvals: sameNonce }), /fresh nonce/);
  });
});

describe('workflow shape', () => {
  const jobs = {};
  const body = WORKFLOW.slice(WORKFLOW.indexOf('\njobs:\n'));
  for (const block of body.split(/\n(?=  [a-z][a-z-]*:\n)/).slice(1)) jobs[/^  ([a-z-]+):/.exec(block)[1]] = block;

  test('approval jobs guard both signing jobs and keep the token read-only', () => {
    assert.deepEqual(Object.keys(jobs), ['gate', 'server', 'approve-source', 'sign-source', 'build', 'approve-final', 'sign', 'image']);
    assert.match(WORKFLOW, /\npermissions:\n  contents: read\n\n/);
    assert.doesNotMatch(WORKFLOW, /\n[ ]+permissions:/, 'no job widens the token');
    assert.doesNotMatch(WORKFLOW, /packages:\s*write|docker (?:push|login)|--push\b/);
  });
  test('pins every action to a commit and never persists credentials', () => {
    const uses = [...WORKFLOW.matchAll(/uses: (\S+)/g)].map((m) => m[1]);
    assert.ok(uses.length > 10);
    for (const ref of uses) assert.match(ref, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
    const checkouts = WORKFLOW.split('uses: actions/checkout@').slice(1);
    for (const step of checkouts) assert.match(step.split('\n      - ')[0], /persist-credentials: false/);
  });
  test('only the two signing jobs name the environment and the key, and they install nothing', () => {
    for (const [name, block] of Object.entries(jobs)) {
      const signing = name === 'sign-source' || name === 'sign';
      assert.equal(/environment: lolly-ing-signing/.test(block), signing, name);
      assert.equal(/secrets\.LOLLY_ING_CATALOG_SIGNING_KEY/.test(block), signing, name);
      if (signing) {
        assert.doesNotMatch(block, /pnpm|\bnpm |npx |yarn|pip |apt-get|docker|\n\s+cache:/, `${name} must install nothing`);
        assert.match(block, /package-manager-cache: false/);
      }
    }
    assert.equal([...WORKFLOW.matchAll(/secrets\./g)].length, 3);
  });
  test('private approval waiting jobs have no key and signing depends on their success', () => {
    assert.equal(jobs.maintenance, undefined);
    assert.match(jobs['sign-source'], /needs: \[gate, approve-source\]/);
    assert.match(jobs.sign, /needs: \[gate, build, approve-final\]/);
    for (const stage of ['source', 'final']) {
      const block = jobs[`approve-${stage}`];
      assert.doesNotMatch(block, /secrets\.|environment:|pnpm|npm |npx |pip |apt-get/);
      assert.match(block, /hash-object --no-filters -- deploy\/preview\/approval\/approval\.mjs/);
      assert.ok(block.indexOf('hash-object --no-filters') < block.indexOf('node "$APPROVAL_TOOL"'));
      assert.match(block, new RegExp(`name: lolly-ing-approval-${stage}-request-attempt-1`));
      assert.match(block, /path: \$\{\{ runner\.temp \}\}\/approval-request\/request\.json/);
      assert.match(block, /node "\$APPROVAL_TOOL" wait --request/);
      assert.match(block, /--workflow-blob "\$APPROVAL_WORKFLOW_BLOB" --timeout-seconds 1800/);
    }
    assert.match(jobs['approve-final'], /--artifact-sha256 "\$FRONTEND_INPUT_SHA256"/);
    assert.match(jobs['sign-source'], /approval-check --stage source/);
    assert.match(jobs.sign, /approval-check --stage final/);
    assert.match(jobs.image, /--source-approval .*--final-approval /);
    assert.match(jobs.image, /--frontend-input-sha256/);
    assert.doesNotMatch(WORKFLOW, /gh workflow run|workflow_dispatches|\/dispatches|repository-dispatch/);
  });
  test('the qualification workflow runs on every PR and main push', () => {
    const checks = readFileSync(join(HERE, '../workflows/lolly-ing-preview-checks.yml'), 'utf8');
    assert.match(checks, /pull_request:/);
    assert.match(checks, /branches: \[main\]/);
    assert.doesNotMatch(checks, /paths:|paths-ignore:/);
    assert.match(checks, /name: lolly.ing preview tooling tests/);
  });
  test('dispatch inputs reach scripts only through the environment', () => {
    for (const block of WORKFLOW.split(/\n\s+run: /).slice(1)) {
      const script = block.split(/\n\s{6}- /)[0];
      assert.doesNotMatch(script, /\$\{\{\s*(?:inputs|github\.event)\./, 'no expression expansion of inputs inside run');
    }
    assert.doesNotMatch(WORKFLOW, /ref: \$\{\{ inputs\./, 'checkouts use the gate-checked SHAs');
  });
  test('compiles with the literals the manifest records and refuses the release key in the boot log', () => {
    assert.match(jobs.build, new RegExp(`LOLLY_SITE_URL: ${tool.BUILD_CONSTANTS.siteUrl}\\n`));
    assert.match(jobs.build, new RegExp(`VITE_LIVE_RELAY: ${tool.BUILD_CONSTANTS.liveRelay}\\n`));
    assert.match(jobs.build, new RegExp(`VITE_REQUIRE_AI_POLICY: '${tool.BUILD_CONSTANTS.requireAiPolicy}'\\n`));
    assert.match(jobs.build, /VITE_CATALOG_PUBLIC_KEY_JWK: \$\{\{ needs\.gate\.outputs\.pin \}\}/);
    assert.match(jobs.image, new RegExp(tool.RELEASE_THUMBPRINT));
    assert.doesNotMatch(WORKFLOW, /LOLLY_RELEASE_PUBLIC_KEY_JWK|VITE_CATALOG_PUBLIC_KEY_JWK: \$\{\{ vars\./);
  });
  test('the final artifacts are kept 30 days and the intermediate ones 1 day', () => {
    const retention = [...WORKFLOW.matchAll(/name: (lolly-ing-[a-z0-9-]+)\n\s+path: [^\n]+\n\s+retention-days: (\d+)/g)].map((m) => [m[1], Number(m[2])]);
    assert.deepEqual(Object.fromEntries(retention), {
      'lolly-ing-gate': 1, 'lolly-ing-work-server': 1, 'lolly-ing-migrations': 1,
      'lolly-ing-approval-source-request-attempt-1': 1, 'lolly-ing-approval-final-request-attempt-1': 1,
      'lolly-ing-approval-source-attempt-1': 1, 'lolly-ing-approval-final-attempt-1': 1, 'lolly-ing-source-envelope': 1, 'lolly-ing-frontend-input': 1,
      'lolly-ing-frontend-signed': 1, 'lolly-ing-instance-manifest': 30, 'lolly-ing-instance-archive': 30,
    });
  });
});
