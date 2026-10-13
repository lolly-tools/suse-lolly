// SPDX-License-Identifier: MPL-2.0
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, test } from 'node:test';
import { setSitePolicy } from '../../../shells/web/src/lib/site-policy.ts';
import {
  initTrustedSites, resetTrustedSitesForTest, setBrandTrustedSites, siteVerdict,
} from '../../../shells/web/src/lib/trusted-sites.ts';

const defaults = JSON.parse(readFileSync(new URL('../catalog/assets/index.json', import.meta.url), 'utf8')).defaultTrustedSites;

afterEach(() => {
  resetTrustedSitesForTest();
  setSitePolicy(null);
});

test('the pack asks before contacting brand hosts on a new profile', async () => {
  assert.deepEqual(defaults, []);
  await initTrustedSites({ profile: { get: async () => ({}) } });
  setBrandTrustedSites(defaults);
  for (const url of ['https://www.suse.com/', 'https://docs.suse.de/', 'https://intranet.suse.cz/']) {
    assert.equal(siteVerdict(url).state, 'ask');
  }
});

test('an approved organisation host does not inherit trust for its siblings', async () => {
  await initTrustedSites({ profile: { get: async () => ({}) } });
  setBrandTrustedSites(defaults);
  setSitePolicy({ mode: 'allowlist-only', allow: ['docs.suse.com'], block: [], brandDefaults: 'ignore' });
  assert.equal(siteVerdict('https://docs.suse.com/guide').state, 'trusted');
  assert.equal(siteVerdict('https://other.suse.com/guide').state, 'blocked');
});

test('governed allowlists ignore old personal wildcards without rewriting a profile', async () => {
  const profile = { trustedSites: ['*.suse.com'], trustedSitesSeeded: true };
  await initTrustedSites({ profile: { get: async () => profile } });
  setBrandTrustedSites(defaults);
  setSitePolicy({ mode: 'allowlist-only', allow: [], block: [], brandDefaults: 'ignore' });
  assert.equal(siteVerdict('https://www.suse.com/').state, 'blocked');
  assert.deepEqual(profile.trustedSites, ['*.suse.com']);
});
