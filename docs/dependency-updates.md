# Dependency updates

## One workflow, daily or on demand

[Actions > Renovate](https://github.com/KostaGorod/kubernetes-talos-apps/actions/workflows/renovate.yml)
runs every day at **04:17 UTC**. Use **Run workflow**, selecting **main**, to run
the same job immediately. Scheduled runs can be delayed by GitHub; they are not
an exact-time service. Only repository users with Actions write access can
initiate it, not anonymous visitors.

```sh
gh workflow run renovate.yml --repo KostaGorod/kubernetes-talos-apps --ref main
gh run list --repo KostaGorod/kubernetes-talos-apps --workflow renovate.yml
```

Both triggers use the same pinned official `renovatebot/github-action`, image
lookup, `renovate/` branches, PR creation, CI-gated native auto-merge and report.
There is no separate manual updater or hosted-runner dependency. Do not run a
hosted Renovate installation against this repository concurrently: two writers
can collide or create duplicate PRs. Existing `renovate-manual/` PRs predate this
unification; finish those before the first unified run.

The updater is limited to Kubernetes image references under BentoPDF. It keeps
immutable digests and `cloudflared --no-autoupdate`; upgrades happen through Git,
not inside the connector. Single-line image references are required by Renovate's
extractor; preserve their scoped YAML lint exceptions.

| Dependency | Merge policy |
| --- | --- |
| `cloudflare/cloudflared` | Minor, patch and digest updates auto-merge after required CI |
| `ghcr.io/alam00000/bentopdf-simple` | Minor, patch and digest updates auto-merge after required CI |
| Either image, major release | Manual review and merge |
| Tailscale Operator chart, workflow and engine pins | Outside this runner's manager scope; manually maintained |

Cloudflared uses calendar versions: a new month is minor, a new year is major.
Top-level `automerge=false` remains; only the exact two-image non-major package
rule opts in. Both scheduled and manual executions keep normal PR rate limits.

## Checks and GitHub permissions

The main ruleset requires an up-to-date branch, resolved review threads, and
both **Validate GitOps configuration** and **Renovate Action read-only smoke**
from GitHub Actions (integration `15368`). There are no bypass actors, force
pushes or branch deletion. Repository **Allow auto-merge** is enabled. There is
no required approving-review count; eligible updates need no separate merge
click once their checks pass. Argo deploys the merged image pins automatically.

**Important:** GitHub's built-in token requires approval to start bot-created
PR workflow runs when GitHub marks them `action_required`. Approve that run;
then CI and native auto-merge take over. This is not fully unattended CI. We
keep this constraint rather than adding a PAT, privileged `pull_request_target`,
self-approval or a check bypass.

The combined repository setting **Allow GitHub Actions to create and approve
pull requests** must be enabled for PR creation. No review-approval command is
used. Default workflow permissions stay read-only. Only the trusted-main
Renovate job gets Contents/Pull requests write, plus Issues/Checks/Statuses read.
No cluster credentials, persisted checkout credentials, Docker socket mounts,
install scripts, plugins or post-upgrade commands are allowed. Runs serialize
and time out after 15 minutes. Action commits and the engine image digest are
pinned; maintain engine versions in the updater and validation workflows together.

## Readable logs

A short Bash script using the runner's existing `git`, `gh` and `jq` records
main image pins before and after Renovate and prints a table in the step log
and Actions Summary. It labels each pin **Kept** or **Main changed** and lists
Renovate PR titles, proposed versions, links and open/auto-merge-queued/merged
status. Native Renovate logs explain which PRs were created or updated.

The final report also runs after updater failure. API/read failures fail the
step rather than claiming no changes. A pending update branch without an open
PR or exact-head merged PR fails the job: Renovate can catch PR-creation errors
and still exit zero. Exact-head recognition handles retained squash branches
without accepting an unmerged PR or an old merged head.

Main can advance through concurrent merges. A proposed version or queued merge
is not an installed image; the report does not prove registry-latest status or
live deployment. PR CI checks Bash syntax/ShellCheck, executes the report with
real read-only GitHub data, and performs the official Action's read-only registry
lookup. Source validation includes YAML/action lint and Helm/Kubernetes schemas.

## Verify rollout or pause updates

After an update merges, verify BentoPDF's Argo application is **Synced/Healthy**
at the merged revision, both Deployments are ready with the expected image pins,
cloudflared reports the expected version, and the public HTTPS URL works.
Exercise a synthetic PDF operation before claiming functional acceptance.
Readiness and CI do not guarantee compatibility or provide automatic rollback.

Disable **Renovate** in Actions to pause both triggers. Remove the scoped
`automerge=true` rule through a reviewed PR to pause automatic merges. Already
queued native auto-merges must be disabled on their PRs separately. Revert a
bad image pin through a reviewed PR; preserve tunnel credentials and routes.

## References

- [Official Renovate Action and token constraints](https://github.com/renovatebot/github-action#token)
- [Renovate automerge](https://docs.renovatebot.com/key-concepts/automerge/)
- [GitHub scheduled workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
