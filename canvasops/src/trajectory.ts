/** JSONL trajectory logger for agent runs. */

import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { TrajectoryEvent } from './types.js'

export class TrajectoryLogger {
  private events: TrajectoryEvent[] = []
  constructor(
    private agent: string,
    private filePath: string,
  ) {}

  event(partial: Omit<TrajectoryEvent, 't' | 'agent'> & { t?: number; agent?: string }): void {
    this.events.push({
      t: partial.t ?? Date.now(),
      agent: partial.agent ?? this.agent,
      kind: partial.kind,
      name: partial.name,
      input: partial.input,
      output: partial.output,
      message: partial.message,
    })
  }

  flush(): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    const body = this.events.map((e) => JSON.stringify(e)).join('\n') + (this.events.length ? '\n' : '')
    writeFileSync(this.filePath, body, 'utf8')
  }

  appendOnly(event: TrajectoryEvent): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    appendFileSync(this.filePath, JSON.stringify(event) + '\n', 'utf8')
  }

  getEvents(): TrajectoryEvent[] {
    return this.events
  }
}
