import { EventEmitter } from 'node:events'
import type { RunEvent } from '../shared/types.js'

export const runBus = new EventEmitter()
runBus.setMaxListeners(100)

export function publishRunEvent(event: RunEvent) {
  runBus.emit(event.runId, event)
}
