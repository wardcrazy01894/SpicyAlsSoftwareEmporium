// Structural guards for the static site. No DOM library: the page is small and
// hand-written, so attribute-level regexes over the source are enough, and the
// suite stays dependency-free.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..', 'site')
const html = readFileSync(join(SITE, 'index.html'), 'utf8')
const css = readFileSync(join(SITE, 'styles.css'), 'utf8')

/** Every opening tag of `name`, as its raw source text. */
const tags = (name) => html.match(new RegExp(`<${name}\\b[^>]*>`, 'g')) ?? []
const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1]

const urls = [
  ...tags('a').map((t) => attr(t, 'href')),
  ...tags('link').map((t) => attr(t, 'href')),
  ...tags('img').map((t) => attr(t, 'src')),
  ...tags('script').map((t) => attr(t, 'src')),
].filter(Boolean)
const isExternal = (u) => /^https?:\/\//.test(u)
const local = urls.filter((u) => !isExternal(u) && !u.startsWith('#'))

test('every local asset the page references exists', () => {
  assert.ok(local.length >= 8, 'expected the page to reference local assets')
  for (const u of local) {
    if (u === './') continue
    assert.ok(existsSync(join(SITE, u)), `missing file: site/${u}`)
  }
})

test('local URLs are relative, so the site works under any base path or domain', () => {
  for (const u of local) assert.ok(!u.startsWith('/'), `root-relative URL: ${u}`)
  for (const [, u] of css.matchAll(/url\(\s*['"]?([^'")]+)/g)) {
    assert.ok(!u.startsWith('/'), `root-relative URL in styles.css: ${u}`)
  }
})

test('external links are https and never http', () => {
  for (const u of urls.filter(isExternal)) assert.match(u, /^https:\/\//, u)
})

test('links that open a new tab carry rel="noopener"', () => {
  for (const t of tags('a')) {
    if (attr(t, 'target') !== '_blank') continue
    assert.match(attr(t, 'rel') ?? '', /\bnoopener\b/, t)
  }
})

// Prettier wraps long tags across lines, so cards are read tag-by-tag rather
// than with single-line patterns.
const cards = html
  .split(/<article\b/)
  .slice(1)
  .map((chunk) => {
    const body = chunk.split('</article>')[0]
    const open = `<article${body.slice(0, body.indexOf('>') + 1)}`
    const inner = (name) => body.match(new RegExp(`<${name}\\b[^>]*>`, 'g')) ?? []
    return { open, slug: attr(open, 'data-slug'), daily: /\sdata-daily\b/.test(open), inner }
  })

test('every game card has a unique slug, a cover and a play link', () => {
  assert.ok(cards.length >= 5, 'expected at least five game cards')
  assert.ok(
    cards.every((c) => c.slug),
    'a card is missing data-slug',
  )
  assert.equal(new Set(cards.map((c) => c.slug)).size, cards.length, 'duplicate data-slug')
  for (const { slug, inner } of cards) {
    const cover = inner('img').map((t) => attr(t, 'src'))
    assert.ok(
      cover.some((u) => /^covers\/.+\.jpg$/.test(u)),
      `${slug}: no cover`,
    )
    const links = inner('a')
    const play = links.filter((t) => /\bkey-go\b/.test(attr(t, 'class') ?? ''))
    assert.equal(play.length, 1, `${slug}: expected exactly one play button`)
    assert.match(attr(play[0], 'href') ?? '', /^https:\/\//, `${slug}: play link`)
    assert.ok(
      links.some((t) => (attr(t, 'href') ?? '').startsWith('https://github.com/wardcrazy01894/')),
      `${slug}: no source link`,
    )
  }
})

test('the stated number of daily games matches the cards marked data-daily', () => {
  const stated = html.match(/(\d+) with a new puzzle every day/)?.[1]
  assert.equal(Number(stated), cards.filter((c) => c.daily).length)
})

test('share metadata points at one site URL (a domain cutover is all-or-nothing)', () => {
  const meta = (key) =>
    html.match(new RegExp(`<meta\\s+property="${key}"\\s+content="([^"]+)"`))?.[1]
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1]
  const ogUrl = meta('og:url')
  const ogImage = meta('og:image')
  assert.ok(canonical && ogUrl && ogImage, 'canonical, og:url and og:image are all required')
  assert.match(canonical, /^https:\/\/.+\/$/, 'canonical must be https and end in /')
  assert.equal(ogUrl, canonical)
  assert.equal(ogImage, `${canonical}og-image.png`)
  // A custom domain is live exactly when site/CNAME exists; it must agree.
  const cname = join(SITE, 'CNAME')
  if (existsSync(cname)) {
    assert.equal(canonical, `https://${readFileSync(cname, 'utf8').trim()}/`)
  }
})

test('the footer ends with the house line', () => {
  const footer = html.split('<footer')[1]?.split('</footer>')[0] ?? ''
  const lines = [...footer.matchAll(/<p>([^<]+)<\/p>/g)].map((m) => m[1].trim())
  assert.equal(lines.at(-1), 'A Spicy Al Software Solution')
})
