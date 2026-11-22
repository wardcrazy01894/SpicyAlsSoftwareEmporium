# Operations

## Live site

- **URL:** https://wardcrazy01894.github.io/SpicyAlsSoftwareEmporium/
- **Host:** GitHub Pages, deployed by `.github/workflows/deploy.yml` (Actions
  build type). Every push to `main` uploads `site/` as-is and publishes it;
  there is no build step. `workflow_dispatch` re-deploys by hand.
- **Cost:** $0. No backend, no keys, no secrets.

Pages was enabled once through the API (the workflow's token cannot create a
Pages site on a new repo):

```bash
gh api -X POST repos/wardcrazy01894/SpicyAlsSoftwareEmporium/pages -f build_type=workflow
```

**Rollback:** revert the offending commit through a PR; the merge redeploys.

## Custom domain

The site is built to move. Every local URL is relative (a test enforces it), so
nothing depends on the `/SpicyAlsSoftwareEmporium/` path. The absolute site URL
appears in exactly three tags in `site/index.html` — `canonical`, `og:url` and
`og:image` — and a test fails if they disagree with each other or with
`site/CNAME`, so a half-done cutover cannot merge.

To switch to `example.com` (apex) — same recipe as CampusPinShowdown and
WhereHePlay:

1. **DNS** at the registrar (Cloudflare: set every record to _DNS only_, not
   proxied, or the certificate cannot be issued):

   | Type  | Name  | Value                                                                      |
   | ----- | ----- | -------------------------------------------------------------------------- |
   | A     | `@`   | `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` |
   | CNAME | `www` | `wardcrazy01894.github.io`                                                 |

2. **One PR** in this repo:
   - add `site/CNAME` containing the bare domain on one line (`example.com`);
   - replace `https://wardcrazy01894.github.io/SpicyAlsSoftwareEmporium/` with
     `https://example.com/` in the three tags in `site/index.html`;
   - update the URL at the top of `README.md` and in §Live site above.

   `npm test` confirms the three tags and `CNAME` agree.

3. **Tell Pages**, straight after the PR merges — until this runs, the share
   tags point at a domain Pages is not serving yet (with the Actions build type
   the `CNAME` file alone does not set the domain):

   ```bash
   gh api -X PUT repos/wardcrazy01894/SpicyAlsSoftwareEmporium/pages -f cname=example.com
   ```

4. Wait for the certificate (minutes to an hour), then enforce HTTPS:

   ```bash
   gh api -X PUT repos/wardcrazy01894/SpicyAlsSoftwareEmporium/pages -F https_enforced=true
   ```

5. Check `https://example.com/` loads, and that the old github.io address
   redirects to it (GitHub does this automatically, and likewise sends `www` to
   the apex).

6. Update the repo's homepage: `gh repo edit --homepage https://example.com/`.

## Repo settings

`bash scripts/protect-main.sh` applies (and re-applies) everything below; it is
safe to re-run.

- `main` is PR-only. Required checks: **lint / format**, **test**, **secret
  scan**; strict (branch must be up to date), conversations resolved, linear
  history, rules apply to admins, no force-push or deletion.
- Required approvals are 0 on purpose: a solo maintainer cannot approve their
  own PR. CI plus an adversarial review is the gate.
- Squash merges only; branches delete on merge.
- Dependabot alerts and security fixes, secret scanning and push protection
  are on.

If a CI job is renamed, update the `contexts` list in `scripts/protect-main.sh`
in the same PR and re-run it — a required check that no longer reports blocks
every merge.

## Dependency updates

`.github/dependabot.yml` opens weekly PRs for npm (the two dev tools) and
GitHub Actions: minor and patch bumps grouped into one PR per ecosystem, each
major on its own. Workflow actions are pinned to commit SHAs with the version in
a trailing comment; Dependabot keeps both in step. Every Dependabot PR gets the
same CI and review as any other change.
