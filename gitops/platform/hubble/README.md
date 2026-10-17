# Hubble tailnet access

OpenTofu in `KostaGorod/talos-hcloud` owns Cilium, Hubble Relay, and Hubble UI.
This directory owns only the Tailscale Ingress, not the Cilium Helm release.

The shared `ingress` ProxyGroup exposes `https://hubble.myth-rudd.ts.net`
with `tag:prod-app`. No public ingress or Hubble Relay endpoint is exposed.
Tailnet access policy is the access boundary; Hubble UI has no additional
login and displays cluster-wide network activity.
