# talos-develop Argo CD Application allowlist

Add a reviewed `Application` manifest here and include its filename in
`kustomization.yaml`. Applications in this directory are the explicit allowlist
managed by the existing root app. The Paperless-ngx and Tailscale Operator
Applications are installed here; infrastructure-managed services remain out
of this directory unless ownership is explicitly transferred and reviewed.
