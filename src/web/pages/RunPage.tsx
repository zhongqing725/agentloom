import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  RiArrowLeftLine,
  RiArrowRightLine,
  RiArrowRightSLine,
  RiCheckLine,
  RiCloseLine,
  RiFileCopyLine,
  RiDownloadLine,
  RiErrorWarningLine,
  RiFileTextLine,
  RiGitBranchLine,
  RiPauseLine,
  RiRefreshLine,
  RiShieldCheckLine,
  RiSignalWifiOffLine,
  RiSparklingLine,
  RiTerminalBoxLine,
  RiTimerLine,
  RiVerifiedBadgeLine,
} from '@remixicon/react'
import { useApp } from '../App'
import { api } from '../api'
import type { Citation, NodeRun, RunEvent } from '../../shared/types'
import { Badge } from '@/components/base/badges/badge'
import { Button, ButtonLink } from '@/components/base/buttons/button'
import { Spinner } from '@/components/base/spinner/spinner'
import { Tab, TabList, TabPanel, Tabs } from '@/components/base/tabs/tabs'
import { cx } from '@/utils/cx'
import { MarkdownView, Modal, ScoreRing, StatusPill, Surface } from '../components/ui'
import { WorkflowGraph, type NodeStatusInfo } from '../components/Graph'

type RunTab = 'graph' | 'report' | 'ledger' | 'verify' | 'events'

const TABS: Array<{
  key: RunTab
  label: string
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>
}> = [
  { key: 'graph', label: '执行图谱', icon: RiGitBranchLine },
  { key: 'report', label: '研究报告', icon: RiFileTextLine },
  { key: 'ledger', label: '证据账本', icon: RiVerifiedBadgeLine },
  { key: 'verify', label: '核查与回环', icon: RiShieldCheckLine },
  { key: 'events', label: '事件流', icon: RiTerminalBoxLine },
]

function formatTime(value?: string) {
  if (!value) return '--:--:--'
  return new Date(value).toLocaleTimeString('zh-CN', { hour12: false })
}

function duration(start?: string, end?: string) {
  if (!start) return '—'
  const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime()
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
}

const TARGET_LABEL: Record<string, string> = {
  planner: '研究规划师',
  market: '市场研究员',
  chain: '产业链研究员',
  competition: '竞争情报员',
  analyst: '首席分析师',
  writer: '报告撰写师',
  verifier: '事实核查员',
  editor: '主编',
}

function targetLabel(target: string) {
  return TARGET_LABEL[target] ?? target
}

function latestByNode(nodes: NodeRun[]) {
  const map = new Map<string, NodeRun>()
  for (const node of nodes) {
    const current = map.get(node.nodeId)
    if (!current) {
      map.set(node.nodeId, node)
      continue
    }
    const currentTime = current.startedAt ? new Date(current.startedAt).getTime() : 0
    const nextTime = node.startedAt ? new Date(node.startedAt).getTime() : 0
    if (nextTime >= currentTime || node.iteration > current.iteration) map.set(node.nodeId, node)
  }
  return map
}

export default function RunPage() {
  const { id } = useParams<{ id: string }>()
  const { data } = useApp()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof api.getRun>> | null>(null)
  const [events, setEvents] = useState<RunEvent[]>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedClaim, setSelectedClaim] = useState(0)
  const [copied, setCopied] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [liveState, setLiveState] = useState<'connecting' | 'live' | 'reconnecting' | 'closed'>('connecting')
  const [now, setNow] = useState(() => Date.now())
  const feedRef = useRef<HTMLDivElement>(null)
  const detailRef = useRef(detail)
  const loadSeq = useRef(0)
  const activeRunId = useRef<string | undefined>(id)
  const stickToBottom = useRef(true)

  const requestedTab = searchParams.get('tab')
  const tab: RunTab =
    requestedTab === 'report' || requestedTab === 'ledger' || requestedTab === 'verify' || requestedTab === 'events'
      ? requestedTab
      : 'graph'
  const focusNode = searchParams.get('node')
  const runningNow = detail?.run.id === id && (detail?.run.status === 'running' || detail?.run.status === 'queued')

  const load = useCallback(async () => {
    if (!id || activeRunId.current !== id) return
    const seq = ++loadSeq.current
    try {
      const next = await api.getRun(id)
      if (seq !== loadSeq.current || activeRunId.current !== id) return
      setDetail(next)
      setLoadError('')
      setEvents((current) => {
        if (activeRunId.current !== id) return current
        const map = new Map(current.filter((event) => event.runId === id).map((event) => [event.seq, event]))
        for (const event of next.events) map.set(event.seq, event)
        return [...map.values()].sort((a, b) => a.seq - b.seq)
      })
      if (next.run.status === 'completed' || next.run.status === 'failed' || next.run.status === 'cancelled') {
        setLiveState('closed')
      }
    } catch (cause) {
      if (seq === loadSeq.current && activeRunId.current === id) {
        setLoadError(cause instanceof Error ? cause.message : '无法刷新运行状态')
      }
    }
  }, [id])

  useEffect(() => {
    detailRef.current = detail
  }, [detail])

  useEffect(() => {
    if (!id) return
    let alive = true
    let refreshTimer: number | undefined
    activeRunId.current = id
    // React Router reuses this page between runs. Drop the previous run's
    // selection and stream before loading a new one (sequence IDs are local).
    detailRef.current = null
    stickToBottom.current = true
    setDetail(null)
    setEvents([])
    setSelectedNodeId(null)
    setSelectedClaim(0)
    setCopied(false)
    setCancelling(false)
    setLoadError('')
    setNow(Date.now())
    setLiveState('connecting')
    void load()

    const scheduleLoad = () => {
      if (refreshTimer) window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => {
        if (alive) void load()
      }, 140)
    }

    const source = new EventSource(`/api/runs/${id}/events`)
    source.onopen = () => {
      if (!alive) return
      setLiveState((current) => (current === 'closed' ? current : 'live'))
    }
    source.onerror = () => {
      if (!alive) return
      setLiveState((current) => (current === 'closed' ? current : 'reconnecting'))
    }
    source.onmessage = (message) => {
      if (!alive) return
      try {
        const event = JSON.parse(message.data) as RunEvent
        if (event.runId !== id) return
        setEvents((current) => {
          if (!alive) return current
          if (current.some((item) => item.seq === event.seq)) return current
          return [...current, event].sort((a, b) => a.seq - b.seq)
        })

        if (event.type === 'run.completed' || event.type === 'run.failed' || event.type === 'run.cancelled') {
          source.close()
          setLiveState('closed')
          void load()
          return
        }

        if (
          event.type === 'run.started' ||
          event.type === 'node.queued' ||
          event.type === 'node.started' ||
          event.type === 'node.completed' ||
          event.type === 'node.failed' ||
          event.type === 'node.retry' ||
          event.type === 'loop.triggered' ||
          event.type === 'verify.failed' ||
          event.type === 'node.merge'
        ) {
          scheduleLoad()
        }
      } catch {
        // ignore malformed SSE
      }
    }

    const poll = window.setInterval(() => {
      if (!alive) return
      const status = detailRef.current?.run.status
      if (status === 'running' || status === 'queued') {
        void load()
      } else if (status === 'completed' || status === 'failed' || status === 'cancelled') {
        source.close()
        setLiveState('closed')
      }
    }, 1800)

    return () => {
      alive = false
      activeRunId.current = undefined
      // Invalidate pending getRun responses, including an old cancel's refresh.
      loadSeq.current += 1
      source.close()
      window.clearInterval(poll)
      if (refreshTimer) window.clearTimeout(refreshTimer)
    }
  }, [id, load])

  useEffect(() => {
    if (focusNode) setSelectedNodeId(focusNode)
  }, [id, focusNode])

  useEffect(() => {
    if (!runningNow) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [runningNow])

  useEffect(() => {
    if (stickToBottom.current && feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight
    }
  }, [events])

  const selectTab = (next: RunTab) => {
    const params = new URLSearchParams(searchParams)
    if (next === 'graph') params.delete('tab')
    else params.set('tab', next)
    setSearchParams(params, { replace: true })
  }

  const latest = useMemo(() => latestByNode(detail?.nodes ?? []), [detail])
  const selectedNode = selectedNodeId ? latest.get(selectedNodeId) ?? null : null
  const statuses = useMemo(() => {
    const map = new Map<string, NodeStatusInfo>()
    if (!data) return map
    for (const node of data.workflow.graph.nodes) {
      const nodeRun = latest.get(node.id)
      map.set(node.id, {
        status: nodeRun?.status ?? 'pending',
        score: nodeRun?.score,
        iteration: nodeRun?.iteration,
      })
    }
    return map
  }, [data, latest])

  const verifierRuns = useMemo(
    () => (detail?.nodes ?? []).filter((node) => node.nodeId === 'verifier').sort((a, b) => a.iteration - b.iteration),
    [detail],
  )
  const verifier = verifierRuns[verifierRuns.length - 1]
  const verdict = verifier?.output?.verdict
  const outputNode = latest.get('output')
  const markdown = detail?.run.output ?? outputNode?.output?.markdown ?? outputNode?.output?.text ?? ''

  const citations = useMemo(() => {
    const map = new Map<string, Citation>()
    for (const node of detail?.nodes ?? []) {
      for (const citation of node.output?.citations ?? []) map.set(citation.id, citation)
    }
    return [...map.values()]
  }, [detail])

  const ledgerClaims = verdict?.claims ?? []
  const supportedClaims = ledgerClaims.filter((claim) => claim.supported).length
  const activeClaim = ledgerClaims[Math.min(selectedClaim, Math.max(0, ledgerClaims.length - 1))]
  const activeCitation = activeClaim?.citation ? citations.find((item) => item.id === activeClaim.citation) : undefined

  if (!data || !detail || detail.run.id !== id) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center gap-3 text-body-regular text-text-secondary">
        <Spinner size="sm" aria-label="正在装载运行轨迹" />
        <span>正在装载运行轨迹…</span>
      </div>
    )
  }

  const running = runningNow
  const workflowNodes = data.workflow.graph.nodes
  const completedCount = workflowNodes.filter((node) => latest.get(node.id)?.status === 'completed').length
  const activeRuns = workflowNodes
    .map((node) => latest.get(node.id))
    .filter((nodeRun) => nodeRun?.status === 'running' || nodeRun?.status === 'queued')
  const progress = workflowNodes.length > 0 ? Math.round((completedCount / workflowNodes.length) * 100) : 0
  const elapsed = duration(
    detail.run.startedAt,
    detail.run.finishedAt ?? (running ? new Date(now).toISOString() : undefined),
  )

  const copyReport = async () => {
    await navigator.clipboard.writeText(markdown)
    if (activeRunId.current !== id) return
    setCopied(true)
    setTimeout(() => {
      if (activeRunId.current === id) setCopied(false)
    }, 1600)
  }

  const cancel = async () => {
    if (!id || cancelling) return
    setCancelling(true)
    try {
      await api.cancelRun(id)
      await load()
    } finally {
      if (activeRunId.current === id) setCancelling(false)
    }
  }

  const tabCount: Record<RunTab, number | undefined> = {
    graph: detail.nodes.length,
    report: undefined,
    ledger: verdict?.claims?.length,
    verify: verifierRuns.length > 1 ? verifierRuns.length : undefined,
    events: events.length,
  }

  return (
    <div className="app-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="small" leadingIcon={RiArrowLeftLine} onClick={() => navigate('/')}>
          返回总览
        </Button>
        <div className="hidden items-center gap-2 text-caption-1-regular text-text-tertiary sm:flex">
          <RiTimerLine className="size-3.5" aria-hidden />
          启动于 {formatTime(detail.run.startedAt)} · {detail.run.mode === 'live' ? 'Live 模型' : 'Mock 演示'}
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <div className="text-caption-1-semibold uppercase tracking-[0.16em] text-accent-600">Run · {detail.run.id}</div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-title-1-medium text-text-primary sm:text-display-4-medium">{data.workflow.name}</h1>
            <StatusPill status={detail.run.status} />
          </div>
          <p className="mt-1 text-caption-1-regular text-text-tertiary">
            {detail.run.mode === 'live' ? 'Live 模型' : 'Mock 演示'} ·{' '}
            {running ? '执行中' : detail.run.finishedAt ? `完成于 ${formatTime(detail.run.finishedAt)}` : '等待运行'}
          </p>
          <p className="mt-2 line-clamp-2 max-w-3xl text-body-2-regular leading-relaxed text-text-secondary">“{detail.run.input}”</p>
        </div>
        <div className="flex flex-col gap-4 rounded-3xl border border-separator-border bg-background-primary-default p-4 shadow-card backdrop-blur-xl xl:w-[370px]">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-caption-2-semibold uppercase tracking-[0.1em] text-text-tertiary">核查分</div>
              <div className="mt-1 text-title-2-semibold text-text-primary">
                {detail.run.score !== undefined ? `${Math.round(detail.run.score * 100)}%` : '—'}
              </div>
            </div>
            <div>
              <div className="text-caption-2-semibold uppercase tracking-[0.1em] text-text-tertiary">耗时</div>
              <div className="mt-1 text-title-2-semibold text-text-primary">{elapsed}</div>
            </div>
            <div>
              <div className="text-caption-2-semibold uppercase tracking-[0.1em] text-text-tertiary">Tokens</div>
              <div className="mt-1 text-title-2-semibold text-text-primary">{detail.run.tokens.toLocaleString()}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-separator-border pt-3">
            {running ? (
              <Button variant="secondary" leadingIcon={RiPauseLine} onClick={() => void cancel()} disabled={cancelling}>
                {cancelling ? '取消中…' : '取消'}
              </Button>
            ) : (
              <Button variant="secondary" leadingIcon={RiRefreshLine} onClick={() => navigate('/workflow')}>
                再运行
              </Button>
            )}
            <ButtonLink
              href={api.reportUrl(detail.run.id)}
              download
              variant="ghost"
              leadingIcon={RiDownloadLine}
              className="ms-auto"
            >
              导出报告
            </ButtonLink>
          </div>
        </div>
      </div>

      {detail.run.error && (
        <div className="mt-4 flex items-center gap-2 rounded-2xl border border-status-rose-text/30 bg-status-rose-background px-4 py-3 text-body-2-regular text-status-rose-text">
          <RiErrorWarningLine className="size-4 shrink-0" aria-hidden />
          {detail.run.error}
        </div>
      )}

      {running && (
        <div className="mt-4 rounded-2xl border border-accent-200 bg-accent-50 px-4 py-3" aria-live="polite">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption-1-regular text-text-secondary">
            <span className={cx('inline-flex items-center gap-1.5 font-mono text-caption-2-semibold uppercase tracking-[0.08em]', liveState === 'reconnecting' ? 'text-status-orange-text' : 'text-accent-700')}>
              {liveState === 'reconnecting' ? <RiSignalWifiOffLine className="size-3.5" /> : <span className="size-1.5 rounded-full bg-current" />}
              {liveState === 'reconnecting' ? '重连中' : liveState === 'connecting' ? '连接中' : 'Live'}
            </span>
            <span>
              {activeRuns.length > 0
                ? `${activeRuns.map((nodeRun) => nodeRun!.title).join('、')} 执行中`
                : '调度器正在选择下一批节点'}
            </span>
            <span className="text-text-tertiary">已完成 {completedCount} / {workflowNodes.length}</span>
            <strong className="ms-auto font-mono text-caption-1-semibold text-accent-700">{progress}%</strong>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-accent-100">
            <div className="h-full rounded-full bg-accent-500 transition-[width] duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {loadError && (
        <div className="mt-4 flex items-center gap-2 rounded-2xl bg-background-secondary-default px-4 py-2.5 text-caption-1-regular text-text-secondary">
          <RiSignalWifiOffLine className="size-3.5" aria-hidden /> {loadError}
        </div>
      )}

      <Tabs selectedKey={tab} onSelectionChange={(key) => selectTab(key as RunTab)} className="mt-5 gap-0">
      <div className="flex flex-wrap items-center gap-3">
        <div className="hide-scrollbar max-w-full overflow-x-auto">
          <TabList aria-label="运行详情视图" variant="segmented">
            {TABS.map((item) => (
              <Tab
                key={item.key}
                id={item.key}
                variant="segmented"
                icon={item.icon}
                count={tabCount[item.key]}
              >
                {item.label}
              </Tab>
            ))}
          </TabList>
        </div>
        <div className="ms-auto hidden items-center gap-2 sm:flex">
          {running && (
            <span className={cx('inline-flex items-center gap-1.5 text-caption-2-semibold uppercase tracking-[0.08em]', liveState === 'reconnecting' ? 'text-status-orange-text' : 'text-status-lime-text')}>
              <span className="size-1.5 rounded-full bg-current" />
              {liveState === 'reconnecting' ? '重连中' : 'Live'}
            </span>
          )}
          <Badge color="neutral">{detail.run.mode === 'mock' ? 'Mock' : 'Live'}</Badge>
        </div>
      </div>

      <TabPanel id="graph">
        <div className="mt-4 flex flex-col gap-4">
          <Surface className="overflow-hidden p-0">
            <WorkflowGraph
              graph={data.workflow.graph}
              agents={data.agents}
              plugins={data.plugins}
              statuses={statuses}
              readOnly
              height={470}
              onNodeClick={(nodeId) => {
                if (latest.has(nodeId)) setSelectedNodeId(nodeId)
              }}
            />
          </Surface>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
            <Surface className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-caption-1-semibold uppercase tracking-[0.16em] text-accent-600">Execution trace</div>
                  <h2 className="mt-1.5 text-title-3-semibold text-text-primary">节点轨迹</h2>
                </div>
                <span className="text-caption-1-regular text-text-tertiary">
                  {running ? `${completedCount}/${workflowNodes.length} 完成 · 点击节点看实时输出` : '点击节点查看输出与证据'}
                </span>
              </div>
              <div className="mt-3 flex flex-col">
                {workflowNodes.map((node) => {
                  const nodeRun = latest.get(node.id)
                  const status = nodeRun?.status ?? 'pending'
                  return (
                    <button
                      key={node.id}
                      onClick={() => nodeRun && setSelectedNodeId(node.id)}
                      className={cx(
                        'grid w-full grid-cols-[8px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl border-b border-separator-border px-2 py-2.5 text-left last:border-0',
                        'transition-colors duration-150 hover:bg-background-secondary-default',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring',
                        'sm:grid-cols-[8px_minmax(0,1fr)_auto_48px_54px_54px]',
                        status === 'running' && 'bg-accent-50',
                      )}
                    >
                      <span className={cx('size-1.5 rounded-full', status === 'running' ? 'animate-pulse bg-accent-500' : status === 'completed' ? 'bg-status-lime-text' : status === 'failed' ? 'bg-status-rose-text' : 'bg-text-tertiary')} />
                      <span className="min-w-0">
                        <span className="block truncate text-body-2-medium text-text-primary">{node.data.label}</span>
                        <span className="block truncate text-caption-1-regular text-text-tertiary">{node.data.subtitle}</span>
                      </span>
                      <span className="font-mono text-caption-2-medium text-accent-600">{nodeRun && nodeRun.iteration > 0 ? `L${nodeRun.iteration + 1}` : ''}</span>
                      <span className="hidden font-mono text-caption-1-regular text-status-lime-text sm:block">{nodeRun?.score !== undefined ? `${Math.round(nodeRun.score * 100)}%` : ''}</span>
                      <span className="hidden font-mono text-caption-1-regular text-text-tertiary sm:block">{nodeRun ? `${nodeRun.tokens} tok` : ''}</span>
                      <span className="hidden sm:block"><StatusPill status={status} /></span>
                    </button>
                  )
                })}
              </div>
            </Surface>

            <Surface className="flex min-h-[300px] flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-caption-1-semibold uppercase tracking-[0.16em] text-accent-600">Live feed</div>
                  <h2 className="mt-1.5 text-title-3-semibold text-text-primary">调度事件</h2>
                </div>
                <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-caption-2-semibold', running ? 'bg-accent-100 text-accent-700' : 'bg-background-tertiary-default text-text-tertiary')}>
                  <span className={cx('size-1.5 rounded-full bg-current', running && 'animate-pulse')} />
                  {running ? (liveState === 'reconnecting' ? '重连中' : 'Live') : '已归档'}
                </span>
              </div>
              {loadError && <div className="mt-2 flex items-center gap-1.5 text-caption-1-regular text-status-orange-text"><RiSignalWifiOffLine className="size-3.5" /> {loadError}</div>}
              <div
                ref={feedRef}
                className="mt-3 max-h-[420px] flex-1 overflow-y-auto pe-1"
                onScroll={(event) => {
                  const target = event.currentTarget
                  stickToBottom.current = target.scrollHeight - target.scrollTop - target.clientHeight < 36
                }}
              >
                {events.map((event) => (
                  <div key={event.seq} className="grid grid-cols-[48px_5px_minmax(0,1fr)] items-start gap-2 border-b border-separator-border/70 py-1.5 last:border-0">
                    <span className="font-mono text-caption-2-regular text-text-tertiary">{formatTime(event.ts)}</span>
                    <span className={cx('mt-1.5 size-1 rounded-full', event.type.includes('failed') || event.type.includes('loop') ? 'bg-accent-500' : 'bg-text-tertiary')} />
                    <span className={cx('text-caption-1-regular leading-relaxed', event.type.includes('failed') ? 'text-status-rose-text' : 'text-text-secondary')}>
                      {event.message ?? event.type}
                    </span>
                  </div>
                ))}
                {events.length === 0 && <div className="py-5 text-caption-1-regular text-text-tertiary">等待第一条调度事件…</div>}
                {running && <div className="py-2 font-mono text-caption-2-regular text-text-tertiary">正在接收下一个调度事件…</div>}
              </div>
            </Surface>
          </div>
        </div>
      </TabPanel>

      <TabPanel id="report">
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <Surface className="overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-separator-border px-5 py-4">
              <div>
                <div className="text-caption-1-semibold uppercase tracking-[0.16em] text-accent-600">Deliverable</div>
                <div className="mt-1 text-title-3-semibold text-text-primary">{data.project.name} · 投资研究报告</div>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="small" leadingIcon={copied ? RiCheckLine : RiFileCopyLine} onClick={() => void copyReport()}>
                  {copied ? '已复制' : '复制 Markdown'}
                </Button>
                <ButtonLink href={api.reportUrl(detail.run.id)} download size="small" variant="ghost" leadingIcon={RiDownloadLine}>
                  下载
                </ButtonLink>
              </div>
            </div>
            {markdown ? (
              <div className="mx-auto max-w-3xl px-5 py-6 sm:px-8">
                <MarkdownView content={markdown} citations={citations} />
              </div>
            ) : (
              <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-body-regular text-text-secondary">
                <Spinner size="sm" aria-label="报告生成中" />
                <span>{running ? '报告正在生成…' : '还没有生成报告。'}</span>
              </div>
            )}
          </Surface>
          <Surface className="h-fit p-5 xl:sticky xl:top-24">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-caption-1-semibold uppercase tracking-[0.16em] text-accent-600">Evidence</div>
                <h2 className="mt-1 text-title-3-semibold text-text-primary">引用证据</h2>
              </div>
              <Badge color="neutral">{citations.length}</Badge>
            </div>
            <div className="mt-4 flex flex-col gap-2.5">
              {citations.map((citation) => (
                <div key={citation.id} className="rounded-2xl border border-separator-border bg-background-secondary-default p-3">
                  <div className="flex items-start gap-2">
                    <span className="shrink-0 font-mono text-caption-2-semibold text-accent-600">[{citation.id}]</span>
                    <span className="text-caption-1-medium leading-relaxed text-text-primary">{citation.docTitle}</span>
                  </div>
                  <p className="mt-1.5 line-clamp-3 text-caption-1-regular leading-relaxed text-text-tertiary">{citation.quote}</p>
                </div>
              ))}
              {citations.length === 0 && <p className="text-caption-1-regular text-text-tertiary">报告完成后，这里会列出全部证据。</p>}
            </div>
          </Surface>
        </div>
      </TabPanel>

      <TabPanel id="ledger">
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Surface className="overflow-hidden p-0">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-separator-border px-5 py-5">
              <div>
                <div className="text-caption-1-semibold uppercase tracking-[0.16em] text-accent-600">Claim ledger</div>
                <h2 className="mt-1.5 text-title-2-semibold text-text-primary">证据账本</h2>
                <p className="mt-1 text-caption-1-regular text-text-secondary">每一条主张都能回到证据、核查结论与路由目标。</p>
              </div>
              <div className="flex gap-5 text-end">
                <div><div className="text-title-3-semibold text-text-primary">{ledgerClaims.length}</div><div className="text-caption-2-regular text-text-tertiary">条主张</div></div>
                <div><div className="text-title-3-semibold text-status-lime-text">{supportedClaims}</div><div className="text-caption-2-regular text-text-tertiary">被支持</div></div>
                <div><div className="text-title-3-semibold text-status-rose-text">{ledgerClaims.length - supportedClaims}</div><div className="text-caption-2-regular text-text-tertiary">待修正</div></div>
              </div>
            </div>
            <div className="p-2 sm:p-3">
              {ledgerClaims.map((claim, index) => {
                const citation = claim.citation ? citations.find((item) => item.id === claim.citation) : undefined
                return (
                  <button
                    key={index}
                    onClick={() => setSelectedClaim(index)}
                    className={cx(
                      'grid w-full grid-cols-[28px_minmax(0,1fr)_18px] items-start gap-3 rounded-2xl border-b border-separator-border px-3 py-3.5 text-left last:border-0',
                      'transition-colors duration-150 hover:bg-background-secondary-default',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring',
                      index === selectedClaim && 'bg-accent-50',
                    )}
                  >
                    <span className="font-mono text-caption-2-medium text-text-tertiary">{String(index + 1).padStart(2, '0')}</span>
                    <span className="min-w-0">
                      <span className="line-clamp-2 text-body-2-medium leading-relaxed text-text-primary">{claim.claim}</span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-2">
                        <span className={cx('rounded-full px-2 py-0.5 text-caption-2-semibold', claim.supported ? 'bg-status-lime-background text-status-lime-text' : 'bg-status-rose-background text-status-rose-text')}>
                          {claim.supported ? '支持' : '不支持'}
                        </span>
                        {citation && <span className="font-mono text-caption-2-regular text-accent-600">[{citation.id}]</span>}
                      </span>
                    </span>
                    <RiArrowRightSLine className={cx('mt-0.5 size-4 text-text-tertiary transition-opacity', index === selectedClaim ? 'opacity-100' : 'opacity-0')} aria-hidden />
                  </button>
                )
              })}
              {ledgerClaims.length === 0 && (
                <div className="flex flex-col items-center gap-2 px-4 py-14 text-center text-body-2-regular text-text-secondary">
                  <RiVerifiedBadgeLine className="size-5 text-accent-600" />
                  报告生成后，这里会出现逐条主张与证据。
                </div>
              )}
            </div>
          </Surface>

          <Surface className="h-fit p-5 xl:sticky xl:top-24">
            <ScoreRing score={verdict?.score ?? detail.run.score ?? 0} size={104} />
            <h3 className="mt-3 text-center text-title-3-semibold text-text-primary">{verdict?.passed ? '账本已对齐' : '账本存在缺口'}</h3>
            <p className="mt-1 text-center text-caption-1-regular leading-relaxed text-text-secondary">
              核查器逐条比对主张与证据；不通过的意见会按类型路由回上游节点。
            </p>
            {activeClaim && (
              <>
                <div className="mt-4 border-t border-separator-border pt-4">
                  <div className="text-caption-2-semibold uppercase tracking-[0.1em] text-text-tertiary">主张 / claim</div>
                  <p className="mt-1.5 text-body-2-medium leading-relaxed text-text-primary">{activeClaim.claim}</p>
                  <p className="mt-1.5 text-caption-1-regular leading-relaxed text-text-tertiary">{activeClaim.reason}</p>
                </div>
                <div className="mt-4 border-t border-separator-border pt-4">
                  <div className="text-caption-2-semibold uppercase tracking-[0.1em] text-text-tertiary">证据 / evidence</div>
                  {activeCitation ? (
                    <div className="mt-2 rounded-2xl border-s-2 border-accent-500 bg-accent-50 p-3">
                      <div className="text-caption-1-semibold text-text-primary">{activeCitation.docTitle}</div>
                      <p className="mt-1 text-caption-1-regular leading-relaxed text-text-secondary">{activeCitation.quote}</p>
                    </div>
                  ) : (
                    <p className="mt-2 text-caption-1-regular text-text-tertiary">没有找到对应证据。</p>
                  )}
                </div>
                {(verdict?.routes?.length ?? 0) > 0 && (
                  <div className="mt-4 border-t border-separator-border pt-4">
                    <div className="text-caption-2-semibold uppercase tracking-[0.1em] text-text-tertiary">问题路由 / route</div>
                    <div className="mt-2 flex flex-col gap-1.5">
                      {verdict!.routes!.map((route, index) => (
                        <div key={index} className="flex items-center gap-2 rounded-xl bg-background-secondary-default px-2.5 py-1.5 text-caption-1-regular">
                          <span className="font-mono text-caption-2-semibold text-accent-600">{route.type}</span>
                          <RiArrowRightLine className="size-3.5 text-accent-600" aria-hidden />
                          <span className="text-text-secondary">{targetLabel(route.target)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
            <div className="mt-4 flex flex-col gap-1.5 border-t border-separator-border pt-3 text-caption-2-regular text-text-tertiary">
              <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-status-lime-text" /> 证据支持</span>
              <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-status-rose-text" /> 缺少证据 / 数字不一致</span>
            </div>
          </Surface>
        </div>
      </TabPanel>

      <TabPanel id="verify">
        <div className="mt-4 flex flex-col gap-4">
          <Surface className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div>
              <div className="text-caption-1-semibold uppercase tracking-[0.16em] text-accent-600">Verification</div>
              <h2 className="mt-1.5 text-title-1-medium text-text-primary">{verdict?.passed ? '核查通过' : verdict ? '需要复核' : '等待核查'}</h2>
              <p className="mt-2 max-w-2xl text-body-2-regular leading-relaxed text-text-secondary">
                {verdict
                  ? `事实核查员逐条核对了 ${verdict.claims?.length ?? 0} 条结论。核查不通过时，运行时会按问题类型回到对应的上游节点，而不是一律重写。`
                  : '报告生成后，核查员会抽取结论、核对引用与数字，再决定是否回环。'}
              </p>
            </div>
            <ScoreRing score={verdict?.score ?? detail.run.score ?? 0} size={112} />
          </Surface>

          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <Surface className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-caption-1-semibold uppercase tracking-[0.16em] text-accent-600">Claim by claim</div>
                  <h2 className="mt-1.5 text-title-3-semibold text-text-primary">逐条核查</h2>
                </div>
                <span
                  className={cx(
                    'rounded-full px-2 py-0.5 text-caption-2-semibold',
                    verdict?.passed
                      ? 'bg-status-lime-background text-status-lime-text'
                      : 'bg-status-orange-background text-status-orange-text',
                  )}
                >
                  {verdict?.passed ? 'Pass' : 'Review'}
                </span>
              </div>
              {(verdict?.routes?.length ?? 0) > 0 && (
                <div className="mt-4 flex flex-col gap-1.5 rounded-2xl border border-accent-200 bg-accent-50 p-3">
                  <div className="text-caption-2-semibold uppercase tracking-[0.1em] text-accent-700">本轮问题路由</div>
                  {verdict!.routes!.map((route, index) => (
                    <div key={index} className="flex flex-wrap items-baseline gap-1.5 text-caption-1-regular">
                      <span className="font-mono text-caption-2-semibold text-accent-700">{route.type}</span>
                      <span className="text-text-tertiary">→</span>
                      <strong className="font-medium text-accent-700">{targetLabel(route.target)}</strong>
                      <span className="text-text-tertiary">{route.message}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-4 flex flex-col gap-2">
                {(verdict?.claims ?? []).map((claim, index) => (
                  <div key={index} className={cx('flex gap-2.5 rounded-2xl border p-3', claim.supported ? 'border-separator-border bg-background-secondary-default' : 'border-status-rose-text/20 bg-status-rose-background/40')}>
                    <span className={cx('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full', claim.supported ? 'bg-status-lime-background text-status-lime-text' : 'bg-status-rose-background text-status-rose-text')}>
                      {claim.supported ? <RiCheckLine className="size-3.5" /> : <RiCloseLine className="size-3.5" />}
                    </span>
                    <div>
                      <p className="text-body-2-regular leading-relaxed text-text-primary">{claim.claim}</p>
                      <p className="mt-1 text-caption-1-regular text-text-tertiary">{claim.reason}{claim.citation ? ` · [${claim.citation}]` : ''}</p>
                    </div>
                  </div>
                ))}
                {!verdict && <p className="py-4 text-caption-1-regular text-text-tertiary">暂无可核查的结论。</p>}
              </div>
            </Surface>

            <Surface className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-caption-1-semibold uppercase tracking-[0.16em] text-accent-600">Self-loop</div>
                  <h2 className="mt-1.5 text-title-3-semibold text-text-primary">回环历史</h2>
                </div>
                <Badge color="neutral">{verifierRuns.length} 轮</Badge>
              </div>
              <div className="mt-4 flex flex-col gap-2">
                {verifierRuns.map((run, index) => (
                  <div key={run.id} className="flex items-center gap-2.5 rounded-2xl border border-separator-border p-3">
                    <span className="rounded-md bg-accent-100 px-1.5 py-0.5 font-mono text-caption-2-semibold text-accent-700">L{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-body-2-medium text-text-primary">{run.output?.verdict?.passed ? '通过' : '未通过'}</div>
                      <div className="mt-0.5 text-caption-1-regular text-text-tertiary">
                        {Math.round((run.output?.verdict?.score ?? 0) * 100)}% · {run.output?.verdict?.issues.length ?? 0} 条问题
                        {run.output?.verdict?.selectedTarget
                          ? ` · → ${targetLabel(run.output.verdict.selectedTarget)}`
                          : run.output?.verdict?.routes?.[0]?.target
                            ? ` · → ${targetLabel(run.output.verdict.routes[0].target)}`
                            : ''}
                      </div>
                    </div>
                    {run.output?.verdict?.passed ? <RiCheckLine className="size-4 text-status-lime-text" /> : <RiErrorWarningLine className="size-4 text-status-orange-text" />}
                  </div>
                ))}
                {verifierRuns.length === 0 && <p className="text-caption-1-regular text-text-tertiary">尚未执行核查。</p>}
              </div>
              {verifierRuns.length > 1 && (
                <div className="mt-3 flex gap-2 rounded-2xl bg-background-secondary-default p-3 text-caption-1-regular leading-relaxed text-text-tertiary">
                  <RiGitBranchLine className="mt-0.5 size-3.5 shrink-0 text-accent-600" />
                  <span>第 1 轮未通过后，系统优先处理 citation，把问题路由到竞争情报员；上游重跑后，第 2 轮核查通过。</span>
                </div>
              )}
            </Surface>
          </div>
        </div>
      </TabPanel>

      <TabPanel id="events">
        <Surface className="mt-4 overflow-hidden p-0">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-separator-border px-5 py-4">
            <div>
              <div className="text-caption-1-semibold uppercase tracking-[0.16em] text-accent-600">Event log</div>
              <h2 className="mt-1.5 text-title-3-semibold text-text-primary">完整事件流</h2>
            </div>
            <span className="text-caption-1-regular text-text-tertiary">{events.length} 条事件 · 可回放</span>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              <div className="grid grid-cols-[48px_76px_160px_96px_minmax(260px,1fr)] gap-3 border-b border-separator-border bg-background-secondary-default px-5 py-2.5 text-caption-2-semibold uppercase tracking-[0.08em] text-text-tertiary">
                <span>#</span><span>时间</span><span>类型</span><span>节点</span><span>消息</span>
              </div>
              {events.map((event) => (
                <div key={event.seq} className="grid grid-cols-[48px_76px_160px_96px_minmax(260px,1fr)] gap-3 border-b border-separator-border px-5 py-2.5 text-caption-1-regular last:border-0">
                  <span className="font-mono text-text-tertiary">{event.seq}</span>
                  <span className="font-mono text-text-tertiary">{formatTime(event.ts)}</span>
                  <span><code className="rounded-sm bg-background-tertiary-default px-1 py-0.5 font-mono text-caption-2-medium text-accent-700">{event.type}</code></span>
                  <span className="font-mono text-text-tertiary">{event.nodeId ?? '—'}</span>
                  <span className="text-text-secondary">{event.message}</span>
                </div>
              ))}
            </div>
          </div>
        </Surface>
      </TabPanel>
      </Tabs>

      <Modal
        open={Boolean(selectedNode)}
        onClose={() => setSelectedNodeId(null)}
        title={selectedNode?.title ?? ''}
        subtitle={
          selectedNode
            ? `${selectedNode.kind} · 第 ${selectedNode.iteration + 1} 轮 · ${selectedNode.tokens} tokens${selectedNode.status === 'running' ? ' · 实时更新中' : ''}`
            : ''
        }
        wide
      >
        {selectedNode && <NodeOutputView node={selectedNode} />}
      </Modal>
    </div>
  )
}

function NodeOutputView({ node }: { node: NodeRun }) {
  const output = node.output
  const candidates = output?.candidates ?? []
  if (candidates.length > 0) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex gap-2 rounded-2xl bg-background-secondary-default p-3 text-caption-1-regular leading-relaxed text-text-secondary">
          <RiSparklingLine className="mt-0.5 size-4 shrink-0 text-accent-600" />
          <p>{output?.judge ?? '裁判按证据覆盖与可执行性选择了主判断。'}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {candidates.map((candidate) => (
            <div key={candidate.id} className={cx('relative rounded-2xl border p-4', output?.chosenId === candidate.id ? 'border-accent-300 bg-accent-50' : 'border-separator-border')}>
              <div className="flex items-center justify-between gap-2">
                <strong className="text-body-2-medium text-text-primary">{candidate.name}</strong>
                <Badge color="neutral">{Math.round((candidate.score ?? 0) * 100)}</Badge>
              </div>
              <p className="mt-2 text-caption-1-regular leading-relaxed text-text-secondary">{candidate.stance}</p>
              <ul className="mt-2 flex list-disc flex-col gap-1 ps-4 text-caption-2-regular leading-relaxed text-text-tertiary">
                {candidate.points.map((point, index) => <li key={index}>{point}</li>)}
              </ul>
              {output?.chosenId === candidate.id && <div className="mt-3 text-caption-2-semibold text-accent-700">裁判选择</div>}
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (output?.verdict) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <ScoreRing score={output.verdict.score} size={84} />
          <div>
            <div className="text-title-3-semibold text-text-primary">{output.verdict.passed ? '核查通过' : '核查未通过'}</div>
            <p className="mt-0.5 text-caption-1-regular text-text-tertiary">{output.verdict.issues.length} 条问题</p>
          </div>
        </div>
        {(output.verdict.routes?.length ?? 0) > 0 && (
          <div className="flex flex-col gap-1.5 rounded-2xl border border-accent-200 bg-accent-50 p-3">
            <div className="text-caption-2-semibold uppercase tracking-[0.1em] text-accent-700">问题路由</div>
            {output.verdict.routes!.map((route, index) => (
              <div key={index} className="flex flex-wrap items-baseline gap-1.5 text-caption-1-regular">
                <span className="font-mono text-caption-2-semibold text-accent-700">{route.type}</span>
                <span className="text-text-tertiary">→</span>
                <strong className="font-medium text-accent-700">{targetLabel(route.target)}</strong>
                <span className="text-text-tertiary">{route.message}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-2">
          {output.verdict.claims?.map((claim, index) => (
            <div key={index} className={cx('flex gap-2.5 rounded-2xl border p-3', claim.supported ? 'border-separator-border' : 'border-status-rose-text/20 bg-status-rose-background/40')}>
              <span className={cx('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full', claim.supported ? 'bg-status-lime-background text-status-lime-text' : 'bg-status-rose-background text-status-rose-text')}>
                {claim.supported ? <RiCheckLine className="size-3.5" /> : <RiCloseLine className="size-3.5" />}
              </span>
              <div><p className="text-body-2-regular leading-relaxed text-text-primary">{claim.claim}</p><p className="mt-1 text-caption-1-regular text-text-tertiary">{claim.reason}</p></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (output?.markdown || output?.text) {
    return <MarkdownView content={output.markdown ?? output.text ?? ''} citations={output.citations} />
  }

  return (
    <pre className="max-h-[56vh] overflow-auto rounded-2xl bg-surface-sidebar p-4 font-mono text-caption-1-regular leading-relaxed text-text-on-sidebar">
      {JSON.stringify(output?.data ?? output ?? {}, null, 2)}
    </pre>
  )
}
