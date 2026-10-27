# Dependency updates

## Run Renovate now from GitHub

The **Renovate now** workflow runs the real Renovate CLI with GitHub's built-in
`GITHUB_TOKEN`. It looks up current image versions and immutable digests, then
creates or updates bot-authored PRs. No PAT, private-key secret or hosted portal
login is required. This setup PR does not manually bump either workload image.

After this workflow is merged into the default branch:

1. Open **Actions > Renovate now > Run workflow**.
2. Select **main**, then click **Run workflow**. Other branches are skipped.
3. Inspect its job log and the generated `renovate-manual/` update PRs.
4. Approve the bot-created PR workflow run if GitHub marks it `action_required`.
   Run and check the normal `Validate GitOps configuration` check before merging.
5. Merge a reviewed update PR after CI passes. The existing BentoPDF Argo
   Application automatically deploys its merged image pins.

The same button can be invoked from the CLI:

```sh
gh workflow run renovate-manual.yml --repo KostaGorod/kubernetes-talos-apps --ref main
gh run list --repo KostaGorod/kubernetes-talos-apps --workflow renovate-manual.yml
gh pr list --repo KostaGorod/kubernetes-talos-apps --search 'head:renovate-manual/'
```

There is no schedule on this workflow, so it runs only when requested. It
bypasses Renovate's configured update-creation schedule and hourly/concurrent
PR limits for this invocation. It does not bypass version selection, registry
availability, CI, human review or branch protection, and it never merges.

## Permissions and safety

Enable **Settings > Actions > General > Workflow permissions > Allow GitHub
Actions to create and approve pull requests**. GitHub combines PR creation and
approval in that repository setting. The workflow needs PR creation only: it
contains no approval command and explicitly forces `automerge=false` through
CLI overrides, even though repository package rules permit hosted automerge.
Do not change default workflow permissions to write; writes are granted only
to the manual Renovate job.

The job has Contents/Pull requests write and Issues read for Renovate's
repository initialization. The Dependency Dashboard is disabled on this path,
so Issues write is unnecessary. No cluster credentials, repository checkout,
PR-triggered privileged execution, Docker socket, install scripts, plugins or
post-upgrade commands are used. Execution is allowlisted to this repository's
trusted `main`, serializes manual runs and times out after 15 minutes. The
pinned native CLI runs on `ubuntu-slim`.

GitHub's built-in token can create update PRs, but GitHub requires manual
approval for their workflow runs. A pending or skipped check is not a pass.
This workflow intentionally accepts that tradeoff to avoid extra credentials;
it does not bypass the approval with `pull_request_target` or privileged
execution. If GitHub denies PR creation, inspect the setting above instead of
adding a PAT automatically.

Protect `main` with required **Validate GitOps configuration** from GitHub
Actions, integration ID `15368`, and require branches to be up to date before
merging. Do not give an updater a bypass. This workflow does not create or
modify repository policy.

## Hosted Renovate remains separate

The [official hosted Mend Renovate App](https://github.com/apps/renovate) is
optional for scheduled updates and requires only an approved installation on
this repository. It manages its own credentials. Its `renovate/` branches are
separate from the manual runner's `renovate-manual/` branches so the two actors
do not rewrite the same branches. They can still propose duplicate updates;
check existing PRs before merging and close redundant proposals after one lands.
Use one execution path for a given update rather than merging both.

The manual runner is deliberately limited to the Kubernetes image manager for
BentoPDF and cloudflared. The existing custom Tailscale Operator chart manager
remains available to hosted Renovate, but is not run by this button. Workflow
and CLI tool pins remain manually maintained.

| Dependency | Manual button | Hosted merge policy |
| --- | --- | --- |
| `cloudflare/cloudflared` | Create/update image PR | Minor, patch and digest eligible for automerge |
| `ghcr.io/alam00000/bentopdf-simple` | Create/update image PR | Minor, patch and digest eligible for automerge |
| Either image, major release | Create/update PR, manual review | Manual review and merge |
| Tailscale Operator chart | Outside manual manager scope | Manual review and merge |

Hosted automerge requires the required-check protection above before activating
the App. It uses squash PR merging with `platformAutomerge=false` and
`ignoreTests=false`, so GitHub's repository-wide Allow auto-merge toggle is not
needed. No manual-run PR is automerged by this workflow. The App requests its
published permission set, including workflow writes, despite workflow updates
being outside this repository's configured managers. Review its permission
screen and select only this repository. No App installation is performed by
merging source. The hosted portal supports its own on-demand runs and logs.

## Images and validation

Cloudflared uses calendar versions. A new month is a minor update; a new year
is a major update. Preserve immutable digests and `--no-autoupdate`; upgrades
belong in Git, not inside the running connector. The Kubernetes extractor needs
single-line image references. Keep the line-specific YAML lint exceptions so
longer future tags/digests do not break lint or hide the image in a folded scalar.

Source CI runs YAML/action lint, bootstrap/selection validation, BentoPDF and
tunnel Kustomize/schema validation, and strict Renovate config validation.
Maintain the pinned CLI in the manual and validation workflows together.
Mend manages its hosted engine version independently.

Local checks with Node 24 installed:

```sh
mise run validate
npx --yes --ignore-scripts --package=renovate@44.186.6 \
  renovate-config-validator --strict --no-global .github/renovate.json
RENOVATE_CONFIG_FILE=.github/renovate.json LOG_LEVEL=debug \
  npx --yes --ignore-scripts --package=renovate@44.186.6 renovate \
  --platform=local --onboarding=false --require-config=optional --dry-run=lookup
```

Local lookup contacts real registries, but does not prove PR-write permissions,
bot identity, CI approval or live deployment. Optional native RE2 may be absent
with install scripts disabled; the CLI reports its JavaScript RegExp fallback.

After a real update PR merges, verify Argo is `Synced` and `Healthy` at the
merged revision, both Deployments are ready with expected images, cloudflared
reports its expected version and BentoPDF's HTTPS URL works. Exercise a
synthetic browser PDF operation before claiming functional acceptance. CI and
readiness do not guarantee runtime compatibility or provide automatic rollback.

To pause manual runs, disable **Renovate now** in Actions. To pause hosted
merges, remove the scoped `automerge=true` package rule via reviewed config
change. To stop hosted processing, set top-level `enabled=false` or remove this
repository from the App installation. Revert a bad image through a reviewed PR
to its known-good tag/digest; Argo reconciles that revision. Preserve tunnel
credentials and hostname routes.

## References

- [Official action's built-in token and workflow-approval constraints](https://github.com/renovatebot/github-action#token)
- [Renovate CLI force-overrides](https://docs.renovatebot.com/self-hosted-configuration/#forcecli)
- [GitHub Actions repository permissions](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository)
- [Hosted App](https://github.com/apps/renovate)
- [Hosted on-demand jobs and logs](https://docs.renovatebot.com/mend-hosted/overview/)
