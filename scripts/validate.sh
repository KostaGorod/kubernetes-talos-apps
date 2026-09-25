#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root_dir"

schema_base='https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/'
schema_template='{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json'
schema_location="${schema_base}${schema_template}"
rendered_apps="$(mktemp --suffix=.yaml)"
rendered_argocd="$(mktemp --suffix=.yaml)"
trap 'rm -f "$rendered_apps" "$rendered_argocd"' EXIT

printf '%s\n' '== YAML lint =='
yamllint --strict .

printf '%s\n' '== GitHub Actions lint =='
actionlint

printf '%s\n' '== Lint maintained Argo CD chart configuration =='
helmfile -f bootstrap/argocd/helmfile.yaml lint

printf '%s\n' '== Render pinned Argo CD Helm release =='
helmfile -f bootstrap/argocd/helmfile.yaml template > "$rendered_argocd"

printf '%s\n' '== Build talos-develop Application allowlist =='
kustomize build gitops/clusters/talos-develop/apps > "$rendered_apps"

printf '%s\n' '== Validate rendered Argo CD Kubernetes resources =='
kubeconform \
  -strict \
  -summary \
  -skip CustomResourceDefinition \
  -schema-location default \
  -schema-location "$schema_location" \
  "$rendered_argocd"

printf '%s\n' '== Validate Argo CD root Application schema =='
kubeconform \
  -strict \
  -summary \
  -schema-location default \
  -schema-location "$schema_location" \
  bootstrap/argocd/talos-develop-root.yaml

if [[ -s "$rendered_apps" ]]; then
  printf '%s\n' '== Validate selected Application schemas =='
  kubeconform \
    -strict \
    -summary \
    -schema-location default \
    -schema-location "$schema_location" \
    "$rendered_apps"
else
  printf '%s\n' 'Application allowlist is empty; there are no child schemas to check.'
fi
