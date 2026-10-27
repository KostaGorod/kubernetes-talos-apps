# Dependency updates

## Plan and scope

Complete the existing GitOps path without an image updater in the cluster:

1. Run Renovate daily against this repository only.
2. Open digest-pinned image update PRs and run the normal read-only PR validation.
3. Automerge only the approved image updates after validation passes.
4. Let the existing BentoPDF Argo CD Application deploy the merged manifest.

The workflow runs at `03:43 UTC` daily and supports manual dispatch on `main`.
GitHub may delay scheduled runs. The weekly Renovate window is removed, so
updates are eligible on every run. No workload version is changed by this PR.

| Dependency | Detection | Merge policy |
| --- | --- | --- |
| `cloudflare/cloudflared` | Kubernetes image in `gitops/apps/bentopdf` | Minor, patch and digest updates automatic |
| `ghcr.io/alam00000/bentopdf-simple` | Kubernetes image in `gitops/apps/bentopdf` | Minor, patch and digest updates automatic |
| Either image, major release | Same manager | Manual review and merge |
| Tailscale Operator chart | Existing custom Helm manager | Manual review and merge |
| Other workloads and workflow/tool pins | Outside enabled manager scope | Manual maintenance |

Cloudflared uses calendar versions. A new month is a minor update; a new year
is a major update and remains manual. Minor/patch labels are not a guarantee of
runtime compatibility. CI validates configuration, not a running tunnel or a
browser PDF operation. Argo readiness probes provide rollout feedback, not an
automated functional test or rollback.

The Kubernetes manager reads image references on a single line. Keep the
BentoPDF `image:` scalar on one line with its scoped line-length lint exception;
a folded scalar is valid Kubernetes YAML but is not extracted by this manager.
Both images retain immutable digests. Preserve `--no-autoupdate` in cloudflared;
container upgrades belong in Git, not inside the running container.

## Authentication and merge safety

Use a dedicated GitHub App installed on **this repository only**. Do not reuse
the read-only Argo repository App or widen its permissions. Supply:

| Repository permission | Level | Purpose |
| --- | --- | --- |
| Contents | Write | Dependency branches and squash merges |
| Pull requests | Write | Create and maintain update PRs |
| Issues | Read | Renovate repository initialization |
| Checks | Read | Observe GitHub Actions results |
| Commit statuses | Write | Renovate config-validation status and status reads |
| Metadata | Read | Repository discovery and active-rule lookup |

No Administration, Actions-write, Workflows-write or cluster access is needed.
The workflow explicitly narrows the installation token to this repository and
these permissions. The token expires within an hour and is revoked when the
job finishes. The default `GITHUB_TOKEN` has no granted permissions. Renovate
runs only for trusted `main` schedule/manual events, never PR events. Install
scripts and post-upgrade shell commands are disabled.

An App token is intentional. GitHub's built-in `GITHUB_TOKEN` can create PRs,
but their workflows require manual approval. Falling back to that token would
make this unattended update path depend on a person approving every PR check.
The normal `pull_request` validation remains unprivileged, with a read-only
token and no App private key. There is no `pull_request_target` execution or
privileged dispatch of PR code.

Renovate performs PR automerge itself with `platformAutomerge=false`,
`ignoreTests=false` and squash merging. GitHub's repository-wide **Allow
auto-merge** setting is not required for this mode and can remain disabled.
A subsequent Renovate run merges an eligible PR after CI passes, so daily runs
can add another day of delay. Renovate normally merges at most one PR per
base branch per run. Pending, failing or absent tests must not be bypassed.

## One-time activation after approval

These are external settings, not effects of merging source files:

1. Create the dedicated App, grant only the permissions above, disable webhooks
   if unused, and install it only on `kubernetes-talos-apps`.
2. Store its client ID in repository variable `RENOVATE_APP_CLIENT_ID` and its
   private key in repository Actions secret `RENOVATE_APP_PRIVATE_KEY` through
   the approved secret-handling route. Never put the key in Git or PR text.
3. Add an **active branch ruleset** for `refs/heads/main`. Require the status
   check `Validate GitOps configuration`, bind its expected source to GitHub
   Actions, integration ID `15368`, and enable **Require branches to be up to
   date before merging**. Do not give the Renovate App a bypass. Do not require
   human PR approval for the automated scope unless manual approval is desired.
   Classic branch protection alone is not recognized by the workflow preflight.
4. Merge the source PR after its validation and review pass. No GitHub App,
   secret, variable, ruleset or workload rollout is provisioned by that merge.
5. Dispatch and inspect the first real run:

   ```sh
   gh workflow run renovate.yml --repo KostaGorod/kubernetes-talos-apps --ref main
   gh run list --repo KostaGorod/kubernetes-talos-apps --workflow renovate.yml
   gh pr list --repo KostaGorod/kubernetes-talos-apps --search 'head:renovate/'
   ```

The updater fails before dependency writes if its App token cannot be created
or the strict named GitHub Actions check is not required by an active ruleset.
It does not create or repair security policy automatically. A ruleset bypass
would defeat enforcement even if the required-check preflight passed, so leave
the App off every bypass list.

## Initial acceptance and routine checks

Source CI runs YAML/action lint, the maintained bootstrap/selection validation,
BentoPDF plus cloudflared Kustomize/schema validation, and strict Renovate
configuration validation using the same engine version as the updater.

After activation, verify the actual chain rather than treating green source CI
as proof of deployment:

- A trusted-main Renovate run succeeds and its logs show both image dependencies.
- The resulting image PR contains the expected version and digest, and its
  `Validate GitOps configuration` check runs without manual workflow approval.
- After green CI, the next Renovate run merges only the eligible non-major PR.
  Major image updates and Tailscale Operator updates remain manual.
- Argo's `bentopdf` Application reaches `Synced` and `Healthy` at the merged
  `main` revision. Its automatic sync is already enabled; the root does not
  need a manual sync for changes to an existing child's workload manifests.
- Both Deployments become ready with the new images. Verify cloudflared's
  version and the existing published BentoPDF HTTPS URL. Separately exercise
  a synthetic browser PDF operation before claiming functional acceptance.

For missing PRs, check the updater run first, then extraction and registry
lookup. For an unmerged PR, inspect its checks, merge conflicts, major-version
classification and the next updater run. For an old running image after merge,
inspect Argo's compared revision and Deployment rollout. A healthy updater in
another repository is not evidence that this repository was processed.

Maintain the pinned Renovate version in both workflows together. GitHub Actions
and engine pins are intentionally not self-updated. To validate locally with
Node 24 installed:

```sh
mise run validate
npx --yes --ignore-scripts --package=renovate@44.186.6 \
  renovate-config-validator --strict --no-global .github/renovate.json
RENOVATE_CONFIG_FILE=.github/renovate.json LOG_LEVEL=debug \
  npx --yes --ignore-scripts --package=renovate@44.186.6 renovate \
  --platform=local --onboarding=false --require-config=optional --dry-run=lookup
```

Local lookup contacts real image/chart registries but does not create PRs or
prove App permissions, automatic checks, merging or a deployed rollout.

## Pause and recovery

Disable the `Renovate` workflow to stop new update processing and Renovate-owned
merges. Existing PRs remain available for manual review. Revert an affected
image manifest to its previous known-good version and digest through a reviewed
PR; Argo then reconciles that Git revision. Readiness failures do not trigger
an automatic Git revert. Preserve the working tunnel token and hostname routes.

## References

- [Renovate automerge behavior](https://docs.renovatebot.com/key-concepts/automerge/)
- [Official App-token action and permission scoping](https://github.com/actions/create-github-app-token/tree/v3.3.0)
- [Built-in token PR workflow approval constraint](https://github.com/renovatebot/github-action#token)
