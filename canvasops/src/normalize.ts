/** Text normalization + near-duplicate detection (PROBLEM.md resolutions). */

export function normalizeText(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[!.…]+$/g, '')
    .replace(/[^\w\s:#-]/g, '')
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const prev = new Array<number>(b.length + 1)
  const curr = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j]
  }
  return prev[b.length]
}

/** Token Jaccard for soft duplicates (e.g. "memory leak in replay" vs "fix memory leak…"). */
function wordJaccard(a: string, b: string): number {
  const ta = new Set(a.split(' ').filter(Boolean))
  const tb = new Set(b.split(' ').filter(Boolean))
  if (!ta.size || !tb.size) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  return inter / (ta.size + tb.size - inter)
}

/**
 * Near-duplicate per PROBLEM.md:
 * equal normalize, Levenshtein ≤ 2, containment with ratio ≥ 0.85,
 * prefix (shorter ≥ 4 chars), or word Jaccard ≥ 0.7.
 */
export function isNearDuplicate(a: string, b: string): boolean {
  const na = normalizeText(a)
  const nb = normalizeText(b)
  if (!na || !nb) return false
  if (na === nb) return true
  if (levenshtein(na, nb) <= 2) return true
  const shorter = na.length <= nb.length ? na : nb
  const longer = na.length <= nb.length ? nb : na
  if (longer.includes(shorter) && shorter.length / longer.length >= 0.85) return true
  if (shorter.length >= 4 && longer.startsWith(shorter)) return true
  if (wordJaccard(na, nb) >= 0.7) return true
  return false
}

const ACTION_RE = /^(todo|action|ai|fix|ship)\s*:/i
const IMPERATIVE_RE = /^(fix|ship|add|draft|write|schedule|design|rotate|cap|document|interview|benchmark)\b/i

export function isActionItemText(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (ACTION_RE.test(t)) return true
  if (IMPERATIVE_RE.test(t) && t.length < 80) return true
  return false
}

export function stripActionPrefix(text: string): string {
  return text.replace(/^(todo|action|ai|fix|ship)\s*:\s*/i, '').trim()
}

export type Theme =
  | 'UI'
  | 'Performance'
  | 'Backend'
  | 'Process'
  | 'Risk'
  | 'Other'

const THEME_KEYWORDS: Record<Exclude<Theme, 'Other'>, RegExp[]> = {
  UI: [
    /\bui\b/i,
    /dark\s*mode/i,
    /button/i,
    /toolbar/i,
    /navbar/i,
    /sticky/i,
    /contrast/i,
    /tap\s*target/i,
    /keyboard/i,
    /connector/i,
    /invite|share\s*link/i,
    /export\s*pdf/i,
    /comment/i,
    /radar|minimap/i,
    /physics/i,
    /dense/i,
  ],
  Performance: [
    /perf/i,
    /speed|faster|latency|p95|bundle|lazy-?load|cache|fcp|first\s*paint|prefetch|memory\s*leak/i,
    /load\s*test/i,
  ],
  Backend: [
    /api|webhook|postgres|gcs|queue|idempotent|health\s*check|rooms?|cors|rate-?limit|snapshot|object\s*storage|job\b|backend/i,
    /pagination/i,
    /sso|auth/i,
  ],
  Process: [
    /process|checklist|onboarding|office\s*hours|template|retro|runbook|interview|document|facilitator|weekly|archive/i,
    /todo:|action:|ai:/i,
  ],
  Risk: [/\brisk\b|unsafe|no\s*auth|anyone\s*with\s*the\s*link|spam|consistency|single\s*cloud\s*run|acl/i],
}

export function classifyTheme(text: string): Theme {
  for (const theme of ['Risk', 'Performance', 'Backend', 'UI', 'Process'] as const) {
    if (THEME_KEYWORDS[theme].some((re) => re.test(text))) return theme
  }
  if (isActionItemText(text)) return 'Process'
  return 'Other'
}
