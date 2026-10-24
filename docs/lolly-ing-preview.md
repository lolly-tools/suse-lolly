# lolly.ing preview image

`.github/workflows/lolly-ing-preview.yml` builds the private image that the lolly.ing preview instance runs. It is
Phase 2 of the preview fast-deploy proposal (section 4.2). One image holds:

- the Work server, built from `lolly-work` at `WSHA` with `deploy/compose/Dockerfile`;
- the SUSE web shell at `/app/shell`, compiled from Lolly at `LSHA` with this repository at `SSHA`;
- the instance pack at `/app/packs/lolly-ing`, made by Work's own release-mode producer from that signed shell.

Both paths are the ones Work reads today (`instance.shellDir` and `instance.pack`). The files are owned by root and
are not writable by the server's user. The engine pin is the Work image's own `/app/engine-pin.json`, which must name
`LSHA`. `instance.json` is not in the image; it stays a ConfigMap.

The image never leaves this private repository's Actions run. Nothing is pushed to a registry, because the shell and
pack carry licensed SUSE content. The run keeps an OCI archive and a manifest as artifacts for 30 days. The preview
deploy command downloads them by run ID and streams the archive to the node.

## Jobs

| Job | Holds | Does |
|---|---|---|
| `gate` | no secrets | Checks the inputs. Checks the lolly.ing pin, refusing the platform release pin. Uses read-only GitHub API calls to check that `LSHA` and `WSHA` are on their `main` with a successful `ci.yml` push run in the same repository, that `SSHA` is on this repository's `main`, and that Work's `vendor/lolly` gitlink and `engine-pin.json` both name `LSHA`. Refuses a dispatch from any ref other than `main`. |
| `maintenance` | `lolly-ing-maintenance` | Only when `MAINTENANCE` is set: Andy's approval of a maintenance migration in this run. Holds no secret, checks out nothing, runs one log line. |
| `server` | no secrets | Builds the Work server stage at `WSHA`, checks its engine pin offline, records the migrations (name and sha256) and saves the image. Runs while the first approval waits. |
| `sign-source` | `lolly-ing-signing` | Signs the SUSE source catalog with the lolly.ing key. Installs nothing; runs only Lolly's scripts at `LSHA`. |
| `build` | no secrets | Installs Lolly's dependencies, validates the SUSE catalog, records the shell's stored-format versions and compiles the shell in Lolly's release build phase with the lolly.ing pin. |
| `sign` | `lolly-ing-signing` | Signs the shell catalog (`--materialize`, optional `--min-seq`), verifies it, writes the delivery files, signs and verifies the frontend receipt, checks the shell and records the pack custody. Installs nothing. |
| `image` | no key | Verifies the signed shell again, recomputes the custody and requires the signing job's hash, builds the pack with Work's producer, assembles the image, checks ownership, modes, engine pin and migrations, boots it against a throwaway Postgres, exports the OCI archive and writes the manifest. |

The split follows Lolly's `release-frontend.yml`: a job that installs or builds third-party code never holds the key,
and a job that holds the key installs nothing. Every checkout uses `persist-credentials: false`. The workflow token
is `contents: read` for every job.

## What it refuses

- A commit that is not on its `main`, or a Lolly or Work commit without a successful `ci.yml` push run on `main`.
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

The preview deploy command (`launch.py lolly.ing ship <WSHA>`) dispatches it with the three commits; agents or Andy
can also dispatch it by hand. Andy approves the two signing jobs, and the maintenance job when it runs.

```sh
gh workflow run lolly-ing-preview.yml -R lolly-tools/suse-lolly --ref main \
  -f LSHA=<lolly commit> -f WSHA=<lolly-work commit> -f SSHA=<suse-lolly main head> [-f MIN_SEQ=<floor>] [-f MAINTENANCE=true]
```

Pick `WSHA` first: its `engine-pin.json` names the only `LSHA` it accepts. `SSHA` must be the head of `main` at
dispatch, the commit the run itself runs at; the gate refuses any other, because the deploy command binds the run's
head SHA to `SSHA`. Set `MAINTENANCE=true` when the build carries a migration that Work's classifier
(`scripts/classify-migrations.ts`) calls maintenance; the deploy command refuses to apply such a migration without
Andy's approval of `lolly-ing-maintenance` in the same run. Only one run is active at a time; a newer
dispatch waits, and a third replaces the waiting one.

`MIN_SEQ` raises the floor of the shell catalog's signed sequence. It needs `sign-catalog.ts --min-seq` at `LSHA`,
which Lolly does not have yet; the `sign` job refuses `MIN_SEQ` until it does. Without it the shell catalog is signed
at the source envelope's sequence plus one. The live publication generation is a separate number that the deploy
command sets in `instance.json` (proposal 4.3, step 7).

## Artifacts

| Artifact | Kept | Contents |
|---|---|---|
| `lolly-ing-instance-manifest` | 30 days | `lolly-ing-instance.manifest.json` |
| `lolly-ing-instance-archive` | 30 days | `lolly-ing-instance-<run id>-<attempt>.oci.tar` (`docker save`, OCI layout) |
| `lolly-ing-gate`, `lolly-ing-work-server`, `lolly-ing-source-envelope`, `lolly-ing-frontend-input`, `lolly-ing-frontend-signed` | 1 day | intermediate files passed between jobs |

The manifest records: the run (repository, workflow ref, run ID and attempt, dispatcher); the three sources and the
bound CI runs; the archive name, sha256 and size; the image digest named by `index.json`, the platform manifest and
config digests, the DiffIDs and layers; the engine pin; the shell facts (file count, `index.html` sha256, receipt
sha256, catalog sequence and key id); the pack custody and pack source record; the migrations; the stored-format
versions; the compile settings; and the boot results.

## Contract with the preview deploy command

The consumer is lolly-work's `deploy/preview` (`launch.py lolly.ing deploy|ship <WSHA>`). It:

1. binds the run by its ID: workflow path `.github/workflows/lolly-ing-preview.yml`, event `workflow_dispatch`, branch
   `main`, same repository for run and head, conclusion `success`, and head SHA equal to the manifest's `sources.suse`
   and `run.workflowSha`;
2. reads `lolly-ing-instance.manifest.json` from that run's `lolly-ing-instance-manifest` artifact and requires `kind`
   `lolly-ing-instance-image` version 1, the run ID and attempt, `sources.work` equal to its input, the engine pin
   naming `sources.lolly`, every key id (`shell.keyId`, `shell.publicPinThumbprint`, `catalog.keyId`,
   `buildSettings.pinThumbprint`) equal to the lolly.ing pin it holds and never the release key, the boot results, the
   migrations and the stored formats;
3. downloads `lolly-ing-instance-<run id>-<attempt>.oci.tar` from that run's `lolly-ing-instance-archive` artifact,
   streams it to the node and checks its sha256 against `image.archive` before `ctr images import --no-unpack --digests
   --base-name docker.io/library/lolly-ing-instance`; then it checks `image.digest`, `manifestDigest`, `configDigest`
   and `diffIds`, and removes the run tag (`image.refName`) the import kept;
4. after the switch, verifies the shell's `release-frontend.sig.json` served by lolly.ing against the lolly.ing pin
   (source `LSHA`, target `web`, profile `suse`), its sha256 against `receiptSha256`, and `/` against
   `shell.indexSha256`;
5. for a pending maintenance migration, requires an approval of `lolly-ing-maintenance` in this run by a login it pins.

## Setup Andy owns

None of this is done by the workflow or by agents.

1. **lolly.ing's own catalog key.** Generate one P-256 key that is neither the release key nor the lolly.tools
   preview key, for example `node scripts/sign-catalog.ts --gen-key` in a Lolly checkout (it writes the git-ignored
   `keys/` directory and prints the public JWK and its key id). Keep the private half off every repository.
2. **Environment `lolly-ing-maintenance`**: required reviewer Andy only, "Prevent self-review" on, deployment
   branches `main` only, no secrets.
3. **Environment `lolly-ing-signing`** in this repository:
   - required reviewer: Andy only, with "Prevent self-review" on, so the account that dispatches cannot approve.
     Agents dispatch from their own account and never approve; a run Andy dispatches himself cannot be approved
     while this is on;
   - deployment branches: selected branches, `main` only;
   - environment secret `LOLLY_ING_CATALOG_SIGNING_KEY`: the private key as PKCS8 PEM or JWK JSON. Never a
     repository or organisation secret.
4. **Repository variables:**
   - `LOLLY_ING_PUBLIC_KEY_JWK` (required): the public JWK, for example
     `{"kty":"EC","crv":"P-256","x":"...","y":"..."}`;
   - `LOLLY_ING_CONNECTOR_ORIGINS` and `LOLLY_ING_CA_ENROLLMENT_TRUST_JSON` (optional): passed to the compile as
     `VITE_CONNECTOR_ORIGINS` and `VITE_CA_ENROLLMENT_TRUST_JSON`. The live lolly.ing shell was built without them;
     leave them unset to keep that.
5. **Repository settings:** default workflow token permission "Read repository contents"; `main` protected with a
   required check; Actions artifact storage and spending enough for about 2 to 3 GB per run kept 30 days (the
   intermediate artifacts expire after a day).
6. **At the cut-over (proposal 4.7 and 4.8):** the same private key replaces `LW_CATALOG_SIGNING_KEY` in the lolly.ing
   Secret, and its public JWK becomes `instance.catalogPublicKey`. The deploy command refuses a Work boot log that
   names the release key.

## Checks for this tooling

`.github/lolly-ing-preview/tool.mjs` holds the checks the workflow runs, with Node built-ins only.
`.github/workflows/lolly-ing-preview-checks.yml` runs its tests on changes to these files:

```sh
node --test .github/lolly-ing-preview/tool.test.mjs
# Also check the boot config against Work's own parser and startup checks:
LOLLY_WORK_DIR=/path/to/lolly-work node --test .github/lolly-ing-preview/tool.test.mjs
```
