#!/usr/bin/env bash
# The repo half of the custom-domain cutover (docs/OPERATIONS.md §Custom domain):
# writes site/CNAME and repoints every copy of the site URL at the new domain.
# Safe to re-run, and works from a domain that is already set.
#
#   bash scripts/set-domain.sh example.com
#
# ROOT overrides the repo root (the tests run it against a temp copy).
set -euo pipefail

domain="${1:-}"
if [[ ! "$domain" =~ ^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$ ]]; then
  echo "usage: $0 <bare domain, lowercase, e.g. example.com>" >&2
  exit 2
fi

root="${ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
index="$root/site/index.html"

old="$(perl -ne 'print $1 if /<link rel="canonical" href="([^"]+)"/' "$index")"
if [[ -z "$old" ]]; then
  echo "no canonical URL found in $index" >&2
  exit 1
fi
new="https://$domain/"

# The full URL first, then the bare form used as link text in the README.
old_bare="${old#https://}"
OLD="$old" NEW="$new" OLD_BARE="${old_bare%/}" NEW_BARE="$domain" \
  perl -pi -e 's/\Q$ENV{OLD}\E/$ENV{NEW}/g; s/\Q$ENV{OLD_BARE}\E/$ENV{NEW_BARE}/g' \
  "$index" "$root/README.md"

# Only the Live-site line in the ops doc; its recipe text keeps the original URL.
NEW="$new" perl -pi -e 's/^(- \*\*URL:\*\* ).*$/$1$ENV{NEW}/' "$root/docs/OPERATIONS.md"

printf '%s\n' "$domain" >"$root/site/CNAME"

cat <<EOF
Site URL: $old -> $new

Next (docs/OPERATIONS.md §Custom domain):
  1. DNS at the registrar, if not done yet.
  2. npm run lint && npm run format:check && npm test, then open the PR.
  3. After it merges:
       gh api -X PUT repos/wardcrazy01894/SpicyAlsSoftwareEmporium/pages -f cname=$domain
  4. Once the certificate is issued:
       gh api -X PUT repos/wardcrazy01894/SpicyAlsSoftwareEmporium/pages -F https_enforced=true
  5. gh repo edit --homepage $new
EOF
