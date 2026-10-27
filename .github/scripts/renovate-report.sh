#!/usr/bin/env bash
set -euo pipefail

# Read pinned main revisions, never PR code. gh/jq are included on ubuntu-latest.
images() {
  local revision=$1 path line content image
  for path in app managed-tunnel; do
    content=$(git show "$revision:gitops/apps/bentopdf/$path.yaml")
    image=''
    while IFS= read -r line; do
      if [[ "$line" =~ ^[[:space:]]*image:[[:space:]]*([^[:space:]#]+) ]]; then
        [[ -z $image ]] || return 1
        image=${BASH_REMATCH[1]}
      fi
    done <<< "$content"
    [[ -n $image ]] || return 1
    printf '%s\t%s\n' "$path" "$image"
  done
}

before="$RUNNER_TEMP/renovate-before.tsv"
if [[ ${1:?Expected before or after} == before ]]; then
  date -u +%Y-%m-%dT%H:%M:%SZ > "$RUNNER_TEMP/renovate-started-at"
  git fetch --no-tags origin main
  images FETCH_HEAD > "$before"
  cat "$before"
  exit
fi

git fetch --no-tags origin main
revision=$(git rev-parse FETCH_HEAD)
images "$revision" > "$RUNNER_TEMP/renovate-after.tsv"
prs=$(gh api --paginate "repos/$GITHUB_REPOSITORY/pulls?state=all&base=main&per_page=100" |
  jq -s --arg repo "$GITHUB_REPOSITORY" \
    'add | map(select(.head.repo.full_name == $repo and (.head.ref | startswith("renovate/"))))')
missing=0
refs=$(gh api --paginate "repos/$GITHUB_REPOSITORY/git/matching-refs/heads/renovate/" \
  --jq '.[] | [(.ref | ltrimstr("refs/heads/")), .object.sha] | @tsv')
while IFS=$'\t' read -r branch sha; do
  [[ -n $branch ]] || continue
  ahead=$(gh api "repos/$GITHUB_REPOSITORY/compare/$revision...$sha" --jq .ahead_by)
  if [[ $ahead != 0 ]] && ! jq -e --arg branch "$branch" --arg sha "$sha" \
    'any(.[]; .head.ref == $branch and (.state == "open" or (.merged_at != null and .head.sha == $sha)))' \
    <<< "$prs" > /dev/null; then
    printf '::error::Update branch has no open or exact-head merged PR: %s\n' "$branch"
    missing=1
  fi
done <<< "$refs"

declare -A after
while IFS=$'\t' read -r name image; do after[$name]=$image; done < "$RUNNER_TEMP/renovate-after.tsv"

{
  printf '## Renovate report\n\nUpdater outcome: %s\n\n' "${RENOVATE_OUTCOME:-unknown}"
  printf '| Image | Main before | Main after | Result |\n| --- | --- | --- | --- |\n'
  while IFS=$'\t' read -r name old; do
    new=${after[$name]}
    [[ -n $new ]] || exit 1
    result=Kept; [[ "$old" == "$new" ]] || result='Main changed'
    printf '| %s | %s | %s | %s |\n' "$name" "$old" "$new" "$result"
  done < "$before"
  printf '\n### Update PRs\n\n'
  jq -r --arg started "$(cat "$RUNNER_TEMP/renovate-started-at")" \
    '.[] | select(.state == "open" or (.merged_at != null and .merged_at >= $started)) |
    "- #\(.number): \(.title) — \(if .merged_at then "merged" elif .auto_merge then "auto-merge queued" else "open" end) — \(.html_url)"' <<< "$prs"
  printf '\nMain changes may include concurrent merges. Proposed PR versions are not installed versions. Deployment is not verified here.\n'
} | tee -a "$GITHUB_STEP_SUMMARY"
exit "$missing"
