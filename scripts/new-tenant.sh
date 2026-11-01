#!/usr/bin/env bash
# Scaffold infra/tenants/<slug>/ from the template.
# Usage: scripts/new-tenant.sh <slug> <tenant-account-id> <region> <platform-account-id> <org-id>
# Example: scripts/new-tenant.sh acme 111122223333 us-east-1 999988887777 o-abc123def4
set -euo pipefail

if [ "$#" -ne 5 ]; then
  sed -n '2,4p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
fi
slug=$1 account=$2 region=$3 platform=$4 org=$5

[[ $slug =~ ^[a-z][a-z0-9-]{1,30}$ ]] || { echo "bad slug: $slug" >&2; exit 2; }
[[ $account =~ ^[0-9]{12}$ ]]        || { echo "tenant account id must be 12 digits" >&2; exit 2; }
[[ $platform =~ ^[0-9]{12}$ ]]       || { echo "platform account id must be 12 digits" >&2; exit 2; }
[[ $org =~ ^o-[a-z0-9]{10,32}$ ]]    || { echo "bad organization id: $org" >&2; exit 2; }
[[ $region =~ ^[a-z]{2}-[a-z]+-[0-9]$ ]] || { echo "bad region: $region" >&2; exit 2; }

root=$(cd "$(dirname "$0")/.." && pwd)
dest="$root/infra/tenants/$slug"
[ ! -e "$dest" ] || { echo "$dest already exists" >&2; exit 1; }

mkdir -p "$dest"
# Rewrite the locals by key name; the template itself holds valid dummy values.
sed -e "s/^\(  tenant_slug *= \).*/\1\"$slug\"/" \
    -e "s/^\(  account_id *= \).*/\1\"$account\"/" \
    -e "s/^\(  region *= \).*/\1\"$region\"/" \
    -e "s/^\(  organization_id *= \).*/\1\"$org\"/" \
    -e "s#^\(  trusted_principal_arns *= \).*#\1[\"arn:aws:iam::$platform:root\"]#" \
    "$root/infra/tenants/_template/main.tf" > "$dest/main.tf"

echo "Created $dest"
echo "Next: add \"$slug\" to var.tenants in infra/org (creates the account), then in $dest run: tofu init && tofu plan"
