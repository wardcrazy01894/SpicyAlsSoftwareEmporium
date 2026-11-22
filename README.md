# 🌶️ Spicy Al's Software Emporium

**▶ [wardcrazy01894.github.io/SpicyAlsSoftwareEmporium](https://wardcrazy01894.github.io/SpicyAlsSoftwareEmporium/)**

[![CI](https://github.com/wardcrazy01894/SpicyAlsSoftwareEmporium/actions/workflows/ci.yml/badge.svg)](https://github.com/wardcrazy01894/SpicyAlsSoftwareEmporium/actions/workflows/ci.yml)
[![deploy](https://github.com/wardcrazy01894/SpicyAlsSoftwareEmporium/actions/workflows/deploy.yml/badge.svg)](https://github.com/wardcrazy01894/SpicyAlsSoftwareEmporium/actions/workflows/deploy.yml)

One page that points at every game Spicy Al has made, plus the other projects.
Games are the highlight; everything else sits on a second shelf below.

A plain static site: no framework and no build step. `site/` is uploaded to
GitHub Pages exactly as it is.

```
site/
  index.html    the page — every game and project is a block of HTML here
  styles.css    design tokens (light + dark) and layout
  app.js        theme toggle, "Surprise me", per-browser "played today" badges
  covers/       960×600 JPEG card covers (16:10)
  og-image.png  1200×630 share image
  favicon.svg
tests/          structural guards (node --test, no dependencies)
docs/OPERATIONS.md   deploy, custom-domain cutover, repo settings
```

## Run it

```bash
npm install     # prettier + html-validate, dev only
npm run dev     # http://localhost:8000
```

Before opening a PR — this is exactly what CI gates on:

```bash
npm run lint && npm run format:check && npm test
```

## Add a game

1. Copy one `<article class="game-card">` block in `site/index.html` and edit
   the links, text and chips. `--c` is the card's accent colour; `data-slug`
   must be unique; keep `data-daily` only if the game has a new puzzle every day
   (it drives the "played today" badge and the tally).
2. Add a 960×600 cover to `site/covers/`. The existing ones are headless-Chrome
   screenshots of the live sites:

   ```bash
   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
     --hide-scrollbars --window-size=960,600 --virtual-time-budget=15000 \
     --screenshot=shot.png https://example.com/
   sips -s format jpeg -s formatOptions 82 shot.png --out site/covers/<slug>.jpg
   ```

3. Update the count in the hero text and the "4 with a new puzzle every day"
   note (a test checks the second one against the cards).

Other projects are `<li class="project">` rows in the same file.

## Deploys and the domain

Every merge to `main` publishes automatically. The site uses only relative
URLs, so moving to a custom domain is a small, documented change:
[`docs/OPERATIONS.md`](docs/OPERATIONS.md#custom-domain).

---

A Spicy Al Software Solution
