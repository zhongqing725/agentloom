import { useEffect, useRef, useState } from 'react'
import type { Agent, GraphEdge, GraphNode } from '../../shared/types'
import { SwarmStage, type SwarmBlueprint, type SwarmNode } from './swarm/engine'

/**
 * One pass of the swarm per page load.
 *
 * The overlay measures the live React Flow canvas (node rects, not stored
 * coordinates) so the cursors draw exactly where the real graph sits, then
 * fades away and leaves the interactive canvas underneath. It never loops —
 * `Replay` is a reload, `跳过` finishes the current pass.
 */
let playedThisLoad = false

export interface SwarmBuildProps {
  graph: { nodes: GraphNode[]; edges: GraphEdge[] }
  agents: Agent[]
}

export function SwarmBuild({ graph, agents }: SwarmBuildProps) {
  const [alive, setAlive] = useState(() => !playedThisLoad)
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<SwarmStage | null>(null)
  const metaRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!alive) return
    if (typeof window === 'undefined') return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      playedThisLoad = true
      setAlive(false)
      return
    }

    let raf = 0
    let tries = 0
    let cancelled = false
    const startedAt = performance.now()

    const boot = () => {
      if (cancelled) return
      // let React Flow finish its first fitView pass before measuring the nodes
      if (performance.now() - startedAt < 140) {
        raf = requestAnimationFrame(boot)
        return
      }
      const measured = measure(graph)
      if (!measured) {
        tries += 1
        if (tries > 240) {
          playedThisLoad = true
          setAlive(false)
          return
        }
        raf = requestAnimationFrame(boot)
        return
      }

      const layer = hostRef.current
      const canvas = canvasRef.current
      if (!layer || !canvas) return

      playedThisLoad = true
      position(layer, measured.host)
      layer.style.display = 'block'

      const stage = new SwarmStage(canvas, measured.blueprint, {
        names: agents.map((agent) => agent.name).filter(Boolean),
        palette: readPalette(measured.host),
        font: getComputedStyle(document.body).fontFamily || 'sans-serif',
        onProgress: (done, total) => {
          if (metaRef.current) metaRef.current.textContent = `${done} / ${total}`
        },
        onDone: () => setAlive(false),
      })
      stage.resize(measured.blueprint.width, measured.blueprint.height, Math.min(2, window.devicePixelRatio || 1))
      stageRef.current = stage
      stage.start()
    }

    raf = requestAnimationFrame(boot)

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') stageRef.current?.skip()
    }
    const onResize = () => {
      const layer = hostRef.current
      const host = document.querySelector<HTMLElement>('.agent-canvas')
      if (layer && host) position(layer, host)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
      stageRef.current?.stop()
      stageRef.current = null
    }
  }, [alive, agents, graph])

  if (!alive) return null

  return (
    <div
      ref={hostRef}
      className="fixed z-40 cursor-pointer overflow-hidden"
      style={{ display: 'none' }}
      onClick={() => stageRef.current?.skip()}
    >
      <canvas ref={canvasRef} className="block h-full w-full" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
        <button
          type="button"
          onClick={() => stageRef.current?.skip()}
          className="pointer-events-auto flex cursor-pointer items-center gap-2.5 rounded-full border border-border-button-default bg-background-primary-default px-3.5 py-1.5 text-text-secondary shadow-card outline-none backdrop-blur-xl transition-colors duration-150 hover:border-border-button-hover hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
        >
          <span className="size-1.5 animate-pulse rounded-full bg-accent-500" aria-hidden />
          <span className="text-[11px] font-medium">蜂群重建</span>
          <span ref={metaRef} className="text-[11px] tabular-nums text-text-tertiary">
            0 / 0
          </span>
          <span className="text-[10px] text-text-placeholder">点击跳过</span>
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ measure */

function measure(graph: SwarmBuildProps['graph']): { blueprint: SwarmBlueprint; host: HTMLElement } | null {
  const host = document.querySelector<HTMLElement>('.agent-canvas')
  if (!host) return null
  const box = host.getBoundingClientRect()
  if (box.width < 240 || box.height < 240) return null

  const nodes: SwarmNode[] = []
  for (const node of graph.nodes) {
    const el = host.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(node.id)}"]`)
    if (!el) continue
    const rect = el.getBoundingClientRect()
    if (rect.width < 32 || rect.height < 24) continue
    if (rect.right < box.left || rect.left > box.right || rect.bottom < box.top || rect.top > box.bottom) continue
    nodes.push({
      id: node.id,
      x: rect.left - box.left,
      y: rect.top - box.top,
      w: rect.width,
      h: rect.height,
      label: node.data.label,
      subtitle: node.data.subtitle,
      kind: node.type,
    })
  }
  if (nodes.length === 0) return null

  return {
    host,
    blueprint: {
      width: box.width,
      height: box.height,
      nodes,
      edges: graph.edges.map((edge) => ({
        id: edge.id,
        from: edge.source,
        to: edge.target,
        loop: edge.kind === 'loop',
      })),
    },
  }
}

function position(layer: HTMLElement, host: HTMLElement) {
  const rect = host.getBoundingClientRect()
  layer.style.left = `${rect.left}px`
  layer.style.top = `${rect.top}px`
  layer.style.width = `${rect.width}px`
  layer.style.height = `${rect.height}px`
  layer.style.borderRadius = radiusOf(host)
}

function radiusOf(el: HTMLElement) {
  let node: HTMLElement | null = el
  while (node) {
    const radius = getComputedStyle(node).borderRadius
    if (radius && radius !== '0px') return radius
    node = node.parentElement
  }
  return '0px'
}

function readPalette(host: HTMLElement) {
  const style = getComputedStyle(host)
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
  return {
    surface: read('--color-background-full', '#000000'),
    box: read('--color-background-primary-default', '#101012'),
    border: read('--color-border-button-default', 'rgba(255, 255, 255, 0.14)'),
    text: read('--color-text-primary', '#f5f5f7'),
    soft: read('--color-text-tertiary', '#8e8e93'),
    accent: read('--color-accent-500', '#0d99ff'),
  }
}
