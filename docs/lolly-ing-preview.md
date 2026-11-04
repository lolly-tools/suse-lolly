# lolly.ing preview image

`.github/workflows/lolly-ing-preview.yml` builds the private image that the lolly.ing preview instance runs. It is
Phase 2 of the preview fast-deploy proposal (section 4.2). One image holds:

- the Work server, built from `lolly-work` at `WSHA` with `deploy/compose/Dockerfile`;
- the SUSE web shell at `/app/shell`, compiled from Lolly at `LSHA` with this repository at `SSHA`;
- the instance pack at `/app/packs/lolly-ing`, made by Work's own release-mode producer from that signed shell.

Both paths are the ones Work reads today (`instance.shellDir` and `instance.pack`). The files are owned by root and
are not writable by the server's user. The engine pin is the Work image's own `/app/engine-pin.json`, which must name
`LSHA`. `instance.json` is not in the image; it stays a ConfigMap.

The image never leaves this private repository. Nothing is pushed to a registry, because the shell and pack carry
licensed SUSE content. The run publishes the OCI archive (packed in a zip) and its manifest as the assets of a **draft**
release, `lolly-ing-preview-<run id>`, which only people with write access can see and which makes no tag. The
preview deploy command finds that release through the run's anchor (below), checks it, and reads the manifest. The
node fetches the archive itself, from the signed download address GitHub gives the command for the asset, which
expires a few minutes after it is issued. No credential reaches the node. If the fetch fails, the command downloads the
asset and streams the archive to the node instead.

The run uses **no Actions artifacts**. suse-lolly is private, artifact storage is billed against the plan's quota, and a
full quota refuses every upload: in November 2026 it stopped lolly.ing builds at the first, 567-byte upload. Job outputs,
the Actions cache and release assets are not artifact storage (see [Transport](#transport)).

lolly.ing is a **preview-grade** route (Andy, 2026-10-27), the same model as lolly.tools: a commit ships from `main` as
soon as it qualifies, with no approval per build. The signing environment `lolly-ing-signing` has no reviewer and
deploys from `main` only. Kept: lolly.ing's own key, protected `main`, and a verified database backup before every
migration (the deploy command takes it). Dropped: the two signing approvals, the separate agent identity and the
maintenance-migration approval.

## Jobs

| Job | Holds | Does |
|---|---|---|
| `gate` | no secrets | Checks the inputs. Checks the lolly.ing pin, refusing the platform release pin. Uses read-only GitHub API calls to check that `LSHA`, `WSHA` and `SSHA` are on their `main`, that `WSHA` has its own successful `ci.yml` push run, and that `LSHA` has one too or qualifies on a fast lane (below). Checks that Work's `vendor/lolly` gitlink and `engine-pin.json` both name `LSHA`. Refuses a dispatch from any ref other than `main`. |
| `server` | no secrets | Builds the Work server stage at `WSHA`, checks its engine pin offline, records the migrations (name and sha256) and saves the image. Runs beside the signing of the source catalog. |
| `sign-source` | `lolly-ing-signing` | Signs the SUSE source catalog with the lolly.ing key. Installs nothing; runs only Lolly's scripts at `LSHA`. |
| `build` | no secrets | Records the shell's stored-format versions, then, as the unprivileged user `lollybuild`, installs Lolly's dependencies, validates the SUSE catalog and compiles the shell in Lolly's release build phase with the lolly.ing pin. |
| `sign` | `lolly-ing-signing` | Signs the shell catalog (`--materialize`, optional `--min-seq`), verifies it, writes the delivery files, signs and verifies the frontend receipt, checks the shell and records the pack custody. Installs nothing. |
| `image` | `contents: write` | Verifies the signed shell again, recomputes the custody and requires the signing job's hash, builds the pack with Work's producer, assembles the image, checks ownership, modes, engine pin and migrations, boots it against a throwaway Postgres, exports and packs the OCI archive, writes the manifest, publishes the draft release and saves the anchor. Only the publishing step is given the token. |
| `cleanup` | `actions: write` | Always runs, after every other job. Deletes this run's hand-over caches and, when the image job passed, fails the run unless exactly the image job's anchor is on `main`. Runs nothing but `gh` and bash. |

The split follows Lolly's `release-frontend.yml`: a job that installs or builds third-party code never holds the key,
and a job that holds the key installs nothing. That is why two jobs hold the key, not one: Lolly's compile refuses a
source catalog that is not signed with the pin it bakes in, and the compile installs and runs third-party packages,
any of which could leave a process behind to read a later step's environment on the same runner. With no reviewer on
the environment, the second job costs about two minutes and no approval. Every checkout uses
`persist-credentials: false`. The workflow grants no token permissions by default; each job states its own:
`contents: read` for `gate`, `server`, `sign-source`, `build` and `sign`, `contents: write` for `image` and
`actions: write` for `cleanup`.

### The build user

A cache restore extracts its archive with `tar -P`, which can write anywhere the runner's user can, and only a run on
`main` can write `main`'s cache scope. So no host in a run of this workflow may run third-party code as the runner's
user: such code could take the job's Actions runtime token (the runner's user has passwordless sudo) and write a cache
entry that a later job, a signing job included, would extract. The `build` job is the only one that installs and runs
third-party packages, and it does so as `lollybuild`, a user it creates:

- no sudo, no `docker` group, and an environment with no Actions tokens (`sudo -u lollybuild -- env -i ...`);
- the runner's home, which holds the workspace, the runner's temp files and the runner itself, is made `0700` first;
- it works on its own copy of the sources under `/srv/lollybuild`, and the job stops every process it left before
  packaging the shell. The job fails closed if the user can use sudo or read the workspace or temp files.

The stored-format and build-setting records are written before any third-party code runs. The server stage's
third-party code runs inside `docker buildx build`, away from the runner's processes.

### Qualification

- **Work (`WSHA`)** needs its own successful full `ci.yml` push run on lolly-work `main` (about 15 minutes).
- **Lolly (`LSHA`)** qualifies as a lolly.tools source does: its own successful full run, or a fast lane. Without its
  own run, the gate checks out Lolly's history at `LSHA` (commits and trees only), finds the newest first-parent
  ancestor within 50 commits with a successful full run, and runs that ancestor's own `scripts/deploy-lane.ts qualify`,
  as Lolly's `preview-web.yml` does. `tool.mjs gate` then requires the lane record to name `LSHA`, a docs or web lane
  and that base, and the base to have its own green run. The manifest records the lane under `ci.lolly`.
- **suse-lolly (`SSHA`)** needs no CI of its own. The `build` job validates the SUSE catalog with the strict `suse`
  profile, the signing jobs sign and verify it, the `image` job builds the pack and boots the image, and the deploy
  smoke checks the signed catalog on lolly.ing. A broken content commit fails the run and nothing ships.

## What it refuses

- A commit that is not on its `main`, a Work commit without its own successful `ci.yml` push run on `main`, or a Lolly
  commit with neither its own run nor a fast lane above one.
- A Work commit whose `vendor/lolly` gitlink or `engine-pin.json` source is not `LSHA`.
- A dispatch from a branch other than `main`, or an `SSHA` that is not the commit the run itself runs at (main's
  head at dispatch).
- `LOLLY_ING_PUBLIC_KEY_JWK` that is missing, holds private material, is not P-256 or is the release key
  (thumbprint `5zVngG6s-652_L8Zdok5PTfQ6vxdPAYfcpBWxMtzs5c`). The pin is checked again in each later job and must
  not change during the run.
- A shell whose catalog is not signed by the lolly.ing key, whose application scripts do not carry the lolly.ing pin,
  or which carries the release public key anywhere.
- A shell without Work's governed-boot marker (`org-config` in `_app/*.js`). The image job also runs Work's own
  `checkShellDist`, and the boot uses gated access, where Work refuses to start on a stale shell.
- A pack not produced in release mode from `LSHA` and the `suse` profile, or one that carries a build envelope.
- An image whose shell or pack files are not root-owned and read-only, or whose engine pin or migrations differ
  from the Work server stage.
- A boot that does not answer `/healthz` (name `lolly.ing`, gated) and `/readyz` with 200, serve the signed
  `index.html` at `/` with `blob:` in its CSP, serve `/info/`, and answer 401 to an anonymous catalog request. Any
  restart, a `REFUSING TO START` line or the release key id in the boot log also fails the job.

## Running it

The preview deploy command (`launch.py lolly.ing ship <WSHA>`) dispatches it with the three commits, after checking
the same qualification itself; agents or Andy can also dispatch it by hand. Nobody approves anything in the run.

```sh
gh workflow run lolly-ing-preview.yml -R lolly-tools/suse-lolly --ref main \
  -f LSHA=<lolly commit> -f WSHA=<lolly-work commit> -f SSHA=<suse-lolly main head> [-f MIN_SEQ=<floor>]
```

Pick `WSHA` first: its `engine-pin.json` names the only `LSHA` it accepts. `SSHA` must be the head of `main` at
dispatch, the commit the run itself runs at; the gate refuses any other, because the deploy command binds the run's
head SHA to `SSHA`. The run is named `lolly.ing preview <WSHA>`; a later `ship` of the same Work commit finds a running
build by that name and waits for it instead of dispatching another. Only one run is active at a time; a newer
dispatch waits, and a third replaces the waiting one. Migrations of every class are the deploy command's business: it
takes a verified backup before applying any.

A run takes about 40 to 55 minutes: the gate, then the server stage beside the source signing, the compile (the
longest job), the final signing and the image job, which boots the image and publishes a packed archive of about
1.6 GB. "Re-run failed jobs" does not work once `cleanup` has deleted the hand-over caches; dispatch again instead (the
deploy command always does). A re-run of the image job also refuses, because the run's release already exists.

`MIN_SEQ` raises the floor of the shell catalog's signed sequence. It needs `sign-catalog.ts --min-seq` at `LSHA`,
which Lolly does not have yet; the `sign` job refuses `MIN_SEQ` until it does. Without it the shell catalog is signed
at the source envelope's sequence plus one. The live publication generation is a separate number that the deploy
command sets in `instance.json` (proposal 4.3, step 7).

## Transport

| Data | Size | How it moves | Integrity |
|---|---|---|---|
| gate record | about 1 KB | `gate` job output (one line of JSON) | its sha256, a second output, checked by `tool.mjs gate-in` |
| source envelope | about 128 KB | `sign-source` job output (base64) while it is at most 768 KiB of base64; above that, the cache | its sha256 output, checked by `envelope-in` and `sha256sum` |
| Work server stage | about 142 MB | Actions cache | key and digest outputs, checked by `transport-get` |
| unsigned shell | about 0.3 GB | Actions cache | key and digest outputs, checked by `transport-get` |
| signed shell | about 1.3 GB | Actions cache | key and digest outputs, checked by `transport-get` |
| manifest and packed archive | about 1.6 GB | assets of the draft release `lolly-ing-preview-<run id>` | the anchor, GitHub's asset digests and the manifest |

- **Cache hand-overs.** Each producer makes a key `lolly-ing-<run id>-<attempt>-<name>-<128-bit nonce>`, hashes the
  directory it hands over (`sha256` of each file's sha256 and name) and passes both as job outputs. The consumer
  restores exactly that key with `fail-on-cache-miss` and no fallback keys, then refuses a key that is not this run's
  or a digest that differs. A restored tree is refused if it holds a link or special file before anything writes into
  it. The cache is not storage-billed (10 GB per repository, least recently used entries evicted).
- **The release.** The image job refuses to publish if any release already has the run's tag or name, then
  `gh release create --draft` with the manifest and `lolly-ing-instance-<run id>-<attempt>.oci.tar.zip` (deflate, one
  member, Zip64), refused unless under 2 GiB. It then requires exactly one release with that tag: a draft by
  `github-actions[bot]` (ID 41898282) holding exactly the two files, each with GitHub's `sha256:` digest equal to the
  uploaded file. Release assets are not storage-billed.
- **The anchor.** Last, the image job saves a cache entry under
  `lolly-ing-release-<run id>-<attempt>-<release ID>-<manifest sha256>`. Only a run on `main` can write `main`'s cache
  scope, so this key is the deploy command's proof that the release came from this run's image job. `cleanup` fails the
  run if it is missing.
- **Cleanup.** `cleanup` deletes this run's hand-over caches (all attempts). The deploy command's `gc` deletes draft
  releases it no longer needs, keeping the live and rollback builds.

The manifest records: the run (repository, workflow ref, run ID and attempt, dispatcher); the three sources and the
bound CI runs; the archive name, sha256 and size; the image digest named by `index.json`, the platform manifest and
config digests, the DiffIDs and layers; the engine pin; the shell facts (file count, `index.html` sha256, receipt
sha256, catalog sequence and key id); the pack custody and pack source record; the migrations; the stored-format
versions; the compile settings; the boot results; and the transport (`release`, the packed asset's name, size and
sha256, and the archive inside it).

## Contract with the preview deploy command

The consumer is lolly-work's `deploy/preview` (`launch.py lolly.ing deploy|ship <WSHA>`). It:

1. binds the run by its ID: workflow path `.github/workflows/lolly-ing-preview.yml`, event `workflow_dispatch`, branch
   `main`, same repository for run and head, conclusion `success`, and head SHA equal to the manifest's `sources.suse`
   and `run.workflowSha`;
2. finds the run's single anchor on `main` for its run ID and attempt, and through it the draft release: tag and name
   `lolly-ing-preview-<run id>`, author `github-actions[bot]`, exactly the manifest and the packed archive, each uploaded
   by `github-actions[bot]` with a `sha256:` digest;
3. reads `lolly-ing-instance.manifest.json` from that release, requires its sha256 to equal both the anchor's and
   GitHub's digest, and requires `kind`
   `lolly-ing-instance-image` version 1, the run ID and attempt, `sources.work` equal to its input, the engine pin
   naming `sources.lolly`, every key id (`shell.keyId`, `shell.publicPinThumbprint`, `catalog.keyId`,
   `buildSettings.pinThumbprint`) equal to the lolly.ing pin it holds and never the release key, the boot results, the
   migrations and the stored formats, and a `transport` record naming this release and the packed asset by name, size
   and the sha256 GitHub reports for it;
4. has the node fetch the packed asset from `release-assets.githubusercontent.com` (or, if that fails, downloads it and
   streams it to the node), unpacks `lolly-ing-instance-<run id>-<attempt>.oci.tar` and checks its sha256 against
   `image.archive`
   while it is written and again before `ctr images import --no-unpack --digests
   --base-name docker.io/library/lolly-ing-instance`; then it checks `image.digest`, `manifestDigest`, `configDigest`
   and `diffIds`, and removes the run tag (`image.refName`) the import kept;
5. after the switch, verifies the shell's `release-frontend.sig.json` served by lolly.ing against the lolly.ing pin
   (source `LSHA`, target `web`, profile `suse`), its sha256 against `receiptSha256`, and `/` against
   `shell.indexSha256`;
6. checks the qualification again on the Mac before it dispatches, and resumes a running build of the same `WSHA` by
   its run name.

## Setup Andy owns

None of this is done by the workflow or by agents. The exact commands are in the private runbook
`lolly-private/production/preview/LOLLY-ING-PREVIEW-GRADE.md`.

1. **lolly.ing's own catalog key.** One P-256 key that is neither the release key nor the lolly.tools preview key,
   generated on Andy's Mac and kept off every repository.
2. **Environment `lolly-ing-signing`** in this repository:
   - no required reviewer (the preview-grade route);
   - deployment branches: selected branches, `main` only;
   - environment secret `LOLLY_ING_CATALOG_SIGNING_KEY`: the private key as PKCS8 PEM or JWK JSON. Never a
     repository or organisation secret.
   Create the environment and its branch rule before the secret. A job that names a missing environment creates it
   with no rules (security review 2026-10-25 C1).
3. **Repository variables:**
   - `LOLLY_ING_PUBLIC_KEY_JWK` (required): the public JWK, for example
     `{"kty":"EC","crv":"P-256","x":"...","y":"..."}`;
   - `LOLLY_ING_CONNECTOR_ORIGINS` and `LOLLY_ING_CA_ENROLLMENT_TRUST_JSON` (optional): passed to the compile as
     `VITE_CONNECTOR_ORIGINS` and `VITE_CA_ENROLLMENT_TRUST_JSON`. The live lolly.ing shell was built without them;
     leave them unset to keep that.
4. **Repository settings:** `main` protected (pull requests, the `lolly.ing preview tooling tests` check, no force
   pushes or deletion); default workflow token permission "Read repository contents"; Actions may not approve pull
   requests. No Actions artifact storage is needed. Actions must be allowed to use the cache (the default), and
   releases must stay enabled.
5. **At the cut-over (proposal 4.7 and 4.8):** a second Secret in `lolly-private` holds the same private key under
   `LW_CATALOG_SIGNING_KEY`. The live Secret is never edited: the cut-over patch points the server's reference at the
   new Secret, and a revert points it back. `instance.catalogPublicKey` stays unset. The deploy command refuses a Work
   boot log that names the release key.

## Checks for this tooling

`.github/lolly-ing-preview/tool.mjs` holds the checks the workflow runs, with Node built-ins only.
`.github/workflows/lolly-ing-preview-checks.yml` runs its tests on changes to these files:

```sh
node --test .github/lolly-ing-preview/tool.test.mjs
# Also check the boot config against Work's own parser and startup checks:
LOLLY_WORK_DIR=/path/to/lolly-work node --test .github/lolly-ing-preview/tool.test.mjs
```
