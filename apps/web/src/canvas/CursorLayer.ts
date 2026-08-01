/**
 * CursorLayer — remote peer pointers in world space; positions come from awareness, not Yjs objects.
 */
import { Container, Graphics, Text } from 'pixi.js'
import type { Camera } from './CanvasApp'

export interface PeerCursor {
  id: number
  name: string
  color: string
  x: number
  y: number
}

interface PeerView {
  c: Container
  g: Graphics
  label: Text
  color: string
  name: string
  // world-space smoothed position
  wx: number
  wy: number
  tx: number
  ty: number
}

export class CursorLayer {
  readonly root = new Container()
  private peers = new Map<number, PeerView>()

  update(list: PeerCursor[]): void {
    const seen = new Set<number>()
    for (const p of list) {
      seen.add(p.id)
      let v = this.peers.get(p.id)
      if (!v) {
        const c = new Container()
        const g = new Graphics()
        const label = new Text({
          text: p.name,
          style: { fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12, fill: 0xffffff },
        })
        label.position.set(14, 18)
        c.addChild(g, label)
        this.root.addChild(c)
        v = { c, g, label, color: '', name: '', wx: p.x, wy: p.y, tx: p.x, ty: p.y }
        this.peers.set(p.id, v)
      }
      v.tx = p.x
      v.ty = p.y
      if (v.color !== p.color || v.name !== p.name) {
        v.color = p.color
        v.name = p.name
        v.label.text = p.name
        const g = v.g
        g.clear()
        g.poly([0, 0, 13, 11, 5.5, 15]).fill(p.color).stroke({ width: 1.5, color: 0xffffff })
        const tw = v.label.width
        g.roundRect(10, 12, tw + 12, 20, 10).fill(p.color)
        v.label.position.set(16, 15)
        v.c.setChildIndex(v.label, v.c.children.length - 1)
      }
    }
    for (const [id, v] of this.peers) {
      if (!seen.has(id)) {
        this.root.removeChild(v.c)
        v.c.destroy({ children: true })
        this.peers.delete(id)
      }
    }
  }

  tick(cam: Camera, k: number): void {
    for (const v of this.peers.values()) {
      v.wx += (v.tx - v.wx) * k
      v.wy += (v.ty - v.wy) * k
      v.c.position.set((v.wx - cam.x) * cam.scale, (v.wy - cam.y) * cam.scale)
    }
  }

  destroy(): void {
    this.root.destroy({ children: true })
  }
}
