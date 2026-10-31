#!/usr/bin/env node
// SPDX-License-Identifier: MPL-2.0
/**
 * First-party checks for .github/workflows/lolly-ing-preview.yml.
 *
 * Node built-ins only, so every job can run it without installing anything,
 * including the two signing jobs and the instance image itself (tree-perms).
 * Each subcommand prints one JSON result or refuses with a reason and exit 1.
 *
 *   inputs          check LSHA, WSHA, SSHA and MIN_SEQ (environment)
 *   pin             check the lolly.ing public pin (PIN_JWK) and refuse the release pin
 *   gate            read-only GitHub API checks: ancestry, green CI push runs (or a Lolly fast lane), engine pin
 *   checkouts       compare local checkouts with the inputs and the Work engine pin
 *   envelope-check  the source catalog envelope names the lolly.ing key
 *   stored-formats  the shell's stored-format versions, from the Lolly source
 *   build-settings  the fixed and variable compile settings, for the manifest
 *   migrations      Work migration files with their sha256
 *   engine-pin      the image's engine pin names LSHA
 *   custody         complete tree manifest, public pin and release custody for the pack
 *   shell-check     facts and pin checks for a signed lolly.ing shell
 *   pack-facts      facts about the release-mode pack Work's producer wrote
 *   tree-perms      every entry root-owned, not group or world writable, no links
 *   boot-config     throwaway instance.json for the boot check
 *   smoke           HTTP checks against the booted instance image
 *   oci-facts       archive sha256, image digest, config digest and DiffIDs
 *   final-manifest  the manifest uploaded beside the archive
 */
import { createHash, createPublicKey } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  appendFileSync, closeSync, createReadStream, existsSync, lstatSync, mkdirSync, openSync,
  readFileSync, readSync, readdirSync, statSync, writeFileSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// The platform release catalog key. Its public half is public (it is in every
// self-host template); lolly.ing must never pin it (PROPOSAL 4.7, R22 S1).
export const RELEASE_THUMBPRINT = '5zVngG6s-652_L8Zdok5PTfQ6vxdPAYfcpBWxMtzs5c';
export const RELEASE_PUBLIC = {
  x: 'fHdyfof2ppicYg3eoDbeNxdnxjbt9KhBLsjVGso6eqo',
  y: 'SWK6wsAVjRAad2w8MxmIkTGdgNMFHhhSNdeEqfH5cVg',
};
export const REPOS = { lolly: 'lolly-tools/lolly', work: 'lolly-tools/lolly-work', suse: 'lolly-tools/suse-lolly' };
export const CI_WORKFLOW = '.github/workflows/ci.yml';
export const PROFILE = 'suse';
export const SITE = { name: 'lolly.ing', baseUrl: 'https://lolly.ing', pack: '/app/packs/lolly-ing', shellDir: '/app/shell' };
// Work's bound on a shell release and on the release-mode pack producer.
export const MAX_RELEASE_FILES = 130_000;
// The same anchors the preview deploy tool reads (lolly-work
// deploy/preview/lib/preview_anchors.py STORED_FORMATS), so both record the
// same versions for a rollback check (R21 R7).
export const STORED_FORMATS = {
  indexedDb: ['shells/web/src/bridge/db.ts', String.raw`\bconst DB_VERSION = (\d+);`],
  revisionArchive: ['shells/web/src/bridge/revision-archive-format.ts', String.raw`export interface RevisionArchive \{\s*version: (\d+);`],
  channelMessage: ['shells/web/src/collab/join-route.ts', String.raw`export const CHANNEL_MESSAGE_VERSION = (\d+);`],
  session: ['engine/src/session-record.ts', String.raw`export const SESSION_FORMAT_VERSION = (\d+);`],
};

const SHA40 = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const B64URL32 = /^[A-Za-z0-9_-]{43}$/;

export class Refusal extends Error {}
export function refuse(message) { throw new Refusal(message); }
function need(condition, message) { if (!condition) refuse(message); }

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function sha256File(path) {
  const hash = createHash('sha256'), fd = openSync(path, 'r'), buffer = Buffer.alloc(1 << 20);
  try {
    let n;
    while ((n = readSync(fd, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, n));
  } finally { closeSync(fd); }
  return hash.digest('hex');
}

function setOutput(name, value) {
  const text = String(value);
  need(!/[\r\n]/.test(text), `output ${name} must be one line`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${text}\n`);
}
function writeJson(path, value, pretty = true) {
  writeFileSync(path, (pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value)) + '\n', { mode: 0o644 });
}
function readJson(path, limit = 64 * 1024 * 1024) {
  need(statSync(path).size <= limit, `${path} is larger than expected`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

// ---------------------------------------------------------------- inputs, pin

export function checkInputs(env) {
  const out = {};
  for (const [key, name] of [['lsha', 'LSHA'], ['wsha', 'WSHA'], ['ssha', 'SSHA']]) {
    const value = env[name] ?? '';
    need(SHA40.test(value), `${name} must be a full 40-character lowercase commit SHA`);
    out[key] = value;
  }
  const minSeq = env.MIN_SEQ ?? '';
  need(minSeq === '' || (/^[1-9][0-9]{0,15}$/.test(minSeq) && Number.isSafeInteger(Number(minSeq))),
    'MIN_SEQ must be empty or a positive whole number');
  out.minSeq = minSeq === '' ? null : Number(minSeq);
  return out;
}

/** RFC 7638 thumbprint of a P-256 public JWK. */
export function thumbprint(jwk) {
  const canonical = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y });
  return createHash('sha256').update(canonical).digest('base64url');
}

const PUBLIC_JWK_MEMBERS = new Set(['kty', 'crv', 'x', 'y', 'kid', 'alg', 'use', 'key_ops', 'ext']);
/** The lolly.ing pin: a public P-256 JWK that is not the release key. */
export function parsePin(text) {
  need(typeof text === 'string' && text.trim(), 'LOLLY_ING_PUBLIC_KEY_JWK is not set (repository variable)');
  let jwk;
  try { jwk = JSON.parse(text); } catch { refuse('LOLLY_ING_PUBLIC_KEY_JWK must be JWK JSON'); }
  need(jwk && typeof jwk === 'object' && !Array.isArray(jwk), 'LOLLY_ING_PUBLIC_KEY_JWK must be a JWK object');
  need(!('d' in jwk), 'LOLLY_ING_PUBLIC_KEY_JWK holds private key material; store only the public half in the variable');
  const extra = Object.keys(jwk).filter((key) => !PUBLIC_JWK_MEMBERS.has(key));
  need(!extra.length, `LOLLY_ING_PUBLIC_KEY_JWK has unexpected members: ${extra.join(', ')}`);
  need(jwk.kty === 'EC' && jwk.crv === 'P-256' && B64URL32.test(jwk.x ?? '') && B64URL32.test(jwk.y ?? ''),
    'LOLLY_ING_PUBLIC_KEY_JWK must be an EC P-256 public key');
  const pin = { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y };
  try { createPublicKey({ key: pin, format: 'jwk' }); } catch { refuse('LOLLY_ING_PUBLIC_KEY_JWK is not a point on P-256'); }
  const id = thumbprint(pin);
  need(id !== RELEASE_THUMBPRINT && pin.x !== RELEASE_PUBLIC.x && pin.y !== RELEASE_PUBLIC.y,
    'LOLLY_ING_PUBLIC_KEY_JWK is the platform release key. lolly.ing must use its own key (PROPOSAL 4.7).');
  return { pin, thumbprint: id, json: JSON.stringify(pin) };
}

// ---------------------------------------------------------------------- gate

export function githubApi({ token, baseUrl = 'https://api.github.com', fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  return async function get(path) {
    let last = 'no attempt';
    for (let attempt = 1; attempt <= 4; attempt++) {
      let response;
      try {
        response = await fetchImpl(baseUrl.replace(/\/+$/, '') + path, {
          headers: {
            accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28',
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
          redirect: 'error', signal: AbortSignal.timeout(30_000),
        });
      } catch (error) {
        last = `network error (${error?.name ?? 'error'})`;
        if (attempt < 4) await sleep(2000 * attempt);
        continue;
      }
      if (response.status === 200) return response.json();
      if (response.status === 404) refuse(`GitHub answered 404 for ${path}`);
      last = `HTTP ${response.status}`;
      if (response.status < 500 && response.status !== 429) break;
      if (attempt < 4) await sleep(2000 * attempt);
    }
    refuse(`GitHub API ${path} failed: ${last}`);
  };
}

/** The commit is main's head or an ancestor of it. */
export async function onMain(get, repo, sha) {
  const compare = await get(`/repos/${repo}/compare/main...${sha}?per_page=1`);
  need(['behind', 'identical'].includes(compare?.status) && compare?.merge_base_commit?.sha === sha,
    `${sha} is not on ${repo} main (compare status ${compare?.status ?? 'unknown'})`);
  return { status: compare.status, behindBy: compare.behind_by };
}

/** A completed, successful CI push run on main for exactly this commit, in the same repository. */
export async function greenPushRun(get, repo, sha) {
  const body = await get(`/repos/${repo}/actions/workflows/ci.yml/runs?head_sha=${sha}&event=push&branch=main&per_page=50`);
  const runs = Array.isArray(body?.workflow_runs) ? body.workflow_runs : [];
  const exact = runs.filter((run) => run && run.head_sha === sha && run.path === CI_WORKFLOW && run.event === 'push'
    && run.head_branch === 'main' && run.repository?.full_name === repo && run.head_repository?.full_name === repo);
  const green = exact.filter((run) => run.status === 'completed' && run.conclusion === 'success')
    .sort((a, b) => b.id - a.id);
  need(green.length, `${repo} has no successful ${CI_WORKFLOW} push run on main for ${sha}`
    + (exact.length ? ` (found: ${exact.map((r) => `${r.id} ${r.status}/${r.conclusion}`).join(', ')})` : ''));
  const run = green[0];
  need(Number.isSafeInteger(run.id) && Number.isSafeInteger(run.run_attempt), 'CI run identity is malformed');
  return { id: run.id, attempt: run.run_attempt, url: run.html_url ?? null, updatedAt: run.updated_at ?? null };
}

/**
 * A Lolly source on a fast lane (Andy, 2026-10-27: the Lolly commit qualifies as a lolly.tools source does). The
 * record is what Lolly's own scripts/deploy-lane.ts, copied from the base commit, wrote in the gate job: it already
 * classified the change and found the passed lane job. Here the record must name this source and repository, a docs
 * or web lane, a base within 50 first-parent commits on main, and that base needs its own successful full CI run.
 * Work never takes a lane.
 */
export const LANES = ['docs', 'web'];
export async function laneRun(get, record, lsha) {
  need(record && typeof record === 'object' && record.version === 1 && typeof record.policy === 'string',
    'the Lolly lane record is malformed');
  need(record.repository === REPOS.lolly && record.source === lsha, 'the Lolly lane record is for another repository or commit');
  need(SHA40.test(record.base ?? '') && record.base !== lsha, 'the Lolly lane record names no base commit');
  need(LANES.includes(record.lane), `the Lolly lane is ${record.lane}; only the docs and web lanes skip a full CI run`);
  need(Number.isSafeInteger(record.distance) && record.distance >= 1 && record.distance <= 50,
    'the lane base is not within 50 first-parent commits of LSHA');
  const job = record.fastJob;
  need(job && Number.isSafeInteger(job.run) && Number.isSafeInteger(job.job), 'the Lolly lane record names no passed lane job');
  await onMain(get, REPOS.lolly, record.base);
  const base = await greenPushRun(get, REPOS.lolly, record.base);
  return { ...base, lane: record.lane, base: record.base, distance: record.distance, fastRun: job.run, fastJob: job.job,
    policy: record.policy };
}

export async function submoduleCommit(get, repo, path, ref) {
  const entry = await get(`/repos/${repo}/contents/${path}?ref=${ref}`);
  need(entry?.type === 'submodule' && SHA40.test(entry?.sha ?? ''), `${repo}:${path} at ${ref} is not a submodule gitlink`);
  return entry.sha;
}

export async function repoJson(get, repo, path, ref) {
  const entry = await get(`/repos/${repo}/contents/${path}?ref=${ref}`);
  need(entry?.type === 'file' && entry?.encoding === 'base64' && typeof entry.content === 'string' && entry.size <= 1024 * 1024,
    `${repo}:${path} at ${ref} is not a readable file`);
  return JSON.parse(Buffer.from(entry.content, 'base64').toString('utf8'));
}

export async function gate(env, fetchImpl = fetch, sleep, { lollyLane = null } = {}) {
  const inputs = checkInputs(env);
  need(env.GITHUB_REPOSITORY === REPOS.suse, `this workflow runs only in ${REPOS.suse}`);
  need(env.GITHUB_EVENT_NAME === 'workflow_dispatch', 'dispatch the workflow by hand (workflow_dispatch)');
  need(env.GITHUB_REF === 'refs/heads/main', 'dispatch the workflow from main; other refs cannot reach the signing environment');
  // The preview deploy command binds a run by its head SHA, which for a dispatch on main
  // is main's head at that moment; it must be the suse-lolly commit the run builds.
  need(inputs.ssha === env.GITHUB_SHA, `SSHA ${inputs.ssha} is not this run's commit ${env.GITHUB_SHA}; dispatch with SSHA set to the head of main`);
  const get = githubApi({ token: env.GITHUB_TOKEN, baseUrl: env.GITHUB_API_URL || undefined, fetchImpl, sleep });
  const record = { version: 1, sources: { lolly: inputs.lsha, work: inputs.wsha, suse: inputs.ssha }, minSeq: inputs.minSeq };
  record.ancestry = {
    lolly: await onMain(get, REPOS.lolly, inputs.lsha),
    work: await onMain(get, REPOS.work, inputs.wsha),
    suse: await onMain(get, REPOS.suse, inputs.ssha),
  };
  // Work needs its own successful full CI run. Lolly needs its own, or a fast lane above a base that has one.
  record.ci = {
    lolly: lollyLane ? await laneRun(get, lollyLane, inputs.lsha) : await greenPushRun(get, REPOS.lolly, inputs.lsha),
    work: await greenPushRun(get, REPOS.work, inputs.wsha),
  };
  const gitlink = await submoduleCommit(get, REPOS.work, 'vendor/lolly', inputs.wsha);
  need(gitlink === inputs.lsha, `lolly-work@${inputs.wsha} vendors Lolly ${gitlink}, not LSHA ${inputs.lsha}`);
  const enginePin = await repoJson(get, REPOS.work, 'engine-pin.json', inputs.wsha);
  need(enginePin?.generatedFrom === inputs.lsha,
    `lolly-work@${inputs.wsha} engine-pin.json was generated from ${enginePin?.generatedFrom}, not LSHA ${inputs.lsha}`);
  record.enginePin = { gitlink, generatedFrom: enginePin.generatedFrom, engine: enginePin.engine?.version ?? null };
  // Informational: the SUSE commit Lolly itself pins at LSHA. SSHA may differ.
  try { record.lollySuseGitlink = await submoduleCommit(get, REPOS.lolly, 'brands/suse', inputs.lsha); }
  catch { record.lollySuseGitlink = null; }
  return record;
}

// ---------------------------------------------------------- local checkouts

function git(dir, ...args) {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' } }).trim();
}

export function checkCheckouts({ lolly, suse, work }, inputs) {
  const facts = {};
  if (lolly) {
    need(git(lolly, 'rev-parse', 'HEAD') === inputs.lsha, `the Lolly checkout is not at LSHA ${inputs.lsha}`);
    facts.lolly = inputs.lsha;
  }
  if (suse) {
    need(git(suse, 'rev-parse', 'HEAD') === inputs.ssha, `the suse-lolly checkout is not at SSHA ${inputs.ssha}`);
    facts.suse = inputs.ssha;
  }
  if (work) {
    need(git(work, 'rev-parse', 'HEAD') === inputs.wsha, `the Work checkout is not at WSHA ${inputs.wsha}`);
    const entry = git(work, 'ls-tree', 'HEAD', 'vendor/lolly');
    const match = /^160000 commit ([0-9a-f]{40})\tvendor\/lolly$/.exec(entry);
    need(match && match[1] === inputs.lsha, `Work's vendor/lolly gitlink is not LSHA ${inputs.lsha}`);
    const pin = readJson(join(work, 'engine-pin.json'), 1024 * 1024);
    need(pin.generatedFrom === inputs.lsha, `Work's engine-pin.json was generated from ${pin.generatedFrom}, not LSHA`);
    facts.work = inputs.wsha;
  }
  return facts;
}

export function storedFormats(lollyDir) {
  const formats = {}, missing = [];
  for (const [name, [path, pattern]] of Object.entries(STORED_FORMATS).sort(([a], [b]) => (a < b ? -1 : 1))) {
    let text;
    try { text = readFileSync(join(lollyDir, path), 'utf8'); } catch { formats[name] = null; missing.push(name); continue; }
    const found = [...text.matchAll(new RegExp(pattern, 'g'))].map((m) => m[1]);
    formats[name] = found.length === 1 ? Number(found[0]) : null;
    if (formats[name] === null) missing.push(name);
  }
  return { formats, missing };
}

export function migrations(dir) {
  const names = readdirSync(dir).filter((name) => name.endsWith('.sql')).sort();
  need(names.length, `no migrations in ${dir}`);
  return names.map((name) => {
    const path = join(dir, name), st = lstatSync(path);
    need(st.isFile(), `migration ${name} is not a regular file`);
    return { name, sha256: sha256(readFileSync(path)) };
  });
}

// ---------------------------------------------------- tree manifest, custody

/** Every regular file under root, sorted like Work's release-pack reader. */
export function treeFiles(root) {
  const files = [];
  const walk = (rel, depth) => {
    need(depth <= 64, `${root} is nested too deeply`);
    for (const name of readdirSync(join(root, rel)).sort()) {
      const path = rel ? `${rel}/${name}` : name, st = lstatSync(join(root, path));
      if (st.isDirectory()) walk(path, depth + 1);
      else {
        need(st.isFile(), `${path} is a link or special file`);
        files.push({ path, size: st.size });
        need(files.length <= MAX_RELEASE_FILES, `${root} holds more than ${MAX_RELEASE_FILES} files`);
      }
    }
  };
  walk('', 0);
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

export function treeManifest(root) {
  let totalBytes = 0;
  const files = treeFiles(root).map(({ path, size }) => {
    totalBytes += size;
    return { path, size, sha256: sha256File(join(root, path)) };
  });
  return { version: 1, files, totalBytes };
}

/**
 * Inputs for Work's release-mode pack producer (docs/instance-pack-production.md):
 * the complete manifest, the public pin and the custody record that binds them
 * to LSHA, the suse profile and Lolly's committed verifier. Deterministic, so
 * the image job can recompute it and compare the hash with the signing job's.
 */
export function writeCustody({ root, lolly, lsha, pin, outDir }) {
  mkdirSync(outDir, { recursive: true, mode: 0o755 });
  const manifest = treeManifest(root);
  const manifestBytes = Buffer.from(JSON.stringify(manifest) + '\n');
  need(manifestBytes.length <= 32 * 1024 * 1024, 'the complete manifest is larger than the pack producer reads');
  const pinBytes = Buffer.from(JSON.stringify({ kty: pin.kty, crv: pin.crv, x: pin.x, y: pin.y }));
  const verifier = readFileSync(join(lolly, 'scripts/verify-release-catalog.ts'));
  writeFileSync(join(outDir, 'final-dist.manifest.json'), manifestBytes, { mode: 0o644 });
  writeFileSync(join(outDir, 'public.jwk.json'), pinBytes, { mode: 0o644 });
  const custody = {
    version: 1,
    status: 'SIGNED_LOLLY_RELEASE_REVIEWED',
    lollySource: lsha,
    profile: PROFILE,
    manifest: { path: 'final-dist.manifest.json', sha256: sha256(manifestBytes) },
    publicPin: { path: 'public.jwk.json', sha256: sha256(pinBytes) },
    verifier: { path: 'scripts/verify-release-catalog.ts', sha256: sha256(verifier) },
  };
  const custodyBytes = Buffer.from(JSON.stringify(custody, null, 2) + '\n');
  writeFileSync(join(outDir, 'release-custody.json'), custodyBytes, { mode: 0o644 });
  return { custodySha256: sha256(custodyBytes), manifestSha256: custody.manifest.sha256, files: manifest.files.length, totalBytes: manifest.totalBytes };
}

// ---------------------------------------------------------------- shell check

const SCAN_SKIP = /\.(?:gz|br|png|jpe?g|webp|avif|gif|woff2?|ttf|otf|glb|gltf|mp3|mp4|webm|wasm|onnx|pdf|ico)$/i;
/**
 * Facts about a signed lolly.ing shell, and the pin enforcement on its bytes:
 * the release key's public coordinates must appear nowhere, and the lolly.ing
 * pin must be compiled into the application scripts.
 */
export function shellCheck({ root, pin, keyId, lsha, minSeq = null }) {
  const files = treeFiles(root);
  need(existsSync(join(root, 'index.html')), 'the shell has no index.html');
  const receiptBytes = readFileSync(join(root, 'release-frontend.sig.json'));
  const receipt = JSON.parse(receiptBytes.toString('utf8'));
  const indexSha256 = sha256(readFileSync(join(root, 'index.html')));
  need(receipt.kind === 'lolly-release-frontend' && receipt.version === 1 && receipt.source === lsha
    && receipt.target === 'web' && receipt.profile === PROFILE && receipt.files?.['index.html'] === indexSha256,
    'the frontend receipt does not describe this lolly.ing shell (source, target, profile or index.html)');
  const envelopeBytes = readFileSync(join(root, 'catalog/tools/index.sig.json'));
  const envelope = JSON.parse(envelopeBytes.toString('utf8'));
  need(envelope.keyId === keyId, `the shell catalog is signed by ${envelope.keyId}, not the lolly.ing key ${keyId}`);
  need(envelope.keyId !== RELEASE_THUMBPRINT, 'the shell catalog is signed by the platform release key');
  need(Number.isSafeInteger(envelope.seq) && envelope.seq >= 1, 'the shell catalog has no sequence');
  need(minSeq === null || envelope.seq >= minSeq, `the shell catalog sequence ${envelope.seq} is below MIN_SEQ ${minSeq}`);
  need(envelope.toolDirs && typeof envelope.toolDirs === 'object', 'the shell catalog is not a modern materialized envelope');
  const needles = [Buffer.from(RELEASE_PUBLIC.x), Buffer.from(RELEASE_PUBLIC.y)];
  const own = Buffer.from(pin.x);
  let pinned = 0, governed = false;
  for (const { path, size } of files) {
    if (SCAN_SKIP.test(path) || size > 128 * 1024 * 1024) continue;
    const bytes = readFileSync(join(root, path));
    for (const needle of needles) need(!bytes.includes(needle), `${path} carries the platform release public key`);
    if (/\.m?js$/.test(path) && bytes.includes(own)) pinned++;
    // Work's governed-boot marker (lolly-work server/src/lib/shell-dist.ts).
    if (/^(?:_app|assets)\/[^/]+\.js$/.test(path) && !governed && bytes.includes('org-config')) governed = true;
  }
  need(pinned > 0, 'no application script carries the lolly.ing pin; the shell was not compiled with LOLLY_ING_PUBLIC_KEY_JWK');
  need(governed, 'no script in _app/ carries the org-config marker, so Work would refuse to boot this shell under gated access');
  return {
    files: files.length, totalBytes: files.reduce((sum, f) => sum + f.size, 0), indexSha256,
    receiptSha256: sha256(receiptBytes), envelopeSha256: sha256(envelopeBytes), catalogSeq: envelope.seq,
    keyId: envelope.keyId, scriptsCarryingPin: pinned,
  };
}

/** What Work's release-mode producer wrote: no build envelope, a finished v2 source record. */
export function packFacts(root, lsha) {
  const files = treeFiles(root);
  const recordBytes = readFileSync(join(root, '.lolly-pack-source.json'));
  const record = JSON.parse(recordBytes.toString('utf8'));
  need(record.version === 2 && record.incomplete !== true && record.commit === lsha && record.profile === PROFILE
    && record.derivation?.kind === 'verified-signed-release', 'the pack was not produced in release mode from LSHA and the suse profile');
  need(!existsSync(join(root, 'catalog/tools/index.sig.json')), 'the pack carries a build envelope; Work signs per caller');
  need(existsSync(join(root, 'catalog/tools/index.json')), 'the pack has no tool index');
  return {
    files: files.length, totalBytes: files.reduce((sum, f) => sum + f.size, 0),
    sourceRecordSha256: sha256(recordBytes), derivation: record.derivation,
  };
}

/** Root-owned, read-only for everyone else, no links: run inside the instance image. */
export function treePerms(roots) {
  let entries = 0;
  for (const root of roots) {
    const walk = (path) => {
      const st = lstatSync(path);
      entries++;
      need(!st.isSymbolicLink(), `${path} is a symbolic link`);
      need(st.uid === 0 && st.gid === 0, `${path} is not owned by root`);
      need(!(st.mode & 0o022), `${path} is writable by group or others`);
      if (st.isDirectory()) for (const name of readdirSync(path)) walk(join(path, name));
      else need(st.isFile(), `${path} is not a regular file`);
    };
    walk(root);
  }
  return { entries };
}

// ------------------------------------------------------------- boot and smoke

/** A throwaway production-mode config with lolly.ing's shape and no credentials. */
export function bootConfig({ pin, generation }) {
  need(Number.isSafeInteger(generation) && generation > 0, 'the boot generation must be a positive integer');
  return {
    deployment: { mode: 'production', application: 'web', requireServerRendering: false },
    instance: {
      name: SITE.name, baseUrl: SITE.baseUrl, pack: SITE.pack, shellDir: SITE.shellDir, homeView: 'projects',
      catalogPublicationGeneration: generation, catalogPublicKey: { kty: pin.kty, crv: pin.crv, x: pin.x, y: pin.y },
    },
    // Email and password needs no issuer to discover, so the boot contacts no identity provider.
    idp: { additional: [{ id: 'password', kind: 'password' }] },
    policy: { defaultAccessMode: 'gated' },
    blobs: { driver: 'pg' },
    dev: { enabled: false },
  };
}

export async function smoke({ base, indexSha256, fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), healthWaitMs = 180_000, readyWaitMs = 300_000, now = Date.now }) {
  const url = (path) => base.replace(/\/+$/, '') + path;
  const request = async (path, init = {}) => {
    try { return await fetchImpl(url(path), { redirect: 'manual', signal: AbortSignal.timeout(30_000), ...init }); }
    catch { return null; }
  };
  const until = async (path, ms) => {
    const stop = now() + ms;
    let last = null;
    while (now() < stop) {
      last = await request(path);
      if (last?.status === 200) return last;
      await sleep(3000);
    }
    refuse(`${path} did not answer 200 in ${Math.round(ms / 1000)} s (last ${last ? last.status : 'no answer'})`);
  };
  const results = {};
  const health = await (await until('/healthz', healthWaitMs)).json();
  need(health?.ok === true && health?.name === SITE.name && health?.accessMode === 'gated',
    `/healthz answered ${JSON.stringify(health)}, expected name ${SITE.name} and gated access`);
  results.healthz = { status: 200, name: health.name, accessMode: health.accessMode };
  const ready = await (await until('/readyz', readyWaitMs)).json();
  need(ready?.ok === true, '/readyz did not report ok');
  results.readyz = { status: 200, store: ready.store ?? null };
  const index = await request('/', { headers: { 'accept-encoding': 'identity' } });
  need(index?.status === 200, `/ answered ${index?.status ?? 'nothing'}`);
  const body = Buffer.from(await index.arrayBuffer());
  need(sha256(body) === indexSha256, '/ does not serve the signed index.html');
  // Signed-catalog tool libraries load as blob: URLs (lolly-work server/src/api/shell-headers.ts).
  const csp = index.headers.get('content-security-policy') ?? '';
  need(csp.includes('blob:'), '/ has no blob: source in its Content-Security-Policy');
  results.index = { status: 200, sha256: indexSha256, cspHasBlob: true };
  const info = await request('/info/');
  need(info?.status === 200, `/info/ answered ${info?.status ?? 'nothing'}`);
  results.info = { status: 200 };
  const catalog = await request('/catalog/tools/index.json');
  need(catalog?.status === 401, `an anonymous catalog request answered ${catalog?.status ?? 'nothing'}, expected 401`);
  results.anonymousCatalog = { status: 401 };
  return results;
}

// ------------------------------------------------------------------ OCI facts

/** Entries of a tar archive (ustar, pax and GNU long names), by offset; data is not read. */
export function tarEntries(path) {
  const fd = openSync(path, 'r'), header = Buffer.alloc(512), entries = new Map();
  const size = statSync(path).size;
  let offset = 0, paxPath = null, longName = null;
  const text = (buf, start, length) => { const raw = buf.subarray(start, start + length); const end = raw.indexOf(0); return raw.subarray(0, end < 0 ? length : end).toString('utf8'); };
  const octal = (buf, start, length) => {
    if (buf[start] & 0x80) { let value = 0; for (let i = start + 1; i < start + length; i++) value = value * 256 + buf[i]; return value; }
    const raw = text(buf, start, length).trim();
    return raw ? parseInt(raw, 8) : 0;
  };
  try {
    while (offset + 512 <= size) {
      need(readSync(fd, header, 0, 512, offset) === 512, 'tar header is truncated');
      if (header.every((b) => b === 0)) break;
      const length = octal(header, 124, 12), type = String.fromCharCode(header[156] || 48);
      const prefix = text(header, 257, 6).startsWith('ustar') ? text(header, 345, 155) : '';
      let name = longName ?? paxPath ?? (prefix ? `${prefix}/${text(header, 0, 100)}` : text(header, 0, 100));
      const dataOffset = offset + 512;
      need(Number.isSafeInteger(length) && dataOffset + length <= size, 'tar entry runs past the archive');
      if (type === 'K') {
        // GNU long link target: applies to the next entry's link, not its name.
      } else if (type === 'x' || type === 'L') {
        const data = Buffer.alloc(length);
        readSync(fd, data, 0, length, dataOffset);
        if (type === 'L') longName = text(data, 0, length);
        else {
          for (const record of data.toString('utf8').split('\n')) {
            const m = /^\d+ path=(.*)$/.exec(record);
            if (m) paxPath = m[1];
          }
        }
      } else {
        if (type !== 'g') {
          name = name.replace(/^\.\//, '');
          if ((type === '0' || type === '7') && name) entries.set(name, { offset: dataOffset, size: length });
          longName = null; paxPath = null;
        }
      }
      offset = dataOffset + Math.ceil(length / 512) * 512;
    }
  } finally { closeSync(fd); }
  return entries;
}

function readEntry(path, entry, limit = 16 * 1024 * 1024) {
  need(entry.size <= limit, 'archive metadata entry is too large');
  const fd = openSync(path, 'r'), data = Buffer.alloc(entry.size);
  try { need(readSync(fd, data, 0, entry.size, entry.offset) === entry.size, 'archive entry is truncated'); }
  finally { closeSync(fd); }
  return data;
}

async function hashRange(path, { offset, size }) {
  if (size === 0) return sha256(Buffer.alloc(0));
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path, { start: offset, end: offset + size - 1 })) hash.update(chunk);
  return hash.digest('hex');
}

const INDEX_TYPES = new Set(['application/vnd.oci.image.index.v1+json', 'application/vnd.docker.distribution.manifest.list.v2+json']);
/**
 * Read the image out of a `docker save` (OCI layout) archive: the archive
 * sha256, the digest index.json names, the platform manifest, config digest,
 * DiffIDs and layers. Every blob it names is hashed and must match its digest.
 */
export async function ociFacts(archive) {
  const entries = tarEntries(archive);
  const blob = (digest) => {
    need(DIGEST.test(digest ?? ''), `invalid digest ${digest}`);
    const entry = entries.get(`blobs/sha256/${digest.slice(7)}`);
    need(entry, `the archive has no blob ${digest}`);
    return entry;
  };
  const json = (digest) => {
    const bytes = readEntry(archive, blob(digest));
    need(`sha256:${sha256(bytes)}` === digest, `blob ${digest} does not match its digest`);
    return JSON.parse(bytes.toString('utf8'));
  };
  need(entries.has('oci-layout') && entries.has('index.json'), 'the archive is not an OCI image layout');
  const index = JSON.parse(readEntry(archive, entries.get('index.json')).toString('utf8'));
  need(index.schemaVersion === 2 && Array.isArray(index.manifests) && index.manifests.length === 1, 'the archive must hold exactly one image');
  const top = index.manifests[0];
  let manifestDigest = top.digest, manifest = json(top.digest);
  if (INDEX_TYPES.has(manifest.mediaType ?? top.mediaType)) {
    const platform = (manifest.manifests ?? []).filter((m) => m.platform?.os === 'linux' && m.platform?.architecture === 'amd64');
    need(platform.length === 1, 'the image index has no single linux/amd64 manifest');
    manifestDigest = platform[0].digest;
    manifest = json(manifestDigest);
  }
  need(manifest.schemaVersion === 2 && manifest.config && Array.isArray(manifest.layers) && manifest.layers.length, 'the image manifest is malformed');
  const config = json(manifest.config.digest);
  const diffIds = config?.rootfs?.diff_ids;
  need(config?.os === 'linux' && config?.architecture === 'amd64', 'the image is not linux/amd64');
  need(Array.isArray(diffIds) && diffIds.length === manifest.layers.length && diffIds.every((d) => DIGEST.test(d)), 'the image config DiffIDs are malformed');
  const layers = [];
  for (const layer of manifest.layers) {
    const entry = blob(layer.digest);
    need(entry.size === layer.size, `layer ${layer.digest} size differs from the manifest`);
    need(`sha256:${await hashRange(archive, entry)}` === layer.digest, `layer ${layer.digest} does not match its digest`);
    layers.push({ digest: layer.digest, size: layer.size, mediaType: layer.mediaType });
  }
  return {
    archiveSha256: sha256File(archive), archiveBytes: statSync(archive).size,
    imageDigest: top.digest, manifestDigest, configDigest: manifest.config.digest, diffIds, layers,
    refName: top.annotations?.['io.containerd.image.name'] ?? top.annotations?.['org.opencontainers.image.ref.name'] ?? null,
  };
}

// ----------------------------------------------------------- small records

/** The source catalog envelope the first signing job wrote. */
export function envelopeCheck(bytes, keyId) {
  const envelope = JSON.parse(bytes.toString('utf8'));
  need(envelope.keyId === keyId && envelope.keyId !== RELEASE_THUMBPRINT, `the envelope is signed by ${envelope.keyId}, not the lolly.ing key ${keyId}`);
  need(Number.isSafeInteger(envelope.seq) && envelope.seq >= 1, 'the envelope has no sequence');
  need(envelope.files && typeof envelope.files === 'object' && Object.keys(envelope.files).length > 0, 'the envelope signs no tool files');
  return { keyId: envelope.keyId, seq: envelope.seq, files: Object.keys(envelope.files).length, sha256: sha256(bytes) };
}

// Fixed lolly.ing build settings. The workflow passes the same literals to the
// compile step; tool.test.mjs checks that the two agree.
export const BUILD_CONSTANTS = { siteUrl: 'https://lolly.ing', liveRelay: 'https://lolly.ing/live', requireAiPolicy: 'true' };
export function buildSettings(env, keyId) {
  const origins = env.CONNECTOR_ORIGINS ?? '';
  const trust = env.CA_TRUST ?? '';
  need(!/PRIVATE KEY/.test(trust), 'LOLLY_ING_CA_ENROLLMENT_TRUST_JSON must hold public trust only');
  return {
    profile: PROFILE, ...BUILD_CONSTANTS, pinThumbprint: keyId,
    connectorOrigins: origins || null,
    caEnrollmentTrustSha256: trust ? sha256(Buffer.from(trust)) : null,
  };
}

export function enginePinFacts(bytes, lsha) {
  const pin = JSON.parse(bytes.toString('utf8'));
  need(pin.generatedFrom === lsha, `the image's engine pin was generated from ${pin.generatedFrom}, not LSHA ${lsha}`);
  return { generatedFrom: pin.generatedFrom, sha256: sha256(bytes), engine: pin.engine?.version ?? null, core: pin.core?.version ?? null };
}

export function runFacts(env) {
  return {
    repository: env.GITHUB_REPOSITORY ?? null, workflowRef: env.GITHUB_WORKFLOW_REF ?? null, workflowSha: env.GITHUB_SHA ?? null,
    ref: env.GITHUB_REF ?? null, event: env.GITHUB_EVENT_NAME ?? null,
    runId: env.GITHUB_RUN_ID ? Number(env.GITHUB_RUN_ID) : null, runAttempt: env.GITHUB_RUN_ATTEMPT ? Number(env.GITHUB_RUN_ATTEMPT) : null,
    url: env.GITHUB_RUN_ID ? `${env.GITHUB_SERVER_URL ?? 'https://github.com'}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}` : null,
    dispatchedBy: env.GITHUB_ACTOR ?? null,
  };
}

// ------------------------------------------------------------- final manifest

export function finalManifest({ run, gateRecord, server, sign, shell, pack, oci, boot, migrationsList, storedFormatsRecord, buildSettings, enginePin }) {
  need(gateRecord?.version === 1, 'the gate record is missing');
  need(SHA256.test(oci?.archiveSha256 ?? '') && DIGEST.test(oci?.imageDigest ?? ''), 'the OCI facts are missing');
  need(shell?.keyId && shell.keyId !== RELEASE_THUMBPRINT, 'the shell facts are missing or name the release key');
  need(buildSettings?.pinThumbprint === shell.keyId, 'the build settings and the signed shell name different pins');
  need(enginePin?.generatedFrom === gateRecord.sources.lolly, 'the image engine pin is not LSHA');
  need(Array.isArray(migrationsList) && migrationsList.length, 'the migrations list is missing');
  need(boot?.readyz?.status === 200 && boot?.index?.sha256 === shell.indexSha256, 'the boot check did not pass');
  return {
    kind: 'lolly-ing-instance-image',
    version: 1,
    site: SITE.name,
    run,
    sources: gateRecord.sources,
    ci: gateRecord.ci,
    ancestry: gateRecord.ancestry,
    lollySuseGitlink: gateRecord.lollySuseGitlink ?? null,
    image: {
      archive: { name: oci.archiveName, sha256: oci.archiveSha256, bytes: oci.archiveBytes },
      digest: oci.imageDigest, manifestDigest: oci.manifestDigest, configDigest: oci.configDigest,
      diffIds: oci.diffIds, layers: oci.layers, refName: oci.refName, workServerImageId: server.imageId,
      paths: { shell: SITE.shellDir, pack: SITE.pack },
    },
    enginePin,
    shell: { ...shell, publicPinThumbprint: shell.keyId, profile: PROFILE },
    catalog: { seq: shell.catalogSeq, minSeq: gateRecord.minSeq ?? null, keyId: shell.keyId },
    receiptSha256: shell.receiptSha256,
    custody: sign,
    pack,
    migrations: migrationsList,
    storedFormats: storedFormatsRecord,
    buildSettings,
    boot,
  };
}

// ------------------------------------------------------------------------ CLI

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2), value = argv[i + 1];
      need(value !== undefined && !value.startsWith('--'), `--${key} needs a value`);
      (out[key] ??= []).push(value); i++;
    } else out._.push(argv[i]);
  }
  return out;
}
const one = (a, key, required = true) => { const v = a[key]?.at(-1); need(!required || v, `--${key} is required`); return v; };

export async function main(argv = process.argv.slice(2), env = process.env) {
  const [command, ...rest] = argv;
  const a = args(rest);
  let result;
  switch (command) {
    case 'inputs': {
      result = checkInputs(env);
      for (const key of ['lsha', 'wsha', 'ssha']) setOutput(key, result[key]);
      setOutput('min_seq', result.minSeq ?? '');
      break;
    }
    case 'pin': {
      const { thumbprint: id, json } = parsePin(env.PIN_JWK);
      const expected = one(a, 'expect-thumbprint', false);
      need(!expected || expected === id, `the lolly.ing pin changed during this run (gate saw ${expected}, now ${id})`);
      if (a.out) writeFileSync(one(a, 'out'), json, { mode: 0o644 });
      setOutput('pin', json); setOutput('thumbprint', id);
      result = { thumbprint: id };
      break;
    }
    case 'gate': {
      const lane = one(a, 'lolly-lane', false);
      result = await gate(env, fetch, undefined, { lollyLane: lane ? readJson(lane, 1024 * 1024) : null });
      writeJson(one(a, 'out'), result);
      setOutput('lolly_ci_run', result.ci.lolly.id); setOutput('work_ci_run', result.ci.work.id);
      break;
    }
    case 'checkouts': result = checkCheckouts({ lolly: a.lolly?.[0], suse: a.suse?.[0], work: a.work?.[0] }, checkInputs(env)); break;
    case 'stored-formats': {
      result = storedFormats(one(a, 'lolly'));
      for (const name of result.missing) console.log(`::warning title=Stored format unknown::${name} was not found once in the Lolly source; manual rollback checks will treat it as unknown.`);
      if (a.out) writeJson(one(a, 'out'), result.formats);
      break;
    }
    case 'migrations': result = migrations(one(a, 'dir')); if (a.out) writeJson(one(a, 'out'), result); break;
    case 'custody': {
      const pin = JSON.parse(readFileSync(one(a, 'pin'), 'utf8'));
      result = writeCustody({ root: resolve(one(a, 'root')), lolly: resolve(one(a, 'lolly')), lsha: checkInputs(env).lsha, pin, outDir: resolve(one(a, 'out-dir')) });
      const expected = one(a, 'expect-sha256', false);
      need(!expected || expected === result.custodySha256, `the release tree differs from the one the signing job recorded (custody ${result.custodySha256}, expected ${expected})`);
      if (a.out) writeJson(one(a, 'out'), result);
      setOutput('custody_sha256', result.custodySha256);
      break;
    }
    case 'shell-check': {
      const { pin, thumbprint: id } = parsePin(readFileSync(one(a, 'pin'), 'utf8'));
      const inputs = checkInputs(env);
      result = shellCheck({ root: resolve(one(a, 'root')), pin, keyId: id, lsha: inputs.lsha, minSeq: inputs.minSeq });
      if (a.out) writeJson(one(a, 'out'), result);
      setOutput('seq', result.catalogSeq); setOutput('index_sha256', result.indexSha256);
      break;
    }
    case 'pack-facts': result = packFacts(resolve(one(a, 'root')), checkInputs(env).lsha); if (a.out) writeJson(one(a, 'out'), result); break;
    case 'tree-perms': result = treePerms(a._.length ? a._ : refuse('name at least one directory')); break;
    case 'boot-config': {
      const { pin } = parsePin(readFileSync(one(a, 'pin'), 'utf8'));
      result = bootConfig({ pin, generation: Number(one(a, 'generation')) });
      writeJson(one(a, 'out'), result);
      break;
    }
    case 'smoke': {
      result = await smoke({ base: one(a, 'base'), indexSha256: one(a, 'index-sha256') });
      if (a.out) writeJson(one(a, 'out'), result);
      break;
    }
    case 'oci-facts': {
      const archive = one(a, 'archive');
      result = { archiveName: basename(archive), ...(await ociFacts(archive)) };
      if (a.out) writeJson(one(a, 'out'), result);
      setOutput('archive_sha256', result.archiveSha256); setOutput('image_digest', result.imageDigest);
      break;
    }
    case 'envelope-check': {
      const { thumbprint: id } = parsePin(readFileSync(one(a, 'pin'), 'utf8'));
      result = envelopeCheck(readFileSync(one(a, 'envelope')), id);
      setOutput('envelope_sha256', result.sha256);
      break;
    }
    case 'build-settings': {
      const { thumbprint: id } = parsePin(readFileSync(one(a, 'pin'), 'utf8'));
      result = buildSettings(env, id);
      writeJson(one(a, 'out'), result);
      break;
    }
    case 'engine-pin': result = enginePinFacts(readFileSync(one(a, 'file')), checkInputs(env).lsha); if (a.out) writeJson(one(a, 'out'), result); break;
    case 'final-manifest': {
      const file = (key) => readJson(one(a, key));
      result = finalManifest({
        run: runFacts(env), gateRecord: file('gate'), server: { imageId: one(a, 'work-image-id') },
        sign: file('custody'), shell: file('shell'), pack: file('pack'), oci: file('oci'), boot: file('boot'),
        migrationsList: file('migrations'), storedFormatsRecord: file('stored-formats'), buildSettings: file('build-settings'),
        enginePin: file('engine-pin'),
      });
      writeJson(one(a, 'out'), result);
      break;
    }
    default: refuse(`unknown command ${command ?? '(none)'}`);
  }
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    if (error instanceof Refusal) console.error(`::error title=lolly.ing preview refused::${error.message}`);
    else console.error(error?.stack ?? String(error));
    process.exitCode = 1;
  });
}
