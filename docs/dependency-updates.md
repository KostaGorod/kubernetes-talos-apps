# Dependency updates

## Plan and scope

Use the [official hosted Mend Renovate App](https://github.com/apps/renovate),
installed only on `kubernetes-talos-apps`. It is free for public and private
repositories and manages its own credentials and execution. No PAT, custom App,
private-key secret or self-hosted updater workflow is needed.

1. The hosted service processes the repository and opens digest-pinned update PRs.
2. Normal read-only PR validation checks the proposed manifests and config.
3. Renovate merges only the approved image updates after validation passes.
4. The existing BentoPDF Argo CD Application deploys the merged manifest.

The old weekly-only window is removed. Updates are eligible on every hosted
run, not restricted to a fixed time in this repository. Mend controls the job
queue and cadence. Its current scheduler documentation lists active jobs every
four hours and inactive/onboarding jobs daily; processing is not an exact-time
SLA. There is no repository cron or manual Actions updater to dispatch.

| Dependency | Detection | Merge policy |
| --- | --- | --- |
| `cloudflare/cloudflared` | Kubernetes image in `gitops/apps/bentopdf` | Minor, patch and digest automatic |
| `ghcr.io/alam00000/bentopdf-simple` | Kubernetes image in `gitops/apps/bentopdf` | Minor, patch and digest automatic |
| Either image, major release | Same manager | Manual review and merge |
| Tailscale Operator chart | Existing custom Helm manager | Manual review and merge |
| Other workloads and workflow/tool pins | Outside enabled manager scope | Manual maintenance |

Cloudflared uses calendar versions. A new month is a minor update; a new year
is a major update and remains manual. CI validates configuration, not a running
tunnel or browser PDF operation. Minor/patch labels do not guarantee runtime
compatibility. Argo readiness probes provide rollout feedback, not functional
tests or automatic rollback. This source change does not bump either image.

Keep the BentoPDF `image:` reference on one line with its scoped lint exception.
The Kubernetes manager misses folded YAML image scalars. Preserve immutable
digests and cloudflared's `--no-autoupdate`; container upgrades belong in Git.

## Installation and required CI

These external setup steps are not performed by merging source files:

1. Before activating this automerge config, protect `main` with a branch rule
   or active ruleset requiring `Validate GitOps configuration` from GitHub
   Actions, integration ID `15368`. Require branches to be up to date before
   merging. Do not give Renovate a bypass or disable the check. If human review
   is mandatory, unattended merging will wait for that review.
2. Open the [official Renovate App installation](https://github.com/apps/renovate/installations/new),
   select **Only select repositories**, and select `kubernetes-talos-apps`.
   Review the permission screen before approving. If already installed, add
   only this repository to its installation. No account-wide selection is needed.
3. Merge this PR after source review and green CI. Renovate reads configuration
   from the default branch. Follow any actual onboarding PR if one is created;
   the repository already contains `.github/renovate.json`.
4. Check repository status and job logs in the [Mend Developer Portal](https://developer.mend.io/)
   and inspect resulting dependency PRs and their checks.

The official App requests its published permission set, including repository
content/PR writes, status/check and issue access, workflow writes, and some
read-only metadata/security/administration access. Restricting the installation
to this repository is the access boundary. The configured managers do not
update workflow files, but that does not narrow the App's granted permissions.
Mend temporarily clones the repository and retains dependency/version and PR
metadata as described in its security/privacy documentation. It receives no
cluster credentials. Do not install it on unrelated repositories for this setup.

Renovate performs squash PR automerge with `platformAutomerge=false` and
`ignoreTests=false`. GitHub's repository-wide **Allow auto-merge** toggle is not
required. A later hosted run merges an eligible green PR; this is not immediate.
Major image and operator-chart updates remain manual. Missing, pending or
failing validation must block merging through the required-check protection.
Unlike the removed custom workflow, there is no repository preflight that
checks this policy. Configure protection before enabling the automerge config.

Normal `pull_request` validation keeps a read-only token and no Renovate secret.
App-created PRs use normal GitHub event delivery, not the built-in Actions-token
PR approval workaround. No `pull_request_target` or privileged PR execution is
introduced. Verify the first real PR check runs without manual approval.

## Verification and maintenance

Source CI runs YAML/action lint, bootstrap/selection validation, BentoPDF and
tunnel Kustomize/schema validation, and strict Renovate config validation.
The pinned CLI version is a validation tool only; Mend manages the hosted
engine version independently. Maintain the CI validator and action pins manually.

After installation and merge, verify:

- Hosted logs show both image dependencies and dependency PRs carry new digests.
- `Validate GitOps configuration` runs on the actual update PR without manual
  workflow approval, and only an eligible green non-major PR is automerged.
- Argo's `bentopdf` Application becomes `Synced` and `Healthy` at merged `main`,
  with both Deployments ready on their intended images. Existing child workload
  changes do not require a manual root sync.
- Cloudflared reports its expected version and BentoPDF's existing HTTPS URL
  works. Exercise a synthetic browser PDF operation before claiming functional
  acceptance. Source CI alone does not prove any live update/merge/deploy step.

For missing PRs, check installation scope and hosted job status, then extraction
and registry lookup. For an unmerged PR, inspect required checks, conflicts,
version classification and the next hosted run. For an old running image after
merge, inspect Argo's compared revision and Deployment rollout.

Local checks with Node 24 installed:

```sh
mise run validate
npx --yes --ignore-scripts --package=renovate@44.186.6 \
  renovate-config-validator --strict --no-global .github/renovate.json
RENOVATE_CONFIG_FILE=.github/renovate.json LOG_LEVEL=debug \
  npx --yes --ignore-scripts --package=renovate@44.186.6 renovate \
  --platform=local --onboarding=false --require-config=optional --dry-run=lookup
```

Lookup contacts real registries without creating PRs. It does not prove hosted
installation, automatic checks/merge or deployed behavior. With install scripts
disabled the optional native RE2 module may be unavailable; the CLI reports its
JavaScript RegExp fallback explicitly.

## Pause and recovery

Set top-level `automerge=false` and remove the scoped `automerge=true` rule via
reviewed config change to stop automatic merges while retaining update PRs.
To stop all processing, set top-level `enabled=false`, or use GitHub's App
installation settings to remove this repository from the selected installation.
There is no updater Actions workflow to disable. Verify the hosted status after
pausing. Revert a bad image through a reviewed PR to its previous known-good
tag and digest; Argo reconciles that revision. Readiness failure does not cause
an automatic Git revert. Preserve tunnel credentials and hostname routes.

## References

- [Official App and installation](https://github.com/apps/renovate)
- [Hosted onboarding](https://docs.renovatebot.com/getting-started/installing-onboarding/)
- [Hosted job scheduling](https://docs.renovatebot.com/mend-hosted/job-scheduling/)
- [Permissions and privacy](https://docs.renovatebot.com/security-and-permissions/)
- [Automerge behavior](https://docs.renovatebot.com/key-concepts/automerge/)
