# Spicy Al's Software Emporium — working agreement

A static hub page linking every game and project Spicy Al has made. No
framework, no build: `site/` is published to GitHub Pages as-is. See
`README.md` for layout and the add-a-game recipe, `docs/OPERATIONS.md` for
deploys, the custom-domain cutover and repo settings.

## Branch & PR workflow

- **All changes land via a Pull Request — never push directly to `main`.**
- Required CI checks: **lint / format** (`html-validate`, `prettier --check`),
  **test** (`node --test`), **secret scan** (gitleaks).
- Squash merge; branches delete on merge. Protection is enforced on `main`,
  admins included — re-apply with `bash scripts/protect-main.sh`.
- Every PR gets an adversarial review before merge, dependency bumps included.

## Rules of the house

- **Relative URLs only** for anything local, in HTML and CSS. The site must work
  under any base path or domain (a test enforces it).
- **The absolute site URL lives in three tags** in `site/index.html`. Change
  them only as part of the cutover in `docs/OPERATIONS.md` §Custom domain.
- **No build step and no runtime dependencies.** The page must be complete
  without JavaScript; `app.js` only enhances.
- The footer's last line is **"A Spicy Al Software Solution"** (test-pinned).
- A behavior change comes with a test in `tests/` that fails without it, and
  with its docs updated in the same PR.
- When a new game or site ships anywhere, add its card here.

## Local commands

```bash
npm install            # first time (prettier + html-validate)
npm run dev            # serve site/ at http://localhost:8000
npm run lint           # html-validate
npm run format         # prettier --write (format:check in CI)
npm test               # node --test
```

Run `npm run lint && npm run format:check && npm test` before opening a PR, and
judge each by its exit code.

## Git identity

Everything Claude does here is attributed to `wardcrazy01894` via the local
Claude Code config (`GIT_AUTHOR_*`/`GIT_COMMITTER_*` env, the `github-wardcrazy`
SSH remote alias, `GH_CONFIG_DIR`). Don't run `git config user.*` or
`gh auth switch`.
