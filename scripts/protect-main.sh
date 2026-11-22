#!/usr/bin/env bash
# Lock down `main` (same policy as the other Spicy Al repos):
#   - all changes via PR (0 required approvals, so a solo dev can self-merge)
#   - required status checks must pass and the branch must be up to date
#   - every PR conversation must be resolved before merge
#   - rules also apply to admins
#   - no force-pushes, no branch deletion
#   - branches auto-delete on merge; squash merge only
#
# Usage:  bash scripts/protect-main.sh            # default repo
#         bash scripts/protect-main.sh owner/repo  # another repo
set -euo pipefail

REPO="${1:-wardcrazy01894/SpicyAlsSoftwareEmporium}"

echo "Applying branch protection to $REPO@main ..."
gh api -X PUT "repos/$REPO/branches/main/protection" --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["lint / format", "test", "secret scan"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": false,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 0
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_linear_history": true,
  "required_conversation_resolution": true
}
JSON

echo "Enabling delete-branch-on-merge, squash-only merges ..."
gh api -X PATCH "repos/$REPO" -F delete_branch_on_merge=true -F allow_squash_merge=true \
  -F allow_merge_commit=false -F allow_rebase_merge=false >/dev/null

echo "Enabling Dependabot alerts + security fixes, secret scanning + push protection ..."
gh api -X PUT "repos/$REPO/vulnerability-alerts" >/dev/null
gh api -X PUT "repos/$REPO/automated-security-fixes" >/dev/null
gh api -X PATCH "repos/$REPO" --input - >/dev/null <<'JSON'
{
  "security_and_analysis": {
    "secret_scanning": { "status": "enabled" },
    "secret_scanning_push_protection": { "status": "enabled" }
  }
}
JSON

echo "Done. main is PR-only with required checks: lint / format, test, secret scan."
