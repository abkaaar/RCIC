/**
 * App — client router + in-app board tab strip.
 * Open boards stay mounted (hidden when inactive) so tab switches stay seamless (ISS-011).
 */
import { useCallback, useEffect, useState } from 'react'
import { Landing } from './Landing'
import { Room } from './Room'
import { loadBoardTabs, removeBoardTab, renameBoardTab, upsertBoardTab, type BoardTab } from './boardTabs'
import { BoardTabStrip } from './ui/BoardTabStrip'

export function navigate(path: string): void {
  history.pushState(null, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function App() {
  const [path, setPath] = useState(location.pathname)
  const [tabs, setTabs] = useState<BoardTab[]>(() => loadBoardTabs())

  const onPop = useCallback(() => setPath(location.pathname), [])
  useEffect(() => {
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [onPop])

  const match = path.match(/^\/r\/([A-Za-z0-9_-]+)/)
  const activeRoomId = match?.[1] ?? null

  // Register current room on the tab strip once (avoid setState loops)
  useEffect(() => {
    if (!activeRoomId) return
    setTabs((prev) => {
      if (prev.some((t) => t.roomId === activeRoomId)) return prev
      return upsertBoardTab(activeRoomId)
    })
  }, [activeRoomId])

  const onSelectTab = useCallback(
    (roomId: string) => {
      if (roomId === activeRoomId) return
      navigate(`/r/${roomId}`)
    },
    [activeRoomId],
  )

  const onCloseTab = useCallback(
    (roomId: string) => {
      const next = removeBoardTab(roomId)
      setTabs(next)
      if (roomId !== activeRoomId) return
      if (next.length > 0) navigate(`/r/${next[next.length - 1].roomId}`)
      else navigate('/')
    },
    [activeRoomId],
  )

  const onRoomName = useCallback((roomId: string, name: string) => {
    setTabs((prev) => {
      const cur = prev.find((t) => t.roomId === roomId)
      if (cur && cur.name === name) return prev
      return renameBoardTab(roomId, name)
    })
  }, [])

  const onBoardCreated = useCallback((roomId: string) => {
    setTabs(upsertBoardTab(roomId))
  }, [])

  /** App owns tab list so React state updates before navigate (seamless new board). */
  const onCreateBoard = useCallback((roomId: string, newBrowserTab: boolean) => {
    setTabs(upsertBoardTab(roomId))
    if (newBrowserTab) {
      window.open(`/r/${roomId}`, '_blank')
    } else {
      navigate(`/r/${roomId}`)
    }
  }, [])

  return (
    <div className="app-shell">
      {tabs.length > 0 && (
        <BoardTabStrip tabs={tabs} activeRoomId={activeRoomId} onSelect={onSelectTab} onClose={onCloseTab} />
      )}
      <div className="app-main">
        {tabs.map((t) => {
          const isActive = t.roomId === activeRoomId
          return (
            <div
              key={t.roomId}
              className={`room-slot${isActive ? ' room-slot-active' : ''}`}
              aria-hidden={!isActive}
              style={{
                visibility: isActive ? 'visible' : 'hidden',
                pointerEvents: isActive ? 'auto' : 'none',
                zIndex: isActive ? 1 : 0,
              }}
            >
              <Room
                roomId={t.roomId}
                active={isActive}
                onRoomName={onRoomName}
                onCreateBoard={onCreateBoard}
                onCancelJoin={() => onCloseTab(t.roomId)}
              />
            </div>
          )
        })}
        {!activeRoomId && <Landing onBoardCreated={onBoardCreated} />}
      </div>
    </div>
  )
}
