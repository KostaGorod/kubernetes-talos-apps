# Paperless-ngx

A single-replica Paperless-ngx instance with PostgreSQL, Valkey, and private
HTTPS through the Tailscale Kubernetes Operator. No public ingress, Funnel, or
Cloudflare Tunnel is configured.

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

PostgreSQL has a separate 10 GiB claim. Paperless data, media, and consume use
one 10 GiB claim with `hcloud-volumes-encrypted`; the previous media and consume
claims remain retained but unmounted. The claims use Hetzner CSI's 10 GB minimum
volume size. Configure and test backups before storing important documents.
