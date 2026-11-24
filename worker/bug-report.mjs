/**
 * Cloudflare Worker `emporium-bug`: receive a bug report from the page and file
 * a GitHub issue (port of CampusPinShowdown's `cps-bug`).
 *
 * Keeps the GitHub token server-side. The page reads this worker's URL from the
 * `data-bug-endpoint` attribute in site/index.html; with that attribute empty
 * (or the worker down) the form hands over to a prefilled GitHub issue page.
 *
 * SECURITY: a public, unauthenticated endpoint. Hardening:
 *   - spam/flooding        → per-IP rate limit (fails CLOSED without one)
 *   - content injection    → defang() (bug-report-lib.mjs)
 *   - phishing links       → the reported URL is kept only if it is from our
 *                            own origin, embedded parsed + defanged
 *   - other websites       → server-side Origin allowlist (not just CORS). A
 *                            non-browser client can omit Origin, so this is
 *                            not authentication; the rate limit is the cap
 *   - giant payloads       → Content-Length early reject + cap on bytes read
 *   - token blast radius   → fine-grained PAT, Issues: read & write, this repo
 *
 * Vars / secrets (worker/wrangler.toml, `wrangler secret put`):
 *   GH_TOKEN        (secret) fine-grained PAT, Issues: read & write, this repo
 *   GH_REPO         "owner/repo" to file issues in
 *   ALLOWED_ORIGIN  comma-separated origin allowlist ("*" disables — dev only)
 *   RATE_LIMITER    (native rate-limit binding) per-IP limiter
 */

import {
  allowedOrigins,
  cors,
  defang,
  issueTitle,
  originAllowed,
  urlFromAllowedOrigin,
} from './bug-report-lib.mjs'

const MAX_BODY_BYTES = 20_000
const MAX_MESSAGE = 2_000
const MAX_URL = 500
const MAX_UA = 400

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin')
    const headers = cors(env, origin)
    if (request.method === 'OPTIONS') return new Response(null, { headers })
    if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405, headers)

    // Fail CLOSED without an anti-abuse control.
    if (!env.RATE_LIMITER)
      return json({ error: 'reporting disabled: configure a rate limit' }, 503, headers)

    if (origin && !originAllowed(env, origin))
      return json({ error: 'forbidden origin' }, 403, headers)

    const len = parseInt(request.headers.get('Content-Length') || '0', 10)
    if (len > MAX_BODY_BYTES) return json({ error: 'payload too large' }, 413, headers)

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
    const { success } = await env.RATE_LIMITER.limit({ key: ip })
    if (!success) return json({ error: 'rate limited, try later' }, 429, headers)

    let body
    try {
      const raw = await request.text()
      if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES)
        return json({ error: 'payload too large' }, 413, headers)
      body = JSON.parse(raw)
    } catch {
      return json({ error: 'invalid json' }, 400, headers)
    }

    const message = String(body?.message ?? '')
      .slice(0, MAX_MESSAGE)
      .trim()
    if (!message) return json({ error: 'empty message' }, 400, headers)

    const ctx = body?.context ?? {}

    // Keep the reported URL only if it is from our own site; embed the PARSED
    // href (percent-encodes <>", strips newlines) and defang it too (href does
    // not encode markdown metachars). Length-capped.
    const url = String(ctx.url ?? '').slice(0, MAX_URL)
    const origins = allowedOrigins(env)
    const safeUrl = !url
      ? '(not attached)'
      : origins.includes('*')
        ? defang(url)
        : urlFromAllowedOrigin(url, origins)
          ? defang(new URL(url).href)
          : '(omitted)'
    // One line only, so it cannot forge extra footer lines.
    const userAgent = String(ctx.userAgent ?? '')
      .replace(/\s+/g, ' ')
      .slice(0, MAX_UA)

    const issueBody = [
      defang(message),
      '',
      '---',
      `URL: ${safeUrl}`,
      `Browser: ${defang(userAgent) || '(not attached)'}`,
    ].join('\n')

    let res
    try {
      res = await fetch(`https://api.github.com/repos/${env.GH_REPO}/issues`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.GH_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'SpicyAlsSoftwareEmporium-bug-bot',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: issueTitle(message),
          body: issueBody,
          labels: ['bug', 'from-app'],
        }),
      })
    } catch (e) {
      console.error('bug-report github issue create threw', { error: String(e) })
      return json({ error: 'github error' }, 502, headers)
    }
    if (!res.ok) {
      // Log status AND the GitHub error body (expired PAT, archived repo,
      // secondary rate limit) — never the token.
      const detail = await res.text().catch(() => '')
      console.error('bug-report github issue create failed', {
        status: res.status,
        body: detail.slice(0, 300),
      })
      return json({ error: 'github error', status: res.status }, 502, headers)
    }
    const issue = await res.json()
    return json({ ok: true, url: issue.html_url }, 200, headers)
  },
}
