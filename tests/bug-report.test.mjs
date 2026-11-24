// The bug-report worker (worker/bug-report.mjs): the whole request path with a
// fake `env` and a fake global `fetch` standing in for the GitHub API, so the
// abuse controls cannot regress silently. Plus the wiring between the worker's
// config and the page.
import { afterEach, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import handler from '../worker/bug-report.mjs'
import { defang, issueTitle, urlFromAllowedOrigin } from '../worker/bug-report-lib.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ORIGIN = 'https://emporium.example'

const makeEnv = (over = {}) => ({
  ALLOWED_ORIGIN: `${ORIGIN},http://localhost:8000`,
  GH_REPO: 'owner/repo',
  GH_TOKEN: 'gh-secret',
  RATE_LIMITER: { limit: async () => ({ success: true }) },
  ...over,
})

const post = (body, { origin = ORIGIN, headers = {} } = {}) =>
  new Request('https://worker.example/', {
    method: 'POST',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '203.0.113.7',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

const realFetch = globalThis.fetch
const realError = console.error
let github // { mode: 'ok' | 'fail' | 'throw', call }
let logged

beforeEach(() => {
  github = { mode: 'ok', call: null }
  logged = []
  console.error = (...args) => logged.push(JSON.stringify(args))
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /^https:\/\/api\.github\.com\//, 'unexpected fetch')
    github.call = { url: String(url), init, body: JSON.parse(init.body) }
    if (github.mode === 'throw') throw new Error('GH_NETWORK_DOWN')
    if (github.mode === 'fail')
      return new Response('{"message":"Validation Failed"}', { status: 422 })
    return Response.json({ html_url: 'https://github.com/owner/repo/issues/1' }, { status: 201 })
  }
})
afterEach(() => {
  globalThis.fetch = realFetch
  console.error = realError
})

test('worker: answers the CORS preflight and rejects anything but POST', async () => {
  const pre = await handler.fetch(
    new Request('https://worker.example/', { method: 'OPTIONS', headers: { Origin: ORIGIN } }),
    makeEnv(),
  )
  assert.equal(pre.headers.get('Access-Control-Allow-Origin'), ORIGIN)
  assert.equal(pre.headers.get('Access-Control-Allow-Methods'), 'POST, OPTIONS')
  const get = await handler.fetch(
    new Request('https://worker.example/', { headers: { Origin: ORIGIN } }),
    makeEnv(),
  )
  assert.equal(get.status, 405)
})

test('worker: fails closed (503) without a rate limiter', async () => {
  const res = await handler.fetch(post({ message: 'hi' }), makeEnv({ RATE_LIMITER: undefined }))
  assert.equal(res.status, 503)
  assert.equal(github.call, null)
})

test('worker: rejects a foreign origin, an oversized body, a limited IP, bad JSON, an empty message', async () => {
  const status = async (req, env = makeEnv()) => (await handler.fetch(req, env)).status
  assert.equal(await status(post({ message: 'hi' }, { origin: 'https://evil.example' })), 403)
  assert.equal(
    await status(post({ message: 'hi' }, { headers: { 'Content-Length': '999999' } })),
    413,
  )
  // No honest Content-Length: the bytes actually read are capped too.
  assert.equal(await status(post({ message: 'x'.repeat(30_000) })), 413)
  const keys = []
  const limiter = {
    limit: async (arg) => {
      keys.push(arg.key)
      return { success: false }
    },
  }
  assert.equal(await status(post({ message: 'hi' }), makeEnv({ RATE_LIMITER: limiter })), 429)
  assert.deepEqual(keys, ['203.0.113.7'], 'the limit is per IP')
  assert.equal(await status(post('{ not json')), 400)
  assert.equal(await status(post({ message: '   ' })), 400)
  assert.equal(github.call, null, 'nothing rejected reaches GitHub')
})

test('worker: files a GitHub issue and returns its URL', async () => {
  const res = await handler.fetch(
    post({
      message: 'the Play button did nothing\nsecond line',
      context: { url: `${ORIGIN}/#games`, userAgent: 'UA/1.0' },
    }),
    makeEnv(),
  )
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { ok: true, url: 'https://github.com/owner/repo/issues/1' })
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN)
  assert.equal(github.call.url, 'https://api.github.com/repos/owner/repo/issues')
  assert.equal(github.call.init.headers.Authorization, 'Bearer gh-secret')
  assert.equal(github.call.body.title, '[bug] the Play button did nothing')
  assert.deepEqual(github.call.body.labels, ['bug', 'from-app'])
  assert.match(github.call.body.body, /^the Play button did nothing\nsecond line\n/)
  assert.ok(github.call.body.body.includes(`URL: ${ORIGIN}/#games`))
  assert.ok(github.call.body.body.includes('Browser: UA/1.0'))
})

test('worker: a report without diagnostics still files', async () => {
  const res = await handler.fetch(post({ message: 'hi', context: {} }), makeEnv())
  assert.equal(res.status, 200)
  assert.ok(github.call.body.body.includes('URL: (not attached)'))
  assert.ok(github.call.body.body.includes('Browser: (not attached)'))
})

test('worker: a GitHub failure is a 502, logged with its reason and never the token', async () => {
  github.mode = 'fail'
  assert.equal((await handler.fetch(post({ message: 'hi' }), makeEnv())).status, 502)
  assert.match(logged.join('\n'), /422.*Validation Failed/)
  github.mode = 'throw'
  assert.equal((await handler.fetch(post({ message: 'hi' }), makeEnv())).status, 502)
  assert.match(logged.join('\n'), /GH_NETWORK_DOWN/)
  assert.doesNotMatch(logged.join('\n'), /gh-secret/)
})

test('worker: keeps only an own-origin URL, and defangs everything it embeds', async () => {
  const bodyFor = async (payload) => {
    await handler.fetch(post(payload), makeEnv())
    return github.call.body.body
  }
  for (const url of ['https://evil.example/steal', `${ORIGIN}.evil.com/phish`, 'not a url']) {
    assert.ok((await bodyFor({ message: 'hi', context: { url } })).includes('URL: (omitted)'), url)
  }
  const sneaky = await bodyFor({
    message: 'bug [click](https://evil.example/phish) @someone #12 <img src=x>',
    context: {
      url: `${ORIGIN}/?a=![beacon](https://evil.example/t.png)#<img src=x>`,
      userAgent: '```\n@admin\nURL: https://evil.example/forged',
    },
  })
  assert.ok(sneaky.includes(`URL: ${ORIGIN}/`))
  assert.equal(sneaky.match(/^URL: /gm).length, 1, 'the browser string cannot forge a line')
  for (const live of [/\]\(/, /!\[/, /<img/i, /@someone/, /@admin/, /#12/, /```/]) {
    assert.doesNotMatch(sneaky, live)
  }
})

test('lib: defang, issueTitle and urlFromAllowedOrigin', () => {
  assert.equal(defang('<b>@al</b>'), '&lt;b&gt;@\u200Bal&lt;/b&gt;')
  assert.equal(defang('[x]: https://evil.example'), '[x]\u200B: https://evil.example')
  assert.equal(defang('see https://ok.example'), 'see https://ok.example', 'bare URLs stay')
  assert.equal(issueTitle('a `b` @c\nrest'), '[bug] a  b   c')
  assert.equal(issueTitle('x'.repeat(200)).length, '[bug] '.length + 80)
  assert.equal(issueTitle('#1 GH-2 fix'), '[bug] #\u200B1 GH-\u200B2 fix', 'no cross-references')
  assert.equal(defang('~~~'), '~\u200B~\u200B~')
  assert.equal(urlFromAllowedOrigin('https://a.example/p', ['https://a.example']), true)
  assert.equal(urlFromAllowedOrigin('https://a.example.evil.com/', ['https://a.example']), false)
})

// ---- the page <-> worker wiring ----
const html = readFileSync(join(ROOT, 'site', 'index.html'), 'utf8')
const wrangler = readFileSync(join(ROOT, 'worker', 'wrangler.toml'), 'utf8')
const tomlValue = (key) => wrangler.match(new RegExp(`^${key} = "([^"]*)"$`, 'm'))?.[1]
const tagWith = (marker) => html.match(new RegExp(`<[a-z]+\\b[^>]*\\s${marker}[\\s>][^>]*>`))?.[0]

test('page: the bug link works without JavaScript and points at the repo the worker files in', () => {
  const repo = tomlValue('GH_REPO')
  assert.ok(repo, 'GH_REPO missing from worker/wrangler.toml')
  const links = html.match(/<a\b[^>]*\sdata-bug-report[\s>][^>]*>/g) ?? []
  for (const link of links) {
    assert.ok(link.includes(`href="https://github.com/${repo}/issues/new"`), link)
  }
  // One up top where people see it (a named icon button), one in the footer
  // that is there even without JavaScript.
  const [header, footer] = [html.split('</header>')[0], html.split('<footer')[1]]
  const top = links.filter((l) => header.includes(l))
  assert.equal(top.length, 1, 'expected one bug button in the header')
  assert.match(top[0], /\saria-label="Report a bug"/)
  assert.equal(links.filter((l) => footer.includes(l)).length, 1, 'expected a footer bug link')
  // Both must open the form: app.js has to bind every trigger, not the first.
  const js = readFileSync(join(ROOT, 'site', 'app.js'), 'utf8')
  assert.match(js, /var bugLinks = document\.querySelectorAll\('\[data-bug-report\]'\)/)
  assert.match(js, /bugLinks\.forEach\(function \(link\) \{\s+link\.addEventListener\('click'/)
  // The dialog's fallback link starts from the same place.
  assert.ok(tagWith('data-bug-fallback')?.includes(`href="https://github.com/${repo}/issues/new"`))
})

test('page: the bug dialog names an https endpoint (or none) and a labelled message box', () => {
  const dialog = tagWith('data-bug-dialog')
  assert.ok(dialog?.startsWith('<dialog'), 'no <dialog data-bug-dialog>')
  const endpoint = dialog.match(/\sdata-bug-endpoint="([^"]*)"/)?.[1]
  assert.notEqual(endpoint, undefined, 'data-bug-endpoint attribute is missing')
  if (endpoint) {
    const name = tomlValue('name')
    assert.match(endpoint, new RegExp(`^https://${name}\\.[a-z0-9-]+\\.workers\\.dev$`))
  }
  assert.match(html, /<label for="bug-message">/)
  assert.match(html, /<textarea\s[^>]*id="bug-message"[^>]*maxlength="2000"/)
  assert.match(html, /public issue tracker/, 'the form must say the report is public')
})

test("worker config: the live site's origin is allowed, and the limiter is bound", () => {
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1]
  const origins = tomlValue('ALLOWED_ORIGIN').split(',')
  assert.ok(origins.includes(new URL(canonical).origin), `${canonical} not in ALLOWED_ORIGIN`)
  assert.ok(!origins.includes('*'), 'ALLOWED_ORIGIN must not be a wildcard')
  assert.match(wrangler, /^\[\[ratelimits\]\]\nname = "RATE_LIMITER"$/m)
})
