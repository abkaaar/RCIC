/**
 * boardTabs — sessionStorage list of open boards for the in-app tab strip.
 * Closing a tab does not delete the room on the server.
 */
export interface BoardTab {
  roomId: string
  name: string
}

const STORAGE_KEY = 'rcic-board-tabs'

export function loadBoardTabs(): BoardTab[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (t): t is BoardTab => typeof t?.roomId === 'string' && typeof t?.name === 'string',
    )
  } catch {
    return []
  }
}

export function saveBoardTabs(tabs: BoardTab[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tabs))
  } catch {
    /* ignore */
  }
}

export function upsertBoardTab(roomId: string, name = 'Untitled board'): BoardTab[] {
  const tabs = loadBoardTabs()
  const i = tabs.findIndex((t) => t.roomId === roomId)
  if (i >= 0) {
    if (name && tabs[i].name !== name) tabs[i] = { ...tabs[i], name }
  } else {
    tabs.push({ roomId, name })
  }
  saveBoardTabs(tabs)
  return tabs
}

export function removeBoardTab(roomId: string): BoardTab[] {
  const tabs = loadBoardTabs().filter((t) => t.roomId !== roomId)
  saveBoardTabs(tabs)
  return tabs
}

export function renameBoardTab(roomId: string, name: string): BoardTab[] {
  const tabs = loadBoardTabs().map((t) => (t.roomId === roomId ? { ...t, name } : t))
  saveBoardTabs(tabs)
  return tabs
}
