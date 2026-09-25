# Paperless-ngx

A new single-replica Paperless-ngx instance with PostgreSQL, Redis, and
persistent document/data/consume storage. The application is exposed only by a
Tailscale Kubernetes Operator HTTPS Ingress (`paperless.myth-rudd.ts.net`); no
public ingress, Funnel, or Cloudflare Tunnel is configured.

Before syncing this Application for the first time:

1. Create the `paperless` namespace (Argo CD can also create it).
2. Generate unique PostgreSQL and Paperless admin credentials plus a Django
   secret key, and create the `paperless-runtime` Kubernetes Secret with keys
   `POSTGRES_PASSWORD`, `PAPERLESS_ADMIN_PASSWORD`, and `PAPERLESS_SECRET_KEY`.
   Do this directly in the cluster; do not commit credential values. The initial
   superuser name is `paperless-admin`.
3. Ensure the `operator-oauth` Secret exists in `tailscale` with keys
   `client_id` and `client_secret`, and the tailnet policy grants the operator
   ownership of `tag:talos-develop-k8s-operator` and permission to create
   proxies tagged `tag:talos-develop-service`. Tailscale documents these
   requirements in its [operator setup guide](https://tailscale.com/docs/kubernetes-operator/install-operator).

Persistent volumes use the existing `hcloud-volumes-encrypted` StorageClass;
there is no new storage platform. Requested PVC capacity totals 25 GiB across
four Hetzner CSI volumes (5 GiB PostgreSQL, 5 GiB Paperless data, 10 GiB media,
5 GiB consume); actual billable capacity and price depend on Hetzner volume
billing/rounding. The volumes are retained by the StorageClass and require a
separately configured backup and tested restore procedure before this is used
for important documents.
