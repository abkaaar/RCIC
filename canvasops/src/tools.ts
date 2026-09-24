/**
 * Agent tools for CanvasOps.
 * Consequential hard-deletes and live-room writes require `approve: true` (human checkpoint).
 * Sandbox eval archives duplicates instead of hard-deleting.
 */

import { activeObjects, createSection, stickyText } from './board.js'
import {
  classifyTheme,
  isActionItemText,
  isNearDuplicate,
  normalizeText,
  stripActionPrefix,
} from './normalize.js'
import type { BoardState, CanvasObject, HandoffPack, TrajectoryEvent } from './types.js'
import type { TrajectoryLogger } from './trajectory.js'

export interface ToolContext {
  board: BoardState
  /** Human approval for consequential destructive / live writes. */
  approve: boolean
  /** When true (default for eval), never hard-delete — archive only. */
  sandbox: boolean
  memory: { glossary: Record<string, string>; lastClusters: string[] }
  log: TrajectoryLogger
}

export interface SnapshotSticky {
  id: string
  text: string
  normalized: string
  theme: string
  x: number
  y: number
}

export interface BoardSnapshot {
  stickyCount: number
  sectionTitles: string[]
  stickies: SnapshotSticky[]
  archivedCount: number
}

function nextId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`
}

export function getBoardSnapshot(ctx: ToolContext): BoardSnapshot {
  const stickies = activeObjects(ctx.board)
    .filter((o) => o.type === 'sticky')
    .map((o) => {
      const text = stickyText(o)
      return {
        id: o.id,
        text,
        normalized: normalizeText(text),
        theme: classifyTheme(text),
        x: o.x,
        y: o.y,
      }
    })
  const sectionTitles = activeObjects(ctx.board)
    .filter((o) => o.type === 'section')
    .map((o) => String(o.data?.title ?? 'Section'))

  const snap: BoardSnapshot = {
    stickyCount: stickies.length,
    sectionTitles,
    stickies,
    archivedCount: ctx.board.objects.filter((o) => o.archived).length,
  }
  ctx.log.event({
    kind: 'tool_call',
    name: 'getBoardSnapshot',
    input: {},
  })
  ctx.log.event({
    kind: 'tool_result',
    name: 'getBoardSnapshot',
    output: {
      stickyCount: snap.stickyCount,
      sectionTitles: snap.sectionTitles,
      themes: stickies.map((s) => s.theme),
    },
  })
  return snap
}

export function dedupeNearDuplicates(ctx: ToolContext): {
  archivedIds: string[]
  keptIds: string[]
} {
  ctx.log.event({ kind: 'tool_call', name: 'dedupeNearDuplicates', input: { sandbox: ctx.sandbox } })

  const stickies = activeObjects(ctx.board).filter((o) => o.type === 'sticky')
  const archivedIds: string[] = []
  const kept: CanvasObject[] = []

  for (const s of stickies) {
    const text = stickyText(s)
    const dupOf = kept.find((k) => isNearDuplicate(stickyText(k), text))
    if (dupOf) {
      if (!ctx.sandbox && !ctx.approve) {
        ctx.log.event({
          kind: 'human_checkpoint',
          name: 'dedupeNearDuplicates',
          message: 'Hard-delete blocked without --approve; would archive in sandbox.',
          input: { id: s.id, duplicateOf: dupOf.id },
        })
        // Still archive in working copy for structuring, but flag checkpoint
      }
      s.archived = true
      archivedIds.push(s.id)
      ctx.memory.glossary[normalizeText(text)] = stickyText(dupOf)
    } else {
      kept.push(s)
    }
  }

  const result = { archivedIds, keptIds: kept.map((k) => k.id) }
  ctx.log.event({ kind: 'tool_result', name: 'dedupeNearDuplicates', output: result })
  return result
}

export function groupIntoSections(ctx: ToolContext): { titles: string[] } {
  ctx.log.event({ kind: 'tool_call', name: 'groupIntoSections', input: {} })

  // Remove sections we previously created in this run (ids starting with cosec_)
  ctx.board.objects = ctx.board.objects.filter(
    (o) => !(o.type === 'section' && o.id.startsWith('cosec_')),
  )

  const stickies = activeObjects(ctx.board).filter((o) => o.type === 'sticky')
  const buckets = new Map<string, CanvasObject[]>()
  for (const s of stickies) {
    const theme = classifyTheme(stickyText(s))
    const list = buckets.get(theme) ?? []
    list.push(s)
    buckets.set(theme, list)
  }

  const titles: string[] = []
  let col = 0
  let maxZ = ctx.board.objects.reduce((m, o) => Math.max(m, o.z), 0)
  for (const [theme, items] of buckets) {
    if (theme === 'Other' && items.length === 0) continue
    const title = theme
    titles.push(title)
    maxZ += 1
    const section = createSection(`cosec_${theme.toLowerCase()}`, title, 80 + col * 520, 40, maxZ)
    section.h = Math.max(280, 120 + items.length * 40)
    ctx.board.objects.push(section)
    // Place stickies under section
    items.forEach((s, i) => {
      s.x = section.x - section.w / 2 + 100 + (i % 3) * 140
      s.y = section.y - section.h / 2 + 100 + Math.floor(i / 3) * 160
    })
    col += 1
    ctx.memory.glossary[`cluster:${theme}`] = items.map((i) => stickyText(i)).join(' | ')
  }
  ctx.memory.lastClusters = titles

  ctx.log.event({ kind: 'tool_result', name: 'groupIntoSections', output: { titles } })
  return { titles }
}

export function createObjects(
  ctx: ToolContext,
  objects: CanvasObject[],
): { createdIds: string[] } {
  ctx.log.event({
    kind: 'tool_call',
    name: 'createObjects',
    input: { count: objects.length, approve: ctx.approve, sandbox: ctx.sandbox },
  })
  if (!ctx.sandbox && !ctx.approve) {
    ctx.log.event({
      kind: 'human_checkpoint',
      name: 'createObjects',
      message: 'Live create blocked without --approve',
      input: { count: objects.length },
    })
    return { createdIds: [] }
  }
  const createdIds: string[] = []
  for (const o of objects) {
    const id = o.id || nextId('co')
    ctx.board.objects.push({ ...o, id })
    createdIds.push(id)
  }
  ctx.log.event({ kind: 'tool_result', name: 'createObjects', output: { createdIds } })
  return { createdIds }
}

export function exportHandoff(
  ctx: ToolContext,
  agent: HandoffPack['agent'],
  fixtureId?: string,
): HandoffPack {
  ctx.log.event({ kind: 'tool_call', name: 'exportHandoff', input: { agent, fixtureId } })

  const stickies = activeObjects(ctx.board).filter((o) => o.type === 'sticky')
  const boardSections = activeObjects(ctx.board).filter((o) => o.type === 'section')

  const hasAllIdeas = boardSections.some((s) => String(s.data?.title) === 'All Ideas')
  let sections: HandoffPack['sections']

  if (hasAllIdeas) {
    sections = [
      {
        title: 'All Ideas',
        stickyIds: stickies.map((s) => s.id),
        texts: stickies.map(stickyText),
      },
    ]
  } else {
    const themes = new Map<string, { stickyIds: string[]; texts: string[] }>()
    for (const s of stickies) {
      const theme = classifyTheme(stickyText(s))
      const bucket = themes.get(theme) ?? { stickyIds: [], texts: [] }
      bucket.stickyIds.push(s.id)
      bucket.texts.push(stickyText(s))
      themes.set(theme, bucket)
    }
    sections = [...themes.entries()]
      .filter(([, v]) => v.texts.length > 0)
      .map(([title, v]) => ({ title, stickyIds: v.stickyIds, texts: v.texts }))
  }

  const actionItems = stickies
    .filter((s) => isActionItemText(stickyText(s)))
    .map((s) => ({ text: stripActionPrefix(stickyText(s)), sourceId: s.id }))

  const archivedDuplicateIds = ctx.board.objects.filter((o) => o.archived).map((o) => o.id)

  const pack: HandoffPack = {
    fixtureId,
    generatedAt: new Date().toISOString(),
    agent,
    sections,
    actionItems,
    archivedDuplicateIds,
    summary:
      stickies.length === 0
        ? 'Empty board — no structuring performed.'
        : `Structured ${stickies.length} stickies into ${sections.length} section(s); ${actionItems.length} action item(s); ${archivedDuplicateIds.length} duplicate(s) archived.`,
  }

  ctx.log.event({
    kind: 'tool_result',
    name: 'exportHandoff',
    output: {
      sections: pack.sections.map((s) => s.title),
      actionItems: pack.actionItems.length,
      archived: pack.archivedDuplicateIds.length,
      summary: pack.summary,
    },
  })
  return pack
}

export type { TrajectoryEvent }
