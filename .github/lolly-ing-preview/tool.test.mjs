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
  const env = { LSHA: L, WSHA: W, SSHA: S, GITHUB_SHA: S, GITHUB_REPOSITORY: 'lolly-tools/suse-lolly', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main', GITHUB_TOKEN: 't' };
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
    assert.equal(seen.length, 0);
  });
  // Andy 2026-10-27: the Lolly commit qualifies as a lolly.tools source does, by its own full run or a fast lane.
  const B = 'e'.repeat(40);
  const lane = (extra = {}) => ({ version: 1, policy: 'deploy-lane-v1', repository: 'lolly-tools/lolly', source: L, base: B, distance: 2,
    lane: 'docs', changes: 3, changedPathsSha256: '0'.repeat(64), fastJob: { run: 300, attempt: 1, job: 3001, name: 'docs lane' },
    sourceFullCi: [], ...extra });
  const laneRoutes = (overrides = {}) => routes({
    [`/repos/lolly-tools/lolly/actions/workflows/ci.yml/runs?head_sha=${L}&event=push&branch=main&per_page=50`]: { workflow_runs: [run('lolly-tools/lolly', L, { status: 'in_progress', conclusion: null, id: 101 })] },
    [`/repos/lolly-tools/lolly/compare/main...${B}?per_page=1`]: { status: 'behind', behind_by: 5, merge_base_commit: { sha: B } },
    [`/repos/lolly-tools/lolly/actions/workflows/ci.yml/runs?head_sha=${B}&event=push&branch=main&per_page=50`]: { workflow_runs: [run('lolly-tools/lolly', B, { id: 90 })] },
    ...overrides,
  });

  test('a Lolly commit on a fast lane qualifies through its base run; Work still needs its own', async () => {
    const record = await tool.gate(env, fakeFetch(laneRoutes()), noSleep, { lollyLane: lane() });
    assert.deepEqual([record.ci.lolly.id, record.ci.lolly.lane, record.ci.lolly.base, record.ci.lolly.fastRun], [90, 'docs', B, 300]);
    assert.equal(record.ci.work.id, 200);
    // Without the lane record the same source is refused: its own run is still going.
    await assert.rejects(tool.gate(env, fakeFetch(laneRoutes()), noSleep), /no successful/);
  });
  test('refuses a lane record for another source, a full lane, a far or unqualified base', async () => {
    const cases = [
      [lane({ source: 'f'.repeat(40) }), /another repository or commit/],
      [lane({ repository: 'someone/lolly' }), /another repository or commit/],
      [lane({ lane: 'full' }), /only the docs and web lanes/],
      [lane({ base: L }), /no base commit/],
      [lane({ distance: 51 }), /within 50/],
      [lane({ fastJob: null }), /no passed lane job/],
      [lane({ version: 2 }), /malformed/],
    ];
    for (const [record, message] of cases) await assert.rejects(tool.gate(env, fakeFetch(laneRoutes()), noSleep, { lollyLane: record }), message);
    const redBase = laneRoutes({ [`/repos/lolly-tools/lolly/actions/workflows/ci.yml/runs?head_sha=${B}&event=push&branch=main&per_page=50`]: { workflow_runs: [run('lolly-tools/lolly', B, { conclusion: 'failure' })] } });
    await assert.rejects(tool.gate(env, fakeFetch(redBase), noSleep, { lollyLane: lane() }), /no successful/);
    const offMain = laneRoutes({ [`/repos/lolly-tools/lolly/compare/main...${B}?per_page=1`]: { status: 'diverged', merge_base_commit: { sha: 'a'.repeat(40) } } });
    await assert.rejects(tool.gate(env, fakeFetch(offMain), noSleep, { lollyLane: lane() }), /not on lolly-tools\/lolly main/);
  });
  test('Work never takes a lane: its own run must be green even when Lolly is on one', async () => {
    const red = laneRoutes({ [`/repos/lolly-tools/lolly-work/actions/workflows/ci.yml/runs?head_sha=${W}&event=push&branch=main&per_page=50`]: { workflow_runs: [run('lolly-tools/lolly-work', W, { status: 'in_progress', conclusion: null })] } });
    await assert.rejects(tool.gate(env, fakeFetch(red), noSleep, { lollyLane: lane() }), /lolly-tools\/lolly-work has no successful/);
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

describe('transport between jobs', () => {
  const env = { GITHUB_RUN_ID: '4242', GITHUB_RUN_ATTEMPT: '2' };
  test('a hand-over key is unique to the run and attempt and carries an unguessable nonce', () => {
    const key = tool.transportKey(env, 'frontend-input');
    assert.match(key, /^lolly-ing-4242-2-frontend-input-[0-9a-f]{32}$/);
    assert.notEqual(tool.transportKey(env, 'frontend-input'), key);
    assert.throws(() => tool.transportKey(env, 'gate'), /unknown hand-over/);
    assert.throws(() => tool.transportKey({}, 'work-server'), /GITHUB_RUN_ID/);
    assert.throws(() => tool.transportKey(env, 'work-server', 'abc'), /nonce/);
  });
  test('a consumer accepts only this run\'s key for that hand-over, from any attempt', () => {
    const nonce = 'a'.repeat(32);
    assert.equal(tool.checkTransportKey(env, 'work-server', `lolly-ing-4242-1-work-server-${nonce}`), `lolly-ing-4242-1-work-server-${nonce}`);
    for (const bad of ['', `lolly-ing-4243-1-work-server-${nonce}`, `lolly-ing-42421-1-work-server-${nonce}`, `lolly-ing-4242-1-frontend-signed-${nonce}`,
      `lolly-ing-4242-1-work-server-${nonce}x`, `lolly-ing-4242-0-work-server-${nonce}`, `lolly-ing-4242-1-work-server-${'A'.repeat(32)}`]) {
      assert.throws(() => tool.checkTransportKey(env, 'work-server', bad), /not one this run made/, bad);
    }
  });
  test('the directory digest covers every file name and byte, and refuses links, directories and an empty directory', () => {
    const a = dir('xfer');
    put(a, 'work-server.tar', 'image'); put(a, 'migrations.json', '[]');
    const { digest, files } = tool.dirDigest(a);
    assert.deepEqual(files, ['migrations.json', 'work-server.tar']);
    assert.equal(tool.checkDigest(a, digest, 'work-server').digest, digest);
    writeFileSync(join(a, 'migrations.json'), '[1]');
    assert.throws(() => tool.checkDigest(a, digest, 'work-server'), /differs from what its job made/);
    const renamed = dir('xfer');
    put(renamed, 'work-server.tar', 'image'); put(renamed, 'migration.json', '[]');
    assert.notEqual(tool.dirDigest(renamed).digest, digest);
    const linked = dir('xfer');
    put(linked, 'a.tar', 'x'); symlinkSync('/etc/hosts', join(linked, 'b'));
    assert.throws(() => tool.dirDigest(linked), /not a regular file/);
    const nested = dir('xfer');
    put(nested, 'sub/a.tar', 'x');
    assert.throws(() => tool.dirDigest(nested), /not a regular file/);
    assert.throws(() => tool.dirDigest(dir('xfer')), /is empty/);
    assert.throws(() => tool.checkDigest(a, '', 'work-server'), /missing or malformed/);
  });
  test('the source envelope is a job output while it fits, and must match its sha256 on arrival', () => {
    const small = Buffer.from(JSON.stringify({ keyId: 'k', seq: 1, files: { a: 'b' } }));
    const out = tool.envelopeOut(small);
    assert.equal(out.via, 'output');
    assert.deepEqual(tool.envelopeIn(out.b64, out.sha256), small);
    assert.throws(() => tool.envelopeIn(out.b64, tool.sha256(Buffer.from('other'))), /does not match its sha256/);
    assert.throws(() => tool.envelopeIn(`${out.b64}\n`, out.sha256), /not base64/);
    assert.throws(() => tool.envelopeIn('', out.sha256), /not base64/);
    assert.throws(() => tool.envelopeIn(out.b64, ''), /missing or malformed/);
    const large = Buffer.alloc(tool.ENVELOPE_OUTPUT_LIMIT, 1);
    assert.deepEqual([tool.envelopeOut(large).via, tool.envelopeOut(large).b64], ['cache', '']);
    assert.ok(tool.ENVELOPE_OUTPUT_LIMIT < 1024 * 1024, 'stays under the 1 MB job output limit');
  });
  test('the gate record travels as one line with its sha256', () => {
    const record = { version: 1, sources: { lolly: L, work: W, suse: S }, ci: {} };
    const { text, sha256 } = tool.gateOut(record);
    assert.doesNotMatch(text, /\n/);
    assert.deepEqual(tool.gateIn(text, sha256), record);
    assert.throws(() => tool.gateIn(text.replace(L, W), sha256), /does not match its sha256/);
    const bad = JSON.stringify({ version: 1, sources: { lolly: 'x', work: W, suse: S } });
    assert.throws(() => tool.gateIn(bad, tool.sha256(Buffer.from(bad))), /malformed/);
  });
  test('a tree with a link is refused before anything writes into it', () => {
    const root = dir('tree');
    put(root, 'catalog/tools/index.json', '{}');
    assert.equal(tool.plainTree(root).files, 1);
    symlinkSync('/home/runner/work/_actions', join(root, 'catalog/tools/index.sig.json'));
    assert.throws(() => tool.plainTree(root), /link or special/);
  });
  test('the packed archive must be this run\'s and under 2 GiB', () => {
    const out = dir('out');
    const zip = join(out, 'lolly-ing-instance-4242-2.oci.tar.zip');
    writeFileSync(zip, 'PK');
    const facts = tool.transportFacts({ env, zip, tarSha256: 'f'.repeat(64) });
    assert.deepEqual(facts, { release: 'lolly-ing-preview-4242', asset: { name: 'lolly-ing-instance-4242-2.oci.tar.zip', bytes: 2, sha256: tool.sha256(Buffer.from('PK')) },
      member: { name: 'lolly-ing-instance-4242-2.oci.tar', sha256: 'f'.repeat(64) } });
    assert.equal(tool.MAX_RELEASE_ASSET, 2 ** 31);
    const other = join(out, 'lolly-ing-instance-4241-2.oci.tar.zip');
    writeFileSync(other, 'PK');
    assert.throws(() => tool.transportFacts({ env, zip: other, tarSha256: 'f'.repeat(64) }), /must be named/);
    const big = join(dir('out'), 'lolly-ing-instance-4242-2.oci.tar.zip');
    writeFileSync(big, '');
    execFileSync('truncate', ['-s', String(tool.MAX_RELEASE_ASSET), big]);  // sparse: exactly 2 GiB is refused
    assert.throws(() => tool.transportFacts({ env, zip: big, tarSha256: 'f'.repeat(64) }), /under 2 GiB/);
  });

  const bot = { login: 'github-actions[bot]', id: 41898282, type: 'Bot' };
  const files = [{ name: 'lolly-ing-instance.manifest.json', bytes: 10, sha256: '1'.repeat(64) },
    { name: 'lolly-ing-instance-4242-2.oci.tar.zip', bytes: 20, sha256: '2'.repeat(64) }];
  const release = (extra = {}, assetExtra = {}) => ({ id: 777, tag_name: 'lolly-ing-preview-4242', name: 'lolly-ing-preview-4242', draft: true,
    prerelease: false, author: bot, assets: files.map((f) => ({ name: f.name, size: f.bytes, state: 'uploaded', digest: `sha256:${f.sha256}`, uploader: bot,
      ...assetExtra })), ...extra });
  test('before publishing, no release may already carry the run\'s tag or name', () => {
    assert.equal(tool.releaseCheck([[], [{ tag_name: 'v1', name: 'v1' }]], { tag: 'lolly-ing-preview-4242' }), null);
    assert.throws(() => tool.releaseCheck([[release({ author: { login: 'someone', id: 1, type: 'User' } })]], { tag: 'lolly-ing-preview-4242' }), /already exists/);
    assert.throws(() => tool.releaseCheck([[{ tag_name: 'x', name: 'lolly-ing-preview-4242' }]], { tag: 'lolly-ing-preview-4242' }), /already exists/);
  });
  test('after publishing, exactly one bot draft holding exactly the uploaded files with GitHub\'s digests', () => {
    const tag = 'lolly-ing-preview-4242';
    assert.equal(tool.releaseCheck([[release()]], { tag, assets: files }), 777);
    assert.equal(tool.releaseCheck([release()], { tag, assets: files }), 777, 'a flat listing too');
    const cases = [
      [[[release(), release({ id: 778 })]], /exactly one/],
      [[[release({ draft: false })]], /not this run's draft/],
      [[[release({ name: 'other' })]], /not this run's draft/],
      [[[release({ author: { login: 'ndftz', id: 5, type: 'User' } })]], /not created by github-actions\[bot\]/],
      [[[release({ author: { ...bot, id: 1 } })]], /not created by/],
      [[[release({}, { digest: null })]], /digest none/],
      [[[release({}, { digest: `sha256:${'3'.repeat(64)}` })]], /has digest/],
      [[[release({}, { state: 'starter' })]], /not the uploaded file/],
      [[[release({}, { uploader: { login: 'ndftz', id: 5, type: 'User' } })]], /not uploaded by/],
      [[[release({ assets: [] })]], /holds 0 files/],
    ];
    for (const [listing, message] of cases) assert.throws(() => tool.releaseCheck(listing, { tag, assets: files }), message);
    const extra = release();
    extra.assets.push({ ...extra.assets[0], name: 'extra.txt' });
    assert.throws(() => tool.releaseCheck([[extra]], { tag, assets: files }), /holds 3 files/);
  });
  test('the anchor key binds the run, the attempt, the release ID and the manifest sha256', () => {
    assert.equal(tool.anchorKey(env, 777, 'a'.repeat(64)), `lolly-ing-release-4242-2-777-${'a'.repeat(64)}`);
    assert.throws(() => tool.anchorKey(env, 0, 'a'.repeat(64)), /release ID/);
    assert.throws(() => tool.anchorKey(env, 777, 'x'), /sha256/);
  });
  test('the manifest records the release transport for this run\'s archive', () => {
    const pin = freshPin(), keyId = tool.thumbprint(pin);
    const base = { run: { runId: 4242, runAttempt: 2 }, gateRecord: { version: 1, sources: { lolly: L, work: W, suse: S } }, server: { imageId: 'i' },
      sign: {}, shell: { keyId, indexSha256: '5'.repeat(64) }, pack: {}, boot: { readyz: { status: 200 }, index: { sha256: '5'.repeat(64) } },
      oci: { archiveName: 'lolly-ing-instance-4242-2.oci.tar', archiveSha256: '6'.repeat(64), imageDigest: `sha256:${'7'.repeat(64)}` },
      migrationsList: [{ name: '0001.sql', sha256: '8'.repeat(64) }], storedFormatsRecord: {}, buildSettings: { pinThumbprint: keyId },
      enginePin: { generatedFrom: L } };
    const transport = { release: 'lolly-ing-preview-4242', asset: { name: 'lolly-ing-instance-4242-2.oci.tar.zip', bytes: 9, sha256: '9'.repeat(64) },
      member: { name: 'lolly-ing-instance-4242-2.oci.tar', sha256: '6'.repeat(64) } };
    const manifest = tool.finalManifest({ ...base, transport });
    assert.deepEqual(manifest.transport, { release: transport.release, asset: transport.asset, member: transport.member.name });
    for (const bad of [{ ...transport, release: 'lolly-ing-preview-4241' }, { ...transport, member: { ...transport.member, sha256: '0'.repeat(64) } },
      { ...transport, asset: { ...transport.asset, bytes: tool.MAX_RELEASE_ASSET } }, { ...transport, asset: { ...transport.asset, name: 'other.zip' } }, undefined]) {
      assert.throws(() => tool.finalManifest({ ...base, transport: bad }), /release transport record/);
    }
  });
});

describe('workflow shape', () => {
  const jobs = {};
  const body = WORKFLOW.slice(WORKFLOW.indexOf('\njobs:\n'));
  for (const block of body.split(/\n(?=  [a-z][a-z-]*:\n)/).slice(1)) jobs[/^  ([a-z-]+):/.exec(block)[1]] = block;
  const steps = (job) => jobs[job].split('\n      - ').slice(1);
  const CACHE_ACTION = /uses: actions\/cache\/(save|restore)@([0-9a-f]{40})/;

  test('has the six jobs in order, then cleanup', () => {
    assert.deepEqual(Object.keys(jobs), ['gate', 'server', 'sign-source', 'build', 'sign', 'image', 'cleanup']);
    assert.doesNotMatch(WORKFLOW, /packages:\s*write|docker (?:push|login)|--push\b/);
  });
  test('grants nothing by default, and each job exactly its own least privilege', () => {
    assert.match(WORKFLOW, /\npermissions: \{\}\n/);
    const expected = { gate: 'contents: read', server: 'contents: read', 'sign-source': 'contents: read', build: 'contents: read',
      sign: 'contents: read', image: 'contents: write', cleanup: 'actions: write' };
    for (const [name, block] of Object.entries(jobs)) {
      const found = [...block.matchAll(/\n    permissions:\n((?:      [a-z-]+: [a-z]+\n)+)/g)];
      assert.equal(found.length, 1, `${name} states its permissions once`);
      assert.equal(found[0][1].trim(), expected[name], name);
    }
  });
  test('no Actions artifacts: nothing is uploaded or downloaded as an artifact', () => {
    assert.doesNotMatch(WORKFLOW, /upload-artifact|download-artifact|retention-days/);
  });
  test('pins every action to a commit and never persists credentials', () => {
    const uses = [...WORKFLOW.matchAll(/uses: (\S+)/g)].map((m) => m[1]);
    assert.ok(uses.length > 10);
    for (const ref of uses) assert.match(ref, /^[\w.-]+\/[\w.-]+(?:\/[\w.-]+)?@[0-9a-f]{40}$/);
    assert.equal(new Set([...WORKFLOW.matchAll(new RegExp(CACHE_ACTION, 'g'))].map((m) => m[2])).size, 1, 'one actions/cache commit');
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
  test('every hand-over: the producer seals a fresh key and digest, the consumer restores exactly it and checks both', () => {
    const handovers = [
      ['work-server', 'server', 'image', 'xfer/work-server'],
      ['frontend-input', 'build', 'sign', 'xfer/frontend-input'],
      ['frontend-signed', 'sign', 'image', 'xfer/frontend-signed'],
      ['source-envelope', 'sign-source', 'build', 'source-envelope'],
    ];
    const outputs = { 'work-server': ['work_server_key', 'work_server_digest'], 'frontend-input': ['frontend_input_key', 'frontend_input_digest'],
      'frontend-signed': ['frontend_signed_key', 'frontend_signed_digest'], 'source-envelope': ['envelope_key', 'envelope_digest'] };
    for (const [name, producer, consumer, path] of handovers) {
      const [keyOut, digestOut] = outputs[name];
      const put = steps(producer).findIndex((step) => step.includes(`transport-put --name ${name} `));
      assert.ok(put >= 0, `${producer} seals ${name}`);
      const id = /\n\s+id: ([a-z-]+)/.exec(steps(producer)[put])[1];
      const save = steps(producer)[put + 1];
      assert.match(save, new RegExp(`uses: actions/cache/save@[0-9a-f]{40}[^\\n]*\\n(?:\\s+if: [^\\n]+\\n)?\\s+with:\\n\\s+path: \\$\\{\\{ runner\\.temp \\}\\}/${path}\\n\\s+key: \\$\\{\\{ steps\\.${id}\\.outputs\\.key \\}\\}\\n`), `${producer} saves ${name} under its fresh key`);
      assert.match(jobs[producer], new RegExp(`\\n      ${keyOut}: \\$\\{\\{ steps\\.${id}\\.outputs\\.key \\}\\}\\n      ${digestOut}: \\$\\{\\{ steps\\.${id}\\.outputs\\.digest \\}\\}\\n`));
      const restore = steps(consumer).findIndex((step) => CACHE_ACTION.test(step) && step.includes(`key: \${{ needs.${producer}.outputs.${keyOut} }}`));
      assert.ok(restore >= 0, `${consumer} restores ${name}`);
      assert.match(steps(consumer)[restore], new RegExp(`path: \\$\\{\\{ runner\\.temp \\}\\}/${path}\\n`));
      assert.match(steps(consumer)[restore], /fail-on-cache-miss: true/);
      assert.doesNotMatch(steps(consumer)[restore], /restore-keys/);
      const check = steps(consumer)[restore + 1];
      assert.match(check, new RegExp(`KEY: \\$\\{\\{ needs\\.${producer}\\.outputs\\.${keyOut} \\}\\}`));
      assert.match(check, new RegExp(`DIGEST: \\$\\{\\{ needs\\.${producer}\\.outputs\\.${digestOut} \\}\\}`));
      assert.match(check, new RegExp(`node "\\$TOOL" transport-get --name ${name} --key "\\$KEY" --dir "\\$RUNNER_TEMP/${path}" --digest "\\$DIGEST"`));
    }
    assert.equal([...WORKFLOW.matchAll(/uses: actions\/cache\/restore@/g)].length, 4);
    assert.equal([...WORKFLOW.matchAll(/uses: actions\/cache\/save@/g)].length, 5, 'four hand-overs and the anchor');
  });
  test('small records travel as job outputs, checked against their sha256', () => {
    assert.match(jobs.gate, /gate_json: \$\{\{ steps\.gate\.outputs\.gate_json \}\}\n\s+gate_sha256: \$\{\{ steps\.gate\.outputs\.gate_sha256 \}\}/);
    assert.match(jobs.image, /GATE_JSON: \$\{\{ needs\.gate\.outputs\.gate_json \}\}\n\s+GATE_SHA256: \$\{\{ needs\.gate\.outputs\.gate_sha256 \}\}\n\s+run: \|\n[^\n]*\n\s+node "\$TOOL" gate-in --sha256 "\$GATE_SHA256"/);
    assert.match(jobs['sign-source'], /envelope_b64: \$\{\{ steps\.handoff\.outputs\.envelope_b64 \}\}/);
    const [receive] = steps('build').filter((step) => step.includes('envelope-in'));
    assert.match(receive, /if: needs\.sign-source\.outputs\.envelope_b64 != ''/);
    assert.match(receive, /ENVELOPE_B64: \$\{\{ needs\.sign-source\.outputs\.envelope_b64 \}\}\n\s+EXPECTED: \$\{\{ needs\.sign-source\.outputs\.envelope_sha256 \}\}/);
    const [use] = steps('build').filter((step) => step.startsWith('name: Use the lolly.ing source envelope'));
    assert.match(use, /sha256sum --check --strict/);
  });
  test('the compile\'s third-party code runs only as the build user, walled off from the runner', () => {
    assert.doesNotMatch(WORKFLOW, /pnpm\/action-setup|\n\s+cache: pnpm/);
    for (const [name, block] of Object.entries(jobs)) if (name !== 'build') assert.doesNotMatch(block, /pnpm|\bnpm /, name);
    for (const line of jobs.build.split('\n').filter((l) => /\bpnpm (?:install|run)|\bnpm install|build-release-web\.ts/.test(l))) {
      assert.match(line, /^\s+as_builder (?:pnpm|npm|node) /, line);
    }
    const helpers = jobs.build.match(/as_builder\(\) \{\n[^}]+\}/g);
    assert.equal(helpers.length, 2);
    for (const helper of helpers) assert.match(helper, /sudo -u "\$BUILD_USER" -- env -i -C "\$BUILD_ROOT\/lolly" HOME="\/home\/\$BUILD_USER"/);
    const [make] = steps('build').filter((step) => step.startsWith('name: Make the build user'));
    assert.match(make, /chmod 0700 "\$HOME"/);
    assert.match(make, /sudo -u "\$BUILD_USER" -- sudo -n true/);
    assert.match(make, /sudo -u "\$BUILD_USER" -- ls "\$GITHUB_WORKSPACE"/);
    assert.match(make, /sudo -u "\$BUILD_USER" -- ls "\$RUNNER_TEMP"/);
    const order = steps('build').map((step) => step.split('\n')[0]);
    const at = (re) => order.findIndex((line) => re.test(line));
    assert.ok(at(/Record stored formats/) < at(/Make the build user/) && at(/Make the build user/) < at(/Install Lolly's dependencies/));
    const [stop] = steps('build').filter((step) => step.startsWith('name: Stop the build user'));
    assert.match(stop, /sudo pkill -KILL -u "\$BUILD_USER"/);
    assert.match(stop, /if pgrep -u "\$BUILD_USER"/);
  });
  test('consumers refuse links in a restored tree before anything writes into it', () => {
    const [unpack] = steps('sign').filter((step) => step.startsWith('name: Unpack the unsigned shell'));
    assert.ok(unpack.indexOf('plain-tree') > unpack.indexOf('tar --extract') && unpack.indexOf('plain-tree') < unpack.indexOf('chmod'));
    const signing = steps('sign').findIndex((step) => step.startsWith('name: Sign the shell catalog'));
    assert.ok(steps('sign').indexOf(unpack) < signing);
    const [assemble] = steps('image').filter((step) => step.startsWith('name: Unpack and verify the signed shell'));
    assert.match(assemble, /node "\$TOOL" plain-tree "\$shell"/);
  });
  test('the image job publishes one draft release with a size guard, checks it, then saves the anchor', () => {
    const [pack] = steps('image').filter((step) => step.startsWith('name: Export the OCI archive'));
    assert.match(pack, /zipfile\.ZIP_DEFLATED, compresslevel=6, allowZip64=True/);
    assert.match(pack, /node "\$TOOL" transport-facts --zip "\$archive\.zip" --tar-sha256 "\$tar_sha256"/);
    assert.match(pack, /--transport "\$RUNNER_TEMP\/facts\/transport\.json"/);
    const [publish] = steps('image').filter((step) => step.startsWith('name: Publish this run\'s draft release'));
    assert.match(publish, /id: release\n\s+env:\n\s+GH_TOKEN: \$\{\{ github\.token \}\}\n/);
    assert.match(publish, /tag="lolly-ing-preview-\$GITHUB_RUN_ID"/);
    assert.ok(publish.indexOf('--mode absent') < publish.indexOf('gh release create') && publish.indexOf('gh release create') < publish.indexOf('--mode published'));
    assert.match(publish, /gh release create "\$tag" "\$manifest" "\$archive" --repo "\$GITHUB_REPOSITORY" --draft --title "\$tag" --target "\$GITHUB_SHA"/);
    assert.doesNotMatch(WORKFLOW, /--latest|--draft=false|gh release edit|releases\/[^ ]*--method (?:PATCH|DELETE)/);
    assert.equal([...jobs.image.matchAll(/github\.token/g)].length, 1, 'only the publishing step holds the token');
    const anchor = steps('image').at(-1);
    assert.match(anchor, /uses: actions\/cache\/save@[0-9a-f]{40}[^\n]*\n\s+with:\n\s+path: \$\{\{ runner\.temp \}\}\/anchor\n\s+key: \$\{\{ steps\.release\.outputs\.anchor_key \}\}/);
    assert.match(jobs.image, /anchor_key: \$\{\{ steps\.release\.outputs\.anchor_key \}\}/);
  });
  test('cleanup always runs, deletes only this run\'s hand-over caches, and fails a run whose anchor is missing', () => {
    const block = jobs.cleanup;
    assert.match(block, /needs: \[gate, server, sign-source, build, sign, image\]\n\s+if: always\(\)\n/);
    assert.doesNotMatch(block, /uses:|\bnode "|\$TOOL/, 'no code but gh and bash');
    assert.match(block, /actions\/caches\?ref=refs\/heads\/main&key=lolly-ing-\$run-&per_page=100/);
    assert.match(block, /\^lolly-ing-\$run-\[1-9\]\[0-9\]\{0,3\}-\(work-server\|source-envelope\|frontend-input\|frontend-signed\)-\[0-9a-f\]\{32\}\$/);
    assert.match(block, /if \[\[ "\$IMAGE_RESULT" != success \]\]; then exit 0; fi/);
    assert.match(block, /\^lolly-ing-release-\$run-\$GITHUB_RUN_ATTEMPT-\[1-9\]\[0-9\]\{0,19\}-\[0-9a-f\]\{64\}\$/);
    assert.match(block, /if \[\[ "\$anchors" == "\$ANCHOR_KEY" \]\]/);
  });
  test('preview-grade: no approval job, no maintenance input, one signing environment', () => {
    // Andy 2026-10-27: lolly-ing-signing has no reviewer, so nothing in a run waits for a person.
    assert.doesNotMatch(WORKFLOW, /MAINTENANCE|lolly-ing-maintenance/);
    assert.deepEqual([...new Set([...WORKFLOW.matchAll(/environment: (\S+)/g)].map((m) => m[1]))], ['lolly-ing-signing']);
    assert.match(WORKFLOW, /\nrun-name: lolly\.ing preview \$\{\{ inputs\.WSHA \}\}\n/);  // the deploy command resumes a running build by it
  });
  test('the gate qualifies Lolly on a fast lane only without its own run, with the base commit\'s own rules', () => {
    const find = (re) => steps('gate').filter((step) => re.test(step));
    const [checkout] = find(/Check out Lolly's history/);
    assert.match(checkout, /if: steps\.lolly-ci\.outputs\.lane == 'true'/);
    assert.match(checkout, /fetch-depth: 0\n\s+filter: blob:none\n\s+persist-credentials: false/);
    const [qualify] = find(/Qualify the Lolly commit on a fast lane/);
    assert.match(qualify, /if: steps\.lolly-ci\.outputs\.lane == 'true'/);
    assert.match(qualify, /git show "\$base:scripts\/deploy-lane\.ts" > "\$RUNNER_TEMP\/deploy-lane\.ts"/);
    assert.match(qualify, /GITHUB_REPOSITORY=lolly-tools\/lolly node "\$RUNNER_TEMP\/deploy-lane\.ts" qualify "\$base" "\$LSHA"/);
    assert.match(qualify, /--max-count=51/);
    assert.doesNotMatch(jobs.gate, /secrets\.|environment:/);
    const [gateStep] = find(/name: Check ancestry, qualification and the engine pin/);
    assert.match(gateStep, /--lolly-lane "\$RUNNER_TEMP\/gate\/lolly-lane\.json"/);
  });
  /** Each run: script, inline or block, up to the first line indented no deeper than its key. */
  const runScripts = () => {
    const lines = WORKFLOW.split('\n'), scripts = [];
    lines.forEach((line, i) => {
      const m = /^(\s+)(?:- )?run: (.*)$/.exec(line);
      if (!m) return;
      if (m[2] !== '|') { scripts.push(m[2]); return; }
      const body = [];
      for (let j = i + 1; j < lines.length && (lines[j] === '' || lines[j].search(/\S/) > m[1].length); j++) body.push(lines[j]);
      scripts.push(body.join('\n'));
    });
    return scripts;
  };
  test('dispatch inputs and job outputs reach scripts only through the environment', () => {
    const scripts = runScripts();
    assert.ok(scripts.length > 40);
    for (const script of scripts) {
      assert.doesNotMatch(script, /\$\{\{\s*(?:inputs|github\.event)\./, 'no expression expansion of inputs inside run');
      assert.doesNotMatch(script, /\$\{\{\s*(?:needs|steps)\./, 'job and step outputs reach scripts through the environment too');
    }
    assert.doesNotMatch(WORKFLOW, /ref: \$\{\{ inputs\./, 'checkouts use the gate-checked SHAs');
  });
  test('compiles with the literals the manifest records and refuses the release key in the boot log', () => {
    assert.match(jobs.build, new RegExp(`LOLLY_SITE_URL: ${tool.BUILD_CONSTANTS.siteUrl}\\n`));
    assert.match(jobs.build, new RegExp(`VITE_LIVE_RELAY: ${tool.BUILD_CONSTANTS.liveRelay}\\n`));
    assert.match(jobs.build, new RegExp(`VITE_REQUIRE_AI_POLICY: '${tool.BUILD_CONSTANTS.requireAiPolicy}'\\n`));
    assert.match(jobs.build, /VITE_CATALOG_PUBLIC_KEY_JWK: \$\{\{ needs\.gate\.outputs\.pin \}\}/);
    assert.match(jobs.build, /VITE_CATALOG_PUBLIC_KEY_JWK="\$VITE_CATALOG_PUBLIC_KEY_JWK"/, 'and passes them to the build user');
    assert.match(jobs.image, new RegExp(tool.RELEASE_THUMBPRINT));
    assert.doesNotMatch(WORKFLOW, /LOLLY_RELEASE_PUBLIC_KEY_JWK|VITE_CATALOG_PUBLIC_KEY_JWK: \$\{\{ vars\./);
  });
});
