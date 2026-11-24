/**
 * Pure helpers for the bug-report Worker (ported from CampusPinShowdown, which
 * ported them from KnowYourCity). Kept out of the entry module so that one
 * exports only `default`.
 */

/** ALLOWED_ORIGIN may be "*" or a comma-separated list of origins. */
export function allowedOrigins(env) {
  return (env.ALLOWED_ORIGIN || '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function originAllowed(env, origin) {
  const list = allowedOrigins(env)
  return list.includes('*') || Boolean(origin && list.includes(origin))
}

export function cors(env, origin) {
  const list = allowedOrigins(env)
  // Reflect the request origin when it is allowed ("*" cannot be combined with
  // a specific list); fall back to the first configured origin.
  const allow = list.includes('*') ? '*' : origin && list.includes(origin) ? origin : list[0] || '*'
  return {
    'Access-Control-Allow-Origin': allow,
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}

/** Zero-width space, written as a code point so no invisible character hides
 *  in this file. */
const Z = String.fromCharCode(0x200b)

/** Neutralize report text so it can't ping users, break out of its block, or
 *  inject a DISGUISED live link/image into the (public) issue: @mentions,
 *  code fences (``` and ~~~), Markdown link/image syntax (inline + reference) are broken
 *  with a zero-width space; raw HTML is entity-escaped (GitHub's sanitizer
 *  keeps allowed TAGS like <a>/<img>, only stripping unsafe attributes);
 *  issue cross-references (#123 / GH-123) are broken so a report can't spray
 *  backlink notifications. A BARE https://… URL stays visible on purpose so
 *  triagers can read it — only the hidden-destination case is defanged. */
export function defang(s) {
  return String(s)
    .replace(/```/g, `\`${Z}\`${Z}\``)
    .replace(/~~~/g, `~${Z}~${Z}~`)
    .replace(/@/g, `@${Z}`)
    .replace(/!\[/g, `!${Z}[`)
    .replace(/\]\(/g, `]${Z}(`)
    .replace(/\]\[/g, `]${Z}[`)
    .replace(/^(\s*\[[^\]]+\]):/gm, `$1${Z}:`)
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/#(\d)/g, `#${Z}$1`)
    .replace(/\bGH-(\d)/g, `GH-${Z}$1`)
    .replace(/\r/g, '')
}

/** True if `url` parses and its origin is EXACTLY one of the allowed origins.
 *  A prefix check would let lookalike hosts through (site.com.evil.com). */
export function urlFromAllowedOrigin(url, origins) {
  try {
    return origins.includes(new URL(url).origin)
  } catch {
    return false
  }
}

/** Issue title from the first line of the message: "[bug] …", ≤ 80 chars,
 *  with backticks, @ and newlines flattened and #123 / GH-123 references
 *  broken (GitHub links those in titles too). */
export function issueTitle(message) {
  return (
    '[bug] ' +
    (String(message).split('\n')[0] || '')
      .replace(/[`@\r\n]/g, ' ')
      .slice(0, 80)
      .trim()
      .replace(/#(\d)/g, `#${Z}$1`)
      .replace(/\bGH-(\d)/g, `GH-${Z}$1`)
  )
}
