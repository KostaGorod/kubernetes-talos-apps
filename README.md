# Kubernetes Talos Apps

GitOps selection for the `talos-develop` Kubernetes cluster, using its existing
Argo CD installation. Cluster lifecycle and base cluster services remain owned
by the Talos infrastructure repository; this repository holds the cluster's
explicitly selected Argo CD Applications.

## Current state

- Argo CD is installed in namespace `argocd` by Helm chart `argo-cd` `9.5.11`
  (Argo CD `v3.3.9`). The chart remains Helm/bootstrap-owned; this setup does
  not transfer chart ownership to Argo CD.
- `bootstrap/argocd/talos-develop-root.yaml` connects the existing Argo CD to
  this public Git repository. It selects `main` and
  `gitops/clusters/talos-develop/apps`.
- That directory is an explicit Kustomize allowlist, intentionally empty at
  first. No additional workloads or shared/base services are selected. Add
  reviewed `Application` manifests there and list each one in
  `kustomization.yaml` before syncing the root.
- The root has no automated sync or pruning policy. Root sync and future app
  selection are deliberate operator actions.
- The Argo CD Service is `ClusterIP`; no public ingress, NodePort, or
  Cloudflare Tunnel is configured here.

## Bootstrap and validation

Install mise with its official Linux installer if needed:

```sh
curl -fsSL https://mise.run | sh
```

From this repository root, trust the config, install pinned validation tools,
and run the credential-free checks:

```sh
mise trust
mise install
mise run validate
```

CI runs this same validation task for pull requests and pushes to `main`.
It lints YAML and GitHub Actions, builds the cluster selection, and validates
Kubernetes and Argo CD schemas. It does not need cluster credentials or change
the cluster.

Apply the one-time root Application using the Talos `develop` kubeconfig from
the infrastructure checkout (adjust the path for your local checkout):

```sh
kubectl --kubeconfig /path/to/talos-hcloud/clusters/develop/.generated/kubeconfig \
  apply -f bootstrap/argocd/talos-develop-root.yaml
```

The root watches the committed `main` branch. Inspect it in Argo CD and sync it
manually. The empty Kustomize selection produces no child resources until
reviewed Applications are added.

## Private Argo CD access

Keep the Argo CD Service private as a `ClusterIP`. A temporary `kubectl
port-forward` on the connected Tailscale runner provides operator access; bind
only to that runner's Tailscale address, not `0.0.0.0`:

```sh
kubectl --kubeconfig /path/to/talos-hcloud/clusters/develop/.generated/kubeconfig \
  -n argocd port-forward --address <runner-tailscale-ip> \
  svc/argocd-server 18443:443
```

Then open `https://<runner-tailscale-ip>:18443` from an authorized tailnet
peer (the Argo CD TLS certificate may be self-signed). This port-forward is
session-bound, not a durable UI endpoint. This repository creates no tailnet
ingress/operator or public endpoint.

## Current security posture and outstanding work

This bootstrap leaves the existing chart settings in place: the `argocd-server`
Service is ClusterIP, chart ingress and Dex are disabled, `server.insecure` is
false, and the admin account is enabled. The live default AppProject allows any
source repository, destination, and cluster resource; the live `argocd-rbac-cm`
has empty policy overrides. This work has not added custom project/RBAC policy
or narrowed Argo CD Secret access. The requested Secret RBAC work remains
outstanding and requires separate design/review before describing this
installation as hardened. The port-forward is an access path, not an
authentication or authorization change.

Cloudflared was explicitly postponed and is not included or selected. No
Cloudflare credentials or hostname are needed for this Argo-only stage.
