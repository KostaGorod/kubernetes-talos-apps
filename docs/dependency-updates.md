# Dependency updates

## Run Renovate now from GitHub

The **Renovate now** workflow uses the official `renovatebot/github-action`
with GitHub's built-in `GITHUB_TOKEN`. It looks up image versions and digests, then
creates or updates bot-authored PRs. No PAT, private-key secret or hosted portal
login is required. This setup PR does not manually bump either workload image.

After this workflow is merged into the default branch:

1. Open **Actions > Renovate now > Run workflow**.
2. Select **main**, then click **Run workflow**. Other branches are skipped.
3. Inspect its job log and the generated `renovate-manual/` update PRs.
4. Approve the bot-created PR workflow run if GitHub marks it `action_required`.
   Both required CI checks must pass on an up-to-date branch.
5. Eligible minor, patch and digest image updates use native GitHub auto-merge.
   Major versions remain manual. The existing BentoPDF Argo
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
availability, CI or branch protection. Eligible updates merge automatically
after their checks pass; major upgrades still need review and manual merge.

## Permissions and safety

Enable **Settings > Actions > General > Workflow permissions > Allow GitHub
Actions to create and approve pull requests**. GitHub combines PR creation and
approval in that repository setting. The workflow needs PR creation only: it
contains no review-approval command. `RENOVATE_FORCE` enables native
`platformAutomerge`, while the repository keeps top-level `automerge=false`
and allows only minor, patch and digest updates to the two exact image names.
Do not change default workflow permissions to write; writes are granted only
to the manual Renovate job.

The job has Contents/Pull requests write, Issues read for initialization, and
Checks/Statuses read for merge eligibility. The Dependency Dashboard is disabled on this path,
so Issues write is unnecessary. Checkout loads only trusted workflow/report code
with persisted Git credentials disabled. No cluster credentials,
PR-triggered privileged execution, Docker socket, install scripts, plugins or
post-upgrade commands are used. Execution is allowlisted to this repository's
trusted `main`, serializes manual runs and times out after 15 minutes. The
official Action runs on `ubuntu-latest`, which provides Docker. Both the Action
commit and its Renovate image digest are pinned. The engine container receives
no host volumes or Docker socket; the Action uses runner Docker to launch it.

An official `actions/github-script` read-only check follows the updater. If a
pending `renovate-manual/` branch has no open or exact-head merged PR, the job fails with an explicit
message instead of presenting branch creation alone as success. Renovate can
catch PR-creation errors and exit zero, so its exit status is not sufficient.
The check verifies PR state, not successful CI or deployment. Exact-head merged
PRs also cover squash merges whose original branch commits are not on main.

## Read the before/after report

Each manual run has named steps to record starting versions, execute official
Renovate, and report the outcome. The final step writes the same readable rows
to its log and the Actions **Summary** page, even if the updater fails:

- **Main before / Main after** show actual image tags and shortened digests in
  committed main at each snapshot. A concurrent main change is labeled rather
  than attributed to Renovate.
- **Proposed in PR** and its clickable PR link show the image pin proposed by
  an open Renovate update PR, not an installed version.
- **PR created / updated / reused** distinguish new PRs from existing proposals;
  **auto-merge enabled** means queued, not merged. Existing PRs merged during the
  run are labeled **PR merged** after GitHub readback.
- **Kept on main; no PR proposal** means no open proposal was found for that
  dependency, not proof that registry lookup succeeded or that no release exists.
- Missing PRs for pending update branches remain a failure. API/report failures
  are reported as unavailable, never silently converted into unchanged success.

Native auto-merge can advance main during or after the run. The report never
claims that a merged image has already deployed.
The normal PR CI exercises report tests and a live read-only report smoke;
this tests rendering and GitHub reads without starting another update run.

GitHub's built-in token can create update PRs, but GitHub requires manual
approval for their workflow runs. A pending or skipped check is not a pass.
This workflow intentionally accepts that tradeoff to avoid extra credentials;
it does not bypass the approval with `pull_request_target` or privileged
execution. If GitHub denies PR creation, inspect the setting above instead of
adding a PAT automatically.

The repository's active main ruleset requires **Validate GitOps configuration**
and **Renovate Action read-only smoke** from GitHub Actions (integration ID
`15368`), an up-to-date branch and resolved review threads. It prevents branch
deletion and force pushes, with no bypass actors. GitHub **Allow auto-merge**
is enabled. No mandatory approving-review count is configured, so eligible bot
PRs need no separate merge approval after CI. The workflow cannot modify this policy.

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
| `cloudflare/cloudflared` | Non-major image PR, CI-gated auto-merge | Minor, patch and digest eligible for automerge |
| `ghcr.io/alam00000/bentopdf-simple` | Non-major image PR, CI-gated auto-merge | Minor, patch and digest eligible for automerge |
| Either image, major release | Create/update PR, manual review | Manual review and merge |
| Tailscale Operator chart | Outside manual manager scope | Manual review and merge |

Hosted automerge requires the required-check protection above before activating
the App. It uses squash PR merging with `platformAutomerge=false` and
`ignoreTests=false`, so GitHub's repository-wide Allow auto-merge toggle is not
needed for that separate hosted execution. The manual runner instead requests
native platform auto-merge, gated by the main ruleset above. The App requests its
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
PR CI also executes the official Renovate Action and pinned image with a
read-only token and `dryRun=lookup`, testing launcher/authentication/extraction
without dependency branch or PR writes. This does not prove PR-write permission.
Maintain the pinned engine version in the manual and validation workflows together.
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
- [Renovate forced configuration](https://docs.renovatebot.com/self-hosted-configuration/#force)
- [GitHub Actions repository permissions](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository)
- [Hosted App](https://github.com/apps/renovate)
- [Hosted on-demand jobs and logs](https://docs.renovatebot.com/mend-hosted/overview/)
