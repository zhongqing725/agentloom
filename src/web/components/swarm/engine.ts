/**
 * Swarm rebuild — the drawing engine.
 *
 * A crowd of multiplayer cursors redraws a workflow graph on a single 2D
 * canvas: boxes are dragged out with a live `W × H` badge, labels are typed
 * with an I-beam and a blinking caret, and connectors are penned between
 * anchor points. It never touches the page DOM, so the real canvas underneath
 * can fade back in the moment the last layer lands.
 *
 * The engine is deliberately dependency free: give it a blueprint and a 2D
 * context, call `start()`, and it calls `onDone` when the pass is finished.
 * There is no loop: one pass per `start()`.
 */

export interface SwarmNode {
  id: string
  x: number
  y: number
  w: number
  h: number
  label: string
  subtitle?: string
  kind: string
}

export interface SwarmEdge {
  id: string
  from: string
  to: string
  loop?: boolean
}

export interface SwarmBlueprint {
  width: number
  height: number
  nodes: SwarmNode[]
  edges: SwarmEdge[]
}

export interface SwarmPalette {
  surface: string
  box: string
  border: string
  text: string
  soft: string
  accent: string
}

export interface SwarmOptions {
  names: string[]
  palette: SwarmPalette
  font: string
  onProgress?: (done: number, total: number) => void
  onDone?: () => void
}

type Shape = 'arrow' | 'crosshair' | 'ibeam' | 'pen'
type Job = Generator<void, void, number>

interface Task {
  id: string
  kind: 'node' | 'edge'
  node?: SwarmNode
  edge?: SwarmEdge
  claimed: boolean
  done: boolean
  box: number
  typed: number
  grow: number
}

interface Agent {
  name: string
  color: string
  x: number
  y: number
  shape: Shape
  press: number
  alpha: number
  job: Job | null
  task: Task | null
  phase: number
}

const TAU = Math.PI * 2
const CURSOR_COLORS = ['#ff6b6b', '#a259ff', '#0d99ff', '#0acf83', '#ffc700', '#ff7262', '#00b5ce', '#e8467c', '#f2994a']

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

function* glide(a: Agent, tx: number, ty: number, dur: number): Job {
  const sx = a.x
  const sy = a.y
  let t = 0
  while (t < dur) {
    const dt = yield
    t += dt
    const k = easeInOut(clamp(t / dur, 0, 1))
    a.x = sx + (tx - sx) * k
    a.y = sy + (ty - sy) * k
  }
  a.x = tx
  a.y = ty
}

function* wait(dur: number): Job {
  let t = 0
  while (t < dur) t += yield
}

interface Curve {
  p0: { x: number; y: number }
  c1: { x: number; y: number }
  c2: { x: number; y: number }
  p1: { x: number; y: number }
  loop: boolean
}

function curveAt(c: Curve, t: number) {
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const d = 3 * u * t * t
  const e = t * t * t
  return {
    x: a * c.p0.x + b * c.c1.x + d * c.c2.x + e * c.p1.x,
    y: a * c.p0.y + b * c.c1.y + d * c.c2.y + e * c.p1.y,
  }
}

export class SwarmStage {
  private ctx: CanvasRenderingContext2D
  private dpr = 1
  private t = 0
  private phase: 'intro' | 'build' | 'outro' | 'done' = 'intro'
  private phaseT = 0
  private raf = 0
  private last = 0
  private stopped = false
  private agents: Agent[] = []
  private queue: Task[] = []
  private byId = new Map<string, SwarmNode>()
  private finished = new Set<string>()
  private doneCount = 0
  private blink = 0

  constructor(
    private canvas: HTMLCanvasElement,
    private bp: SwarmBlueprint,
    private opts: SwarmOptions,
  ) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('SwarmStage needs a 2D context')
    this.ctx = ctx
    this.build()
  }

  /* ------------------------------------------------------------------ setup */

  private build() {
    const { nodes, edges } = this.bp
    for (const node of nodes) this.byId.set(node.id, node)

    const nodeTasks: Task[] = nodes
      .slice()
      .sort((a, b) => a.x - b.x || a.y - b.y)
      .map((node) => ({ id: `n:${node.id}`, kind: 'node', node, claimed: false, done: false, box: 0, typed: 0, grow: 0 }))

    const edgeTasks: Task[] = edges
      .filter((edge) => this.byId.has(edge.from) && this.byId.has(edge.to))
      .map((edge) => ({ id: `e:${edge.id}`, kind: 'edge', edge, claimed: false, done: false, box: 0, typed: 0, grow: 0 }))

    this.queue = [...nodeTasks, ...edgeTasks]

    const count = clamp(Math.round(nodes.length * 0.7), 4, 9)
    for (let i = 0; i < count; i += 1) {
      this.agents.push({
        name: this.opts.names[i % Math.max(1, this.opts.names.length)] ?? `agent-${i + 1}`,
        color: CURSOR_COLORS[i % CURSOR_COLORS.length],
        x: this.bp.width / 2,
        y: this.bp.height / 2,
        shape: 'arrow',
        press: 0,
        alpha: 0,
        job: null,
        task: null,
        phase: (i / count) * TAU,
      })
    }
  }

  resize(width: number, height: number, dpr: number) {
    this.dpr = dpr
    this.canvas.width = Math.max(1, Math.round(width * dpr))
    this.canvas.height = Math.max(1, Math.round(height * dpr))
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  /* ------------------------------------------------------------- lifecycle */

  start() {
    if (this.stopped) return
    this.opts.onProgress?.(0, this.queue.length)
    this.draw() // paint the cover before the first frame, so a throttled tab never shows through
    this.last = performance.now()
    this.raf = requestAnimationFrame(this.frame)
  }

  stop() {
    this.stopped = true
    cancelAnimationFrame(this.raf)
  }

  /** Jump to the finished drawing and fade out — used by the skip control. */
  skip() {
    if (this.phase === 'outro' || this.phase === 'done') return
    for (const task of this.queue) {
      task.box = 1
      task.typed = this.textOf(task).length
      task.grow = 1
      if (!task.done) {
        task.done = true
        this.doneCount += 1
      }
      task.claimed = true
    }
    for (const agent of this.agents) {
      agent.job = null
      agent.task = null
      agent.press = 0
    }
    this.finished.clear()
    for (const node of this.bp.nodes) this.finished.add(node.id)
    this.opts.onProgress?.(this.doneCount, this.queue.length)
    this.phase = 'outro'
    this.phaseT = 0.42
  }

  /* ----------------------------------------------------------------- frame */

  private frame = (now: number) => {
    if (this.stopped) return
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000))
    this.last = now
    this.t += dt
    this.phaseT += dt
    this.blink += dt
    this.update(dt)
    this.draw()
    if (this.phase !== 'done') this.raf = requestAnimationFrame(this.frame)
  }

  private update(dt: number) {
    if (this.phase === 'intro') {
      const cx = this.bp.width / 2
      const cy = this.bp.height / 2
      const k = clamp(this.t / 0.9, 0, 1)
      const radius = 190 - 90 * easeOut(k)
      for (const agent of this.agents) {
        agent.phase += dt * 0.9
        agent.x = cx + Math.cos(agent.phase) * radius
        agent.y = cy + Math.sin(agent.phase) * radius * 0.55
        agent.alpha = clamp(this.phaseT / 0.3, 0, 1)
      }
      if (this.phaseT >= 0.9) {
        this.phase = 'build'
        this.phaseT = 0
      }
      return
    }

    if (this.phase === 'build') {
      for (const agent of this.agents) {
        agent.alpha = Math.min(1, agent.alpha + dt * 3)
        if (!agent.job) {
          const task = this.nextTask()
          if (task) {
            task.claimed = true
            agent.task = task
            agent.job = task.kind === 'node' ? this.buildNode(agent, task) : this.drawEdge(agent, task)
            agent.phase = 0
          }
        }
        if (agent.job) {
          agent.phase += dt
          const step = agent.job.next(dt)
          if (step.done) {
            agent.job = null
            agent.shape = 'arrow'
            agent.press = 0
            if (agent.task) this.finish(agent.task)
            agent.task = null
          }
        } else {
          // nothing to claim: drift gently so the crowd never looks frozen
          agent.x += Math.cos(agent.phase + this.t * 1.4) * dt * 14
          agent.y += Math.sin(agent.phase + this.t * 1.1) * dt * 10
        }
      }
      if (this.doneCount >= this.queue.length) {
        this.phase = 'outro'
        this.phaseT = 0
      }
      return
    }

    if (this.phase === 'outro' && this.phaseT >= 0.75) {
      this.phase = 'done'
      this.stopped = true
      cancelAnimationFrame(this.raf)
      this.opts.onDone?.()
    }
  }

  private nextTask(): Task | null {
    for (const task of this.queue) {
      if (task.claimed || task.done) continue
      if (task.kind === 'edge') {
        const edge = task.edge
        if (!edge || !this.finished.has(edge.from) || !this.finished.has(edge.to)) continue
      }
      return task
    }
    return null
  }

  private finish(task: Task) {
    if (task.done) return
    task.done = true
    task.box = 1
    task.typed = this.textOf(task).length
    task.grow = 1
    if (task.node) this.finished.add(task.node.id)
    this.doneCount += 1
    this.opts.onProgress?.(this.doneCount, this.queue.length)
  }

  private textOf(task: Task) {
    const node = task.node
    if (!node) return ''
    return `${node.label}${node.subtitle ?? ''}`
  }

  /* ------------------------------------------------------------------ jobs */

  private *buildNode(agent: Agent, task: Task): Job {
    const node = task.node
    if (!node) return
    agent.shape = 'crosshair'
    yield* glide(agent, node.x - 26, node.y + node.h + 26, 0.26)

    agent.x = node.x
    agent.y = node.y
    agent.press = 1
    task.box = 0.001
    let p = 0
    while (p < 1) {
      const dt = yield
      p = clamp(p + dt / 0.5, 0, 1)
      const k = easeOut(p)
      agent.x = node.x + node.w * k
      agent.y = node.y + node.h * k
      task.box = k
    }
    task.box = 1
    agent.press = 0

    agent.shape = 'ibeam'
    yield* glide(agent, node.x + node.w + 14, node.y + 30, 0.18)
    const total = this.textOf(task).length
    while (task.typed < total) {
      const dt = yield
      task.typed = Math.min(total, task.typed + dt * 12)
    }
    task.typed = total
  }

  private *drawEdge(agent: Agent, task: Task): Job {
    const edge = task.edge
    if (!edge) return
    const curve = this.curveFor(edge)
    if (!curve) return
    agent.shape = 'pen'
    yield* glide(agent, curve.p0.x, curve.p0.y, 0.26)
    agent.press = 1
    let p = 0
    while (p < 1) {
      const dt = yield
      p = clamp(p + dt / 0.42, 0, 1)
      const k = easeInOut(p)
      task.grow = k
      const pt = curveAt(curve, k)
      agent.x = pt.x
      agent.y = pt.y
    }
    task.grow = 1
    agent.press = 0
    yield* wait(0.05)
  }

  /* ---------------------------------------------------------------- curves */

  private curveFor(edge: SwarmEdge): Curve | null {
    const from = this.byId.get(edge.from)
    const to = this.byId.get(edge.to)
    if (!from || !to) return null
    const p0 = { x: from.x + from.w, y: from.y + from.h / 2 }
    const p1 = { x: to.x, y: to.y + to.h / 2 }
    const dx = p1.x - p0.x
    const loop = edge.loop || p1.x < p0.x + 40
    const dip = Math.max(70, Math.min(160, Math.abs(dx) * 0.5 + Math.abs(p1.y - p0.y) * 0.4))
    return {
      p0,
      p1,
      loop,
      c1: loop ? { x: p0.x + 90, y: p0.y + dip } : { x: p0.x + dx * 0.5, y: p0.y },
      c2: loop ? { x: p1.x - 90, y: p1.y + dip } : { x: p1.x - dx * 0.5, y: p1.y },
    }
  }

  /* ----------------------------------------------------------------- draw */

  private draw() {
    const { ctx, bp } = this
    const pal = this.opts.palette
    ctx.clearRect(0, 0, bp.width, bp.height)

    const cover = this.coverAlpha()
    if (cover <= 0) return
    ctx.save()
    ctx.fillStyle = pal.surface
    ctx.globalAlpha = cover
    ctx.fillRect(0, 0, bp.width, bp.height)
    this.drawGrid(cover)
    ctx.restore()

    for (const task of this.queue) if (task.kind === 'node') this.drawNodeTask(task)
    for (const task of this.queue) if (task.kind === 'edge') this.drawEdgeTask(task)

    if (this.phase !== 'outro' && this.phase !== 'done') {
      for (const agent of this.agents) this.drawAgent(agent)
    }
  }

  private coverAlpha() {
    if (this.phase === 'done') return 0
    if (this.phase === 'intro') return clamp(this.phaseT / 0.22, 0, 1)
    if (this.phase === 'outro') return clamp(1 - this.phaseT / 0.75, 0, 1)
    return 1
  }

  private drawGrid(alpha: number) {
    const { ctx, bp } = this
    const gap = 22
    ctx.save()
    ctx.globalAlpha = alpha * 0.5
    ctx.fillStyle = this.opts.palette.border
    for (let x = gap; x < bp.width; x += gap) {
      for (let y = gap; y < bp.height; y += gap) {
        ctx.fillRect(x, y, 1, 1)
      }
    }
    ctx.restore()
  }

  private drawNodeTask(task: Task) {
    const node = task.node
    if (!node || task.box <= 0) return
    const { ctx } = this
    const pal = this.opts.palette
    const k = task.box

    if (k < 1) {
      ctx.save()
      ctx.strokeStyle = pal.accent
      ctx.lineWidth = 1.25
      ctx.setLineDash([6, 4])
      ctx.strokeRect(node.x + 0.5, node.y + 0.5, node.w * k, node.h * k)
      ctx.restore()
      this.drawSizeBadge(node.x + node.w * k + 18, node.y + node.h * k + 16, node.w * k, node.h * k)
      return
    }

    ctx.save()
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)'
    ctx.shadowBlur = 22
    ctx.shadowOffsetY = 8
    ctx.fillStyle = pal.box
    ctx.beginPath()
    ctx.roundRect(node.x, node.y, node.w, node.h, 14)
    ctx.fill()
    ctx.restore()

    ctx.save()
    ctx.strokeStyle = pal.border
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(node.x + 0.5, node.y + 0.5, node.w - 1, node.h - 1, 14)
    ctx.stroke()
    ctx.restore()

    const typed = Math.floor(task.typed)
    const label = node.label.slice(0, Math.min(node.label.length, typed))
    const sub = (node.subtitle ?? '').slice(0, Math.max(0, typed - node.label.length))
    const typing = task.typed < this.textOf(task).length

    ctx.save()
    ctx.beginPath()
    ctx.rect(node.x + 10, node.y + 4, node.w - 20, node.h - 8)
    ctx.clip()
    ctx.fillStyle = pal.soft
    ctx.font = `500 8.5px ${this.opts.font}`
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(node.kind.toUpperCase(), node.x + 12, node.y + 15)
    ctx.fillStyle = pal.text
    ctx.font = `500 12.5px ${this.opts.font}`
    ctx.fillText(label, node.x + 12, node.y + 34)
    if (sub) {
      ctx.fillStyle = pal.soft
      ctx.font = `400 10.5px ${this.opts.font}`
      ctx.fillText(sub, node.x + 12, node.y + 50)
    }
    ctx.restore()

    if (typing && this.blink % 0.9 < 0.5) {
      const inSubtitle = typed > node.label.length
      const line = inSubtitle ? sub : label
      ctx.font = inSubtitle ? `400 10.5px ${this.opts.font}` : `500 12.5px ${this.opts.font}`
      const caretX = node.x + 12 + ctx.measureText(line).width + 1
      const caretY = inSubtitle ? node.y + 41 : node.y + 23
      ctx.fillStyle = pal.accent
      ctx.fillRect(caretX, caretY, 1.4, inSubtitle ? 12 : 14)
    }

    ctx.fillStyle = pal.accent
    ctx.beginPath()
    ctx.arc(node.x + node.w - 12, node.y + 12, 2.4, 0, TAU)
    ctx.fill()
  }

  private drawSizeBadge(x: number, y: number, w: number, h: number) {
    const { ctx } = this
    const text = `${Math.round(w)} × ${Math.round(h)}`
    ctx.save()
    ctx.font = `500 10px ${this.opts.font}`
    const width = ctx.measureText(text).width + 14
    ctx.fillStyle = 'rgba(10, 10, 12, 0.92)'
    ctx.beginPath()
    ctx.roundRect(x, y, width, 20, 6)
    ctx.fill()
    ctx.strokeStyle = this.opts.palette.accent
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.fillStyle = '#ffffff'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, x + 7, y + 10.5)
    ctx.restore()
  }

  private drawEdgeTask(task: Task) {
    const edge = task.edge
    if (!edge || task.grow <= 0) return
    const curve = this.curveFor(edge)
    if (!curve) return
    const { ctx } = this
    const pal = this.opts.palette
    const steps = 34
    const upto = Math.max(2, Math.round(steps * task.grow))

    ctx.save()
    ctx.strokeStyle = curve.loop ? pal.accent : pal.border
    ctx.lineWidth = 1.35
    if (task.grow < 1) ctx.setLineDash([5, 4])
    ctx.beginPath()
    for (let i = 0; i <= upto; i += 1) {
      const pt = curveAt(curve, (i / steps) * task.grow)
      if (i === 0) ctx.moveTo(pt.x, pt.y)
      else ctx.lineTo(pt.x, pt.y)
    }
    ctx.stroke()
    ctx.restore()

    if (task.grow >= 1) {
      const tip = curve.p1
      const prev = curveAt(curve, 0.97)
      const angle = Math.atan2(tip.y - prev.y, tip.x - prev.x)
      ctx.save()
      ctx.translate(tip.x, tip.y)
      ctx.rotate(angle)
      ctx.fillStyle = curve.loop ? pal.accent : pal.border
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(-8, -3.6)
      ctx.lineTo(-8, 3.6)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }
  }

  private drawAgent(agent: Agent) {
    const { ctx } = this
    ctx.save()
    ctx.globalAlpha = agent.alpha

    if (agent.press > 0) {
      ctx.save()
      ctx.globalAlpha = agent.alpha * agent.press * 0.5
      ctx.strokeStyle = agent.color
      ctx.lineWidth = 1.6
      ctx.beginPath()
      ctx.arc(agent.x, agent.y, 6 + (1 - agent.press) * 14, 0, TAU)
      ctx.stroke()
      ctx.restore()
    }

    ctx.translate(agent.x, agent.y)
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)'
    ctx.lineWidth = 1.2
    ctx.fillStyle = agent.color

    if (agent.shape === 'crosshair') {
      ctx.beginPath()
      ctx.moveTo(-9, 0)
      ctx.lineTo(9, 0)
      ctx.moveTo(0, -9)
      ctx.lineTo(0, 9)
      ctx.strokeStyle = agent.color
      ctx.lineWidth = 1.4
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(0, 0, 4.5, 0, TAU)
      ctx.stroke()
    } else if (agent.shape === 'ibeam') {
      ctx.beginPath()
      ctx.moveTo(0, -10)
      ctx.lineTo(0, 12)
      ctx.moveTo(-4, -10)
      ctx.lineTo(4, -10)
      ctx.moveTo(-4, 12)
      ctx.lineTo(4, 12)
      ctx.strokeStyle = agent.color
      ctx.lineWidth = 1.6
      ctx.stroke()
    } else if (agent.shape === 'pen') {
      ctx.beginPath()
      ctx.moveTo(0, -11)
      ctx.lineTo(7, 10)
      ctx.lineTo(-7, 10)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, -11)
      ctx.lineTo(0, 2)
      ctx.strokeStyle = 'rgba(255,255,255,.8)'
      ctx.lineWidth = 1
      ctx.stroke()
    } else {
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(0, 17)
      ctx.lineTo(4.6, 12.6)
      ctx.lineTo(7.4, 18.6)
      ctx.lineTo(10.4, 17.2)
      ctx.lineTo(7.7, 11.4)
      ctx.lineTo(13.4, 11.4)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    }

    // name tag
    ctx.font = `500 10px ${this.opts.font}`
    const label = agent.name
    const w = ctx.measureText(label).width + 12
    const bx = 12
    const by = 16
    ctx.globalAlpha = agent.alpha * 0.96
    ctx.fillStyle = agent.color
    ctx.beginPath()
    ctx.roundRect(bx, by, w, 18, 5)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, bx + 6, by + 9.5)
    ctx.restore()
  }
}
