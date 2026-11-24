# Operations

## Live site

- **URL:** https://spicyalssoftwareemporium.com/
- **Host:** GitHub Pages, deployed by `.github/workflows/deploy.yml` (Actions
  build type). Every push to `main` uploads `site/` as-is and publishes it;
  there is no build step. `workflow_dispatch` re-deploys by hand.
- **Cost:** $0. The page itself has no backend; the one moving part is the
  bug-report worker below (Cloudflare Workers free plan, one secret).

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

The site moved to `spicyalssoftwareemporium.com` this way on 2026-11-23. To
switch to `example.com` (apex) — same recipe as CampusPinShowdown and
WhereHePlay:

1. **DNS** at the registrar (Cloudflare: set every record to _DNS only_, not
   proxied, or the certificate cannot be issued):

   | Type  | Name  | Value                                                                      |
   | ----- | ----- | -------------------------------------------------------------------------- |
   | A     | `@`   | `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` |
   | CNAME | `www` | `wardcrazy01894.github.io`                                                 |

2. **One PR** in this repo. `bash scripts/set-domain.sh example.com` makes
   every edit below (and is safe to re-run):
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

7. Redeploy the bug-report worker: `npm run bug:deploy`. The script rewrote the
   site origin in `worker/wrangler.toml`, and until the worker is redeployed it
   refuses reports from the new domain (the form then offers the GitHub link).

### Redirect domains

`spicyals.com` and `spicyalsemporium.com` (and their `www`) send every request
to the same path on `https://spicyalssoftwareemporium.com/`. GitHub Pages serves
one custom domain per site, so the extra names redirect rather than serve a
second copy. Each is set up in the Cloudflare dashboard, not in this repo:

- **DNS:** `A @ 192.0.2.1` and `A www 192.0.2.1`, both **Proxied**. The address
  is a placeholder that is never contacted; the record only has to exist and be
  proxied for the rule below to run. (The main domain is the opposite: _DNS
  only_.)
- **Rules → Redirect Rules:** one rule, _All incoming requests_, dynamic
  expression `concat("https://spicyalssoftwareemporium.com", http.request.uri.path)`,
  301, preserve query string.

To add another redirect domain, repeat both steps on it. To make a different
domain the main one, run the cutover above for it and point the old main
domain's rule at the new one.

## Bug reports

The footer's **🐛 Report a bug** link opens a form that posts to a Cloudflare
Worker, `emporium-bug` (`worker/`), which files a GitHub issue in this repo
labelled `bug` + `from-app`. The reporter needs no GitHub account, and the
token never reaches the browser. Same design as the games' bug buttons (the
worker is a port of CampusPinShowdown's `cps-bug`).

- **Request:** `POST { message, context: { url, userAgent } }` → `{ ok, url }`.
- **Where the page finds it:** the `data-bug-endpoint` attribute on the
  `<dialog>` in `site/index.html`. There is no build step, so the URL is
  written there rather than injected.
- **Fallbacks:** without JavaScript the link opens a blank GitHub issue. With
  the attribute empty the form opens a prefilled GitHub issue. If the worker
  errors or is unreachable the form says so and offers the prefilled issue.
- **Hardening:** fails closed (503) without its rate-limit binding; 5 reports
  per IP per 60 s; server-side Origin allowlist (`ALLOWED_ORIGIN`); 20 KB body
  cap plus per-field caps; `defang()` neutralises @mentions, code fences,
  Markdown links and images, raw HTML and `#123` cross-references; the reported
  URL is kept only if it is from our own origin.

### Deploy the worker

Not automatic: merging to `main` publishes the page, never the worker. Needs a
Cloudflare login once (`npx wrangler@4 login`).

1. Create a **fine-grained personal access token** on the `wardcrazy01894`
   account: Settings → Developer settings → Fine-grained tokens. Repository
   access: _Only select repositories_ → `SpicyAlsSoftwareEmporium`. Permissions:
   **Issues: Read and write** (Metadata: Read-only comes with it). Nothing else.
2. `npm run bug:secret` and paste the token when prompted.
3. `npm run bug:deploy`. It prints the worker's URL, which should be
   `https://emporium-bug.wardcrazy01894.workers.dev`. If it differs, put the
   printed URL in `data-bug-endpoint` (a test checks its shape).
4. Send a report from the live site and check the issue appears.

Redeploy (step 3) after any change under `worker/`. When the token expires,
repeat steps 1 and 2; no redeploy is needed. Until then reports fail with a 502
and the form falls back to the GitHub link.

**Try it locally:** put `GH_TOKEN=...` in `worker/.dev.vars` (gitignored), run
`npm run bug:dev` (port 8789) and `npm run dev`, and point `data-bug-endpoint`
at `http://localhost:8789` without committing that. `http://localhost:8000` is
already an allowed origin.

**Diagnose a failure:** `npx wrangler@4 tail -c worker/wrangler.toml` shows the
worker's log, which records GitHub's status and error body (never the token).
403 from the worker is an origin not in `ALLOWED_ORIGIN`; 429 is the rate limit.

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
