# lolly.ing preview image

`.github/workflows/lolly-ing-preview.yml` builds the private image that the lolly.ing preview instance runs.
One image contains the Work server at `WSHA`, the SUSE shell compiled at `LSHA` with this repository at `SSHA`, and
its release-mode pack. The Work engine pin must name `LSHA`. `instance.json` stays in a ConfigMap.

The image, SUSE source, full approval requests and intermediate artifacts stay in this private repository. The final
OCI archive and manifest expire after 30 days. Nothing is pushed to a registry. The preview deploy command downloads
the archive by its private run ID and streams it to the node.

## Public approval, private signing

GitHub Team supports reviewer gates in public repositories. The public `lolly-tools/lolly-work` repository therefore
holds `.github/workflows/lolly-ing-approval.yml`, an approval-only workflow. It has no signing key, private repository
token, SUSE checkout or SUSE artifact. Its only release inputs are an opaque request SHA-256, the signing stage and a
maintenance flag.

Andy dispatches and approves using `ndftz` during the accepted shared-account period. The public environments require
`ndftz`, selected branch `main` only, administrative bypass disabled and **Prevent self-review OFF**. Agents never
approve a gate. This is a human checkpoint, not enforced separation between the agent and reviewer credentials.

The signing key remains only in the private `lolly-ing-signing` environment. That environment restricts deployments
to `main`; its jobs depend on separate jobs that verify public approval before a signing job can start. The private
environment does not depend on a private reviewer feature unavailable on Team.

This protection is the reviewed private CI software verifier and its job dependency chain. GitHub does not withhold
the private environment secret based on a cross-repository approval itself. Protecting private main and reviewing
the signing workflow are essential: a malicious workflow change could remove the verifier and request that secret.

## Jobs

| Job | Holds | Does |
| --- | --- | --- |
| `gate` | no signing key | Checks exact inputs, main ancestry, successful normal Lolly/Work push CI, engine pin and lolly.ing pin. Refuses reruns. |
| `server` | no signing key | Builds and checks the Work server, records migrations and exports the server image. |
| `approve-source` | no signing key | Creates a private source request, uploads it privately, waits for the corresponding public gate, verifies its actual approval history and records the binding. |
| `sign-source` | private signing key | Checks the approved request again, then signs the source catalog. Installs nothing. |
| `build` | no signing key | Installs dependencies, validates the catalog, records build settings and compiles the unsigned shell. |
| `approve-final` | no signing key | Binds a new request to the unsigned shell hash and verifies the second public signing approval, plus maintenance approval when requested. |
| `sign` | private signing key | Checks the final approved request and unsigned shell bytes, then signs the catalog and receipt. Installs nothing. |
| `image` | no signing key | Checks signed content and custody, assembles the image, checks permissions/engine/migrations, boots it on a throwaway database and records the archive and both approval bindings. |

A job that installs or builds third-party code never receives the signing key. Every checkout sets
`persist-credentials: false`. Every private job has a read-only workflow token.

## Exact request binding

The private request includes:

- version and stage (`source` or `final`);
- private repository, run ID, attempt and workflow commit;
- all three source commits, the signing pin and private build-file blob hashes;
- the migration manifest, maintenance flag and catalog sequence floor;
- the unsigned frontend artifact SHA-256 for the final stage;
- a fresh 32-byte random nonce, issue time and expiry (at most four hours).

The request digest is SHA-256 over `lolly.ing approval request v1\n` followed by recursively key-sorted compact JSON.
The random nonce prevents guessing private source combinations from the public digest. Full requests are never sent
to the public workflow. Review the private request and compare its digest before approving the public run.

The verifier is Work's `deploy/preview/approval/approval.mjs` at `WSHA`. Each private approval job checks its exact git
blob against the workflow's reviewed `APPROVAL_HELPER_BLOB` before executing it. The verifier checks the public
workflow's exact reviewed blob as well as its repository, path, main dispatch, actor, first attempt, request digest,
stage, lifetime, successful completion, environment rules and actual `ndftz` approval entries. A successful workflow
without an approval entry is refused. The final maintenance gate is required only when the private request asks for
maintenance and binds the candidate migration manifest.

Each wait is limited to 30 minutes, in a separate job with no signing key. Missing approval, rejection, ambiguity,
expired input, changed code/settings or API failure stops signing. API rate limits are handled within the wait budget;
there is no unchecked fallback and no cross-repository PAT in the public workflow. Work's build poll timeout must cover
the two waits and private build work.

The first implementation refuses reruns of either the private or public workflow, including rerun-failed-jobs.
Dispatch a fresh private run with fresh requests and approvals instead.

## Running the build

Use the pinned private launcher and a Work commit with green normal main CI that contains the reviewed approval
helper. Its `engine-pin.json` determines `LSHA`. The tool chooses suse-lolly main's exact head as `SSHA`.

```sh
/usr/bin/python3 launch.py lolly.ing ship <full Work main commit>
```

The command observes the private request artifacts, displays their private summaries and dispatches the corresponding
public gates. Andy reviews and approves them in GitHub. Before the one-time conversion, a successful ship prepares
the bound build; the separate reviewed `plan --apply` performs the cutover. Building does not authorize cutover.

`MAINTENANCE` must be true when the candidate includes migrations requiring maintenance approval. Without that
approval the deploy tool refuses those migrations. `MIN_SEQ` is optional and requires support at `LSHA`; it sets the
shell catalog sequence floor. The live database publication generation remains a separate value selected at deploy.

## Private artifacts and manifest

| Artifact | Kept | Contents |
| --- | --- | --- |
| `lolly-ing-instance-manifest` | 30 days | `lolly-ing-instance.manifest.json` |
| `lolly-ing-instance-archive` | 30 days | exact run's OCI archive |
| `lolly-ing-approval-source-request-attempt-1` | 1 day | `request.json` only |
| `lolly-ing-approval-final-request-attempt-1` | 1 day | `request.json` only |
| `lolly-ing-approval-source-attempt-1`, `lolly-ing-approval-final-attempt-1` | 1 day | `approval.json` binding the private request and public run |
| gate, server, migrations, source-envelope and frontend artifacts | 1 day | files passed between this run's jobs |

The manifest records all prior run/source/image/receipt/custody/engine/migration/build/boot facts, plus
`frontendInputSha256` from the build job's output and `approvals.source` and `approvals.final`. Each approval is
`{request, run: {id, attempt: 1}}`. Final assembly requires the request's artifact hash to equal the independent build
output, both requests to name the assembled migration manifest and build code, and distinct nonces for the stages.

The Mac independently verifies both public approvals before accepting the private manifest and archive. The node
checks their internal bindings against the release and locked anchors; it does not independently authenticate a
GitHub approval if the Mac itself is compromised.

## Setup Andy owns

No workflow or agent configures these settings or approves gates:

1. In PUBLIC `lolly-tools/lolly-work`, create environments `lolly-ing-signing` and `lolly-ing-maintenance`: reviewer
   `ndftz`, Prevent self-review OFF, selected branch `main` only, administrative bypass disabled. Store no signing key
   or private repository credential there.
2. In PRIVATE suse-lolly, create environment `lolly-ing-signing`, selected branch `main` only, with secret
   `LOLLY_ING_CATALOG_SIGNING_KEY`. This is lolly.ing's own P-256 key, never the release key or lolly.tools key.
3. Set private repository variable `LOLLY_ING_PUBLIC_KEY_JWK` to the public JWK. Optional connector origins and CA
   trust variables remain private repository build settings; leave them unset to preserve the previous build.
4. Protect main in both repositories and require reviewed code and qualification checks. The private check named
   `lolly.ing preview tooling tests` runs on every PR and main push, without path filters. Keep default Actions token
   permissions read-only and budget private artifact storage for roughly 2 to 3 GB per run.
5. Before cutover, create a SECOND cluster Secret holding lolly.ing's key under `LW_CATALOG_SIGNING_KEY`. Preserve
   the existing live Secret. The reviewed cutover patch switches the key reference together with the image and config.
6. Complete backup rehearsal, smoke account, network policy and maintenance-recovery prerequisites. No automatic revert
   is safe after maintenance migrations may have changed the schema; the tool holds for Andy's recovery decision.

The helper/workflow blob anchors are code, not GitHub variables. A change needs reviewed source changes and a new
operator tool lock. The active tool stays pinned until the approved changes merge and the lock is regenerated.

## Checks

Node built-ins only:

```sh
node --test .github/lolly-ing-preview/tool.test.mjs
# Also check the boot config against Work's config parser and startup checks:
LOLLY_WORK_DIR=/path/to/lolly-work node --test .github/lolly-ing-preview/tool.test.mjs
```

Tests cover request fields and lifetime, wrong run/stage/artifact/migration/build bindings, the no-key job dependency
chain, required per-stage request artifacts, action pins, private artifact retention and the always-running qualification
workflow. The public helper has its own mocked API tests in Work. No test here dispatches or approves a live workflow.
