import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  RiArrowLeftLine,
  RiArrowRightLine,
  RiCheckLine,
  RiCloseLine,
  RiDownloadLine,
  RiErrorWarningLine,
  RiFileCopyLine,
  RiFileTextLine,
  RiGitBranchLine,
  RiPauseLine,
  RiPlayLine,
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
import type { Citation, NodeRun, RunEvent, ToolCall } from '../../shared/types'
import { Button, ButtonLink } from '@/components/base/buttons/button'
import { Chip } from '@/components/base/badges/chip'
import { ProgressBar } from '@/components/base/progress/progress'
import { Spinner } from '@/components/base/spinner/spinner'
import { Tab, TabList, TabPanel, Tabs } from '@/components/base/tabs/tabs'
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from '@/components/base/table/table'
import { cx } from '@/utils/cx'
import { MarkdownView, Modal, ScoreRing, SectionHead, StatusPill, Surface } from '../components/ui'
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
  const [paused, setPaused] = useState(false)
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
          event.type === 'node.merge' ||
          event.type === 'tool.call' ||
          event.type === 'tool.result'
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
  const runGraph = detail?.run.graph ?? data?.workflow.graph
  const statuses = useMemo(() => {
    const map = new Map<string, NodeStatusInfo>()
    if (!runGraph) return map
    for (const node of runGraph.nodes) {
      const nodeRun = latest.get(node.id)
      map.set(node.id, {
        status: nodeRun?.status ?? 'pending',
        score: nodeRun?.score,
        iteration: nodeRun?.iteration,
      })
    }
    return map
  }, [runGraph, latest])

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
      <div className="flex min-h-[60dvh] items-center justify-center gap-3">
        <div className="glass flex items-center gap-2.5 rounded-full px-4 py-2">
          <Spinner size="sm" aria-label="正在装载运行轨迹" />
          <span className="t-meta">正在装载运行轨迹</span>
        </div>
      </div>
    )
  }

  const running = runningNow
  const workflowGraph = detail.run.graph ?? data.workflow.graph
  const workflowNodes = workflowGraph.nodes
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

  const togglePause = async () => {
    if (!id) return
    if (paused) {
      await api.resumeRun(id)
      setPaused(false)
    } else {
      await api.pauseRun(id)
      setPaused(true)
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
      <div className="mb-4 flex items-center justify-between gap-3">
        <Button variant="ghost" size="small" leadingIcon={RiArrowLeftLine} onClick={() => navigate('/')}>
          返回总览
        </Button>
        <span className="t-meta inline-flex items-center gap-1.5">
          <RiTimerLine className="size-3.5" aria-hidden />
          {formatTime(detail.run.startedAt)} · {detail.run.mode === 'live' ? 'Live 模型' : 'Mock 演示'}
        </span>
      </div>

      {/* Header -------------------------------------------------------------- */}
      <section className="glass flex flex-col gap-2 rounded-[18px] px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex min-w-0 items-center gap-2">
            <Chip variant="caption" color="neutral">{detail.run.id}</Chip>
            <StatusPill status={detail.run.status} />
            <span className="truncate text-[14px] font-medium tracking-[-0.012em] text-text-primary">
              {data.workflow.name}
            </span>
          </div>

          <div className="ms-auto flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="flex items-baseline gap-1.5">
              <span className="t-meta">核查分</span>
              <span className="text-[13px] font-medium tabular-nums text-text-primary">
                {detail.run.score !== undefined ? `${Math.round(detail.run.score * 100)}%` : '—'}
              </span>
            </span>
            <span className="flex items-baseline gap-1.5">
              <span className="t-meta">耗时</span>
              <span className="text-[13px] font-medium tabular-nums text-text-primary">{elapsed}</span>
            </span>
            <span className="flex items-baseline gap-1.5">
              <span className="t-meta">Tokens</span>
              <span className="text-[13px] font-medium tabular-nums text-text-primary">{detail.run.tokens.toLocaleString()}</span>
            </span>
            <span className="flex items-center gap-1.5">
              {running ? (
                <>
                  <Button variant="secondary" size="small" leadingIcon={paused ? RiPlayLine : RiPauseLine} onClick={() => void togglePause()}>
                    {paused ? '继续' : '暂停'}
                  </Button>
                  <Button variant="secondary" size="small" leadingIcon={RiPauseLine} onClick={() => void cancel()} disabled={cancelling}>
                    {cancelling ? '取消中…' : '取消'}
                  </Button>
                </>
              ) : (
                <Button variant="secondary" size="small" leadingIcon={RiRefreshLine} onClick={() => navigate('/workflow')}>
                  再运行
                </Button>
              )}
              <ButtonLink
                href={api.reportUrl(detail.run.id)}
                download
                variant="ghost"
                size="small"
                leadingIcon={RiDownloadLine}
              >
                导出
              </ButtonLink>
            </span>
          </div>
        </div>
        <p className="line-clamp-1 text-[12px] text-text-tertiary">“{detail.run.input}”</p>
      </section>

      {detail.run.error && (
        <div className="mt-4 flex items-center gap-2 rounded-3xl bg-status-rose-background px-4 py-3 text-[13px] text-status-rose-text">
          <RiErrorWarningLine className="size-4 shrink-0" aria-hidden />
          {detail.run.error}
        </div>
      )}

      {running && (
        <section className="glass panel mt-4 p-5" aria-live="polite">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-text-secondary">
            <span className={cx('inline-flex items-center gap-1.5 text-[11px]', liveState === 'reconnecting' ? 'text-status-orange-text' : 'text-accent-600')}>
              {liveState === 'reconnecting' ? <RiSignalWifiOffLine className="size-3.5" /> : <span className="size-1.5 rounded-full bg-current" />}
              {liveState === 'reconnecting' ? '重连中' : liveState === 'connecting' ? '连接中' : 'LIVE'}
            </span>
            <span>
              {activeRuns.length > 0
                ? `${activeRuns.map((nodeRun) => nodeRun!.title).join('、')} 执行中`
                : '调度器正在选择下一批节点'}
            </span>
            <span className="t-meta">已完成 {completedCount} / {workflowNodes.length}</span>
            <span className="ms-auto t-num text-[12px] text-text-primary">{progress}%</span>
          </div>
          <ProgressBar aria-label="运行进度" value={progress} size="sm" className="mt-2.5" />
        </section>
      )}

      {loadError && (
        <div className="mt-4 flex items-center gap-2 rounded-3xl bg-background-secondary-default px-4 py-2.5 text-[12px] text-text-secondary">
          <RiSignalWifiOffLine className="size-3.5" aria-hidden /> {loadError}
        </div>
      )}

      <Tabs selectedKey={tab} onSelectionChange={(key) => selectTab(key as RunTab)} className="mt-5 gap-0">
        <div className="flex flex-wrap items-center gap-3">
          <div className="hide-scrollbar max-w-full overflow-x-auto">
            <TabList aria-label="运行详情视图" variant="underline">
              {TABS.map((item) => (
                <Tab key={item.key} id={item.key} icon={item.icon} count={tabCount[item.key]}>
                  {item.label}
                </Tab>
              ))}
            </TabList>
          </div>
          <div className="ms-auto hidden items-center gap-2 sm:flex">
            {running && (
              <span className={cx('inline-flex items-center gap-1.5 text-[11px]', liveState === 'reconnecting' ? 'text-status-orange-text' : 'text-status-lime-text')}>
                <span className="size-1.5 rounded-full bg-current" />
                {liveState === 'reconnecting' ? '重连中' : 'Live'}
              </span>
            )}
            <Chip variant="caption" color="neutral">{detail.run.mode === 'mock' ? 'Mock' : 'Live'}</Chip>
          </div>
        </div>

        <TabPanel id="graph">
          <div className="mt-4 flex flex-col gap-4">
            <Surface className="overflow-hidden p-0">
              <WorkflowGraph
                graph={workflowGraph}
                agents={data.agents}
                plugins={data.plugins}
                statuses={statuses}
                readOnly
                height={430}
                onNodeClick={(nodeId) => {
                  if (latest.has(nodeId)) setSelectedNodeId(nodeId)
                }}
              />
            </Surface>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
              <Surface className="panel p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <SectionHead title="节点轨迹" />
                  <span className="t-meta">
                    {running ? `${completedCount}/${workflowNodes.length} 完成` : '点击节点查看输出与证据'}
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
                          'row -mx-2 grid w-[calc(100%+16px)] grid-cols-[8px_minmax(0,1fr)_auto] items-center gap-2.5 px-2 py-2.5 text-left outline-none',
                          'focus-visible:ring-2 focus-visible:ring-border-focus-ring',
                          'sm:grid-cols-[8px_minmax(0,1fr)_auto_48px_54px_64px]',
                        )}
                      >
                        <span className={cx('size-1.5 rounded-full', status === 'running' ? 'animate-pulse bg-accent-500' : status === 'completed' ? 'bg-status-lime-text' : status === 'failed' ? 'bg-status-rose-text' : 'bg-text-placeholder')} />
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] text-text-primary">{node.data.label}</span>
                          <span className="block truncate text-[11px] text-text-tertiary">{node.data.subtitle}</span>
                        </span>
                        <span className="text-[10px] text-accent-600">{nodeRun && nodeRun.iteration > 0 ? `L${nodeRun.iteration + 1}` : ''}</span>
                        <span className="hidden text-[12px] tabular-nums text-status-lime-text sm:block">{nodeRun?.score !== undefined ? `${Math.round(nodeRun.score * 100)}%` : ''}</span>
                        <span className="hidden text-[11px] tabular-nums text-text-tertiary sm:block">{nodeRun ? `${nodeRun.tokens}` : ''}</span>
                        <span className="hidden sm:block"><StatusPill status={status} /></span>
                      </button>
                    )
                  })}
                </div>
              </Surface>

              <Surface className="panel flex min-h-[300px] flex-col p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <SectionHead title="调度事件" />
                  <span className={cx('inline-flex items-center gap-1.5 text-[11px]', running ? 'text-accent-600' : 'text-text-tertiary')}>
                    <span className={cx('size-1.5 rounded-full bg-current', running && 'animate-pulse')} />
                    {running ? (liveState === 'reconnecting' ? '重连中' : 'LIVE') : '已归档'}
                  </span>
                </div>
                <div
                  ref={feedRef}
                  className="mt-3 max-h-[400px] flex-1 overflow-y-auto pe-1"
                  onScroll={(event) => {
                    const target = event.currentTarget
                    stickToBottom.current = target.scrollHeight - target.scrollTop - target.clientHeight < 36
                  }}
                >
                  {events.map((event) => (
                    <div key={event.seq} className="feed-row grid grid-cols-[52px_6px_minmax(0,1fr)] items-start gap-2 border-b border-border-button-default py-1.5 last:border-0">
                      <span className="text-[10px] tabular-nums text-text-placeholder">{formatTime(event.ts)}</span>
                      <span className={cx('mt-1.5 size-1 rounded-full', event.type.includes('failed') || event.type.includes('loop') ? 'bg-accent-500' : 'bg-text-placeholder')} />
                      <span className={cx('text-[11px] leading-relaxed', event.type.includes('failed') ? 'text-status-rose-text' : 'text-text-secondary')}>
                        {event.message ?? event.type}
                      </span>
                    </div>
                  ))}
                  {events.length === 0 && <div className="py-5 text-[11px] text-text-tertiary">等待第一条调度事件…</div>}
                </div>
              </Surface>
            </div>
          </div>
        </TabPanel>

        <TabPanel id="report">
          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_308px]">
            <Surface className="overflow-hidden p-0">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-button-default px-6 py-4">
                <div>
                  <div className="t-label">交付物</div>
                  <div className="mt-1 text-[15px] font-medium tracking-[-0.01em] text-text-primary">
                    {data.project.name} · 投资研究报告
                  </div>
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
                <div className="mx-auto max-w-3xl px-6 py-7 sm:px-10">
                  <MarkdownView content={markdown} citations={citations} />
                </div>
              ) : (
                <div className="flex min-h-64 flex-col items-center justify-center gap-3">
                  <Spinner size="sm" aria-label="报告生成中" />
                  <span className="t-meta">{running ? '报告正在生成…' : '还没有生成报告。'}</span>
                </div>
              )}
            </Surface>

            <Surface className="panel h-fit p-5 xl:sticky xl:top-20">
              <div className="flex items-baseline justify-between gap-3">
                <SectionHead title="引用证据" />
                <Chip variant="caption" color="neutral">{citations.length}</Chip>
              </div>
              <div className="mt-3 flex flex-col gap-1.5">
                {citations.map((citation) => (
                  <div key={citation.id} className="rounded-[14px] bg-background-secondary-default p-3">
                    <div className="flex items-start gap-2">
                      <span className="shrink-0 font-mono text-[10px] font-medium text-accent-600">[{citation.id}]</span>
                      <span className="text-[12px] font-medium leading-relaxed text-text-primary">{citation.docTitle}</span>
                    </div>
                    <p className="mt-1.5 line-clamp-3 text-[11px] leading-relaxed text-text-tertiary">{citation.quote}</p>
                  </div>
                ))}
                {citations.length === 0 && <p className="t-meta">报告完成后，这里会列出全部证据。</p>}
              </div>
            </Surface>
          </div>
        </TabPanel>

        <TabPanel id="ledger">
          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_356px]">
            <Surface className="overflow-hidden p-0">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border-button-default px-6 py-5">
                <div>
                  <SectionHead title="证据账本" />
                  <p className="t-small mt-1">每一条主张都能回到证据、核查结论与路由目标。</p>
                </div>
                <div className="flex gap-5 text-end">
                  <div><div className="text-[18px] font-semibold tabular-nums text-text-primary">{ledgerClaims.length}</div><div className="t-meta">条主张</div></div>
                  <div><div className="text-[18px] font-semibold tabular-nums text-status-lime-text">{supportedClaims}</div><div className="t-meta">被支持</div></div>
                  <div><div className="text-[18px] font-semibold tabular-nums text-status-rose-text">{ledgerClaims.length - supportedClaims}</div><div className="t-meta">待修正</div></div>
                </div>
              </div>
              <div className="p-2">
                {ledgerClaims.map((claim, index) => {
                  const citation = claim.citation ? citations.find((item) => item.id === claim.citation) : undefined
                  return (
                    <button
                      key={index}
                      onClick={() => setSelectedClaim(index)}
                      className={cx(
                        'row -mx-0 grid w-full grid-cols-[24px_minmax(0,1fr)_auto] items-start gap-3 px-3 py-3 text-left outline-none',
                        'focus-visible:ring-2 focus-visible:ring-border-focus-ring',
                        index === selectedClaim && 'bg-background-secondary-hover',
                      )}
                    >
                      <span className="text-[10px] tabular-nums text-text-placeholder">{String(index + 1).padStart(2, '0')}</span>
                      <span className="min-w-0">
                        <span className="line-clamp-2 text-[13px] leading-relaxed text-text-primary">{claim.claim}</span>
                        <span className="mt-1.5 flex flex-wrap items-center gap-2">
                          <Chip
                            variant="caption"
                            color={
                              claim.label === 'supported'
                                ? 'lime'
                                : claim.label === 'partial'
                                  ? 'yellow'
                                  : claim.label === 'contradicted'
                                    ? 'rose'
                                    : 'neutral'
                            }
                          >
                            {claim.label === 'supported'
                              ? '支持'
                              : claim.label === 'partial'
                                ? '部分支持'
                                : claim.label === 'contradicted'
                                  ? '矛盾'
                                  : '无依据'}
                          </Chip>
                          {claim.confidence !== undefined && (
                            <span className="font-mono text-[9px] text-text-placeholder">
                              {Math.round(claim.confidence * 100)}%
                            </span>
                          )}
                          {citation && <span className="font-mono text-[10px] text-accent-600">[{citation.id}]</span>}
                        </span>
                      </span>
                      <RiArrowRightLine className={cx('mt-1 size-3.5 text-text-placeholder transition-opacity', index === selectedClaim ? 'opacity-100' : 'opacity-0')} aria-hidden />
                    </button>
                  )
                })}
                {ledgerClaims.length === 0 && (
                  <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
                    <RiVerifiedBadgeLine className="size-5 text-accent-500" />
                    <span className="t-small">报告生成后，这里会出现逐条主张与证据。</span>
                  </div>
                )}
              </div>
            </Surface>

            <Surface className="panel h-fit p-5 xl:sticky xl:top-20">
              <ScoreRing score={verdict?.score ?? detail.run.score ?? 0} size={104} />
              <h3 className="mt-4 text-[15px] font-semibold text-text-primary">{verdict?.passed ? '账本已对齐' : '账本存在缺口'}</h3>
              <p className="t-small mt-1">
                核查器逐条比对主张与证据；不通过的意见会按类型路由回上游节点。
              </p>
              {activeClaim && (
                <>
                  <div className="mt-4 border-t border-border-button-default pt-4">
                    <div className="t-label">主张</div>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-text-primary">{activeClaim.claim}</p>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-text-tertiary">{activeClaim.reason}</p>
                  </div>
                  <div className="mt-4 border-t border-border-button-default pt-4">
                    <div className="t-label">证据</div>
                    {activeCitation ? (
                      <div className="mt-2 rounded-[14px] bg-accent-50 p-3">
                        <div className="text-[12px] font-medium text-text-primary">{activeCitation.docTitle}</div>
                        <p className="mt-1 text-[11px] leading-relaxed text-text-secondary">{activeCitation.quote}</p>
                      </div>
                    ) : (
                      <p className="mt-2 text-[11px] text-text-tertiary">没有找到对应证据。</p>
                    )}
                  </div>
                  {(verdict?.routes?.length ?? 0) > 0 && (
                    <div className="mt-4 border-t border-border-button-default pt-4">
                      <div className="t-label">问题路由</div>
                      <div className="mt-2 flex flex-col gap-1.5">
                        {verdict!.routes!.map((route, index) => (
                          <div key={index} className="flex items-center gap-2 rounded-[10px] bg-background-secondary-default px-2.5 py-1.5 text-[11px]">
                            <span className="font-mono text-[10px] text-accent-600">{route.type}</span>
                            <RiArrowRightLine className="size-3 text-accent-500" aria-hidden />
                            <span className="text-text-secondary">{targetLabel(route.target)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </Surface>
          </div>
        </TabPanel>

        <TabPanel id="verify">
          <div className="mt-4 flex flex-col gap-4">
            <Surface className="panel flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <SectionHead title={verdict?.passed ? '核查通过' : verdict ? '需要复核' : '等待核查'} />
                <p className="t-small mt-1.5 max-w-2xl">
                  {verdict
                    ? `事实核查员逐条核对了 ${verdict.claims?.length ?? 0} 条结论。核查不通过时，运行时会按问题类型回到对应的上游节点，而不是一律重写。`
                    : '报告生成后，核查员会抽取结论、核对引用与数字，再决定是否回环。'}
                </p>
              </div>
              <ScoreRing score={verdict?.score ?? detail.run.score ?? 0} size={112} className="sm:w-[168px]" />
            </Surface>

            <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <Surface className="panel p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <SectionHead title="逐条核查" />
                  <Chip variant="caption" color={verdict?.passed ? 'lime' : 'orange'}>
                    {verdict?.passed ? 'Pass' : 'Review'}
                  </Chip>
                </div>

                {(verdict?.routes?.length ?? 0) > 0 && (
                  <div className="mt-3 flex flex-col gap-1.5 rounded-[14px] bg-accent-50 p-3">
                    <div className="t-label">本轮问题路由</div>
                    {verdict!.routes!.map((route, index) => (
                      <div key={index} className="flex flex-wrap items-baseline gap-1.5 text-[11px]">
                        <span className="font-mono text-[10px] text-accent-700">{route.type}</span>
                        <span className="text-text-tertiary">→</span>
                        <strong className="font-medium text-accent-700">{targetLabel(route.target)}</strong>
                        <span className="text-text-tertiary">{route.message}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex flex-col gap-1.5">
                  {(verdict?.claims ?? []).map((claim, index) => (
                    <div key={index} className={cx('flex gap-2.5 rounded-[14px] p-3', claim.supported ? 'bg-background-secondary-default' : 'bg-status-rose-background/60')}>
                      <span className={cx('mt-0.5 grid size-4.5 shrink-0 place-items-center rounded-full', claim.supported ? 'bg-status-lime-background text-status-lime-text' : 'bg-status-rose-background text-status-rose-text')}>
                        {claim.supported ? <RiCheckLine className="size-3" /> : <RiCloseLine className="size-3" />}
                      </span>
                      <div>
                        <p className="text-[12px] leading-relaxed text-text-primary">{claim.claim}</p>
                        <p className="mt-1 text-[11px] text-text-tertiary">{claim.reason}{claim.citation ? ` · [${claim.citation}]` : ''}</p>
                      </div>
                    </div>
                  ))}
                  {!verdict && <p className="py-4 text-[11px] text-text-tertiary">暂无可核查的结论。</p>}
                </div>
              </Surface>

              <Surface className="panel p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <SectionHead title="回环历史" />
                  <Chip variant="caption" color="neutral">{verifierRuns.length} 轮</Chip>
                </div>
                <div className="mt-3 flex flex-col gap-1.5">
                  {verifierRuns.map((run, index) => (
                    <div key={run.id} className="flex items-center gap-2.5 rounded-[14px] bg-background-secondary-default p-3">
                      <span className="rounded-md bg-accent-100 px-1.5 py-0.5 font-mono text-[10px] text-accent-700">L{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-medium text-text-primary">{run.output?.verdict?.passed ? '通过' : '未通过'}</div>
                        <div className="mt-0.5 text-[11px] text-text-tertiary">
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
                  {verifierRuns.length === 0 && <p className="text-[11px] text-text-tertiary">尚未执行核查。</p>}
                </div>
                {verifierRuns.length > 1 && (
                  <div className="mt-3 flex gap-2 rounded-[14px] bg-background-secondary-default p-3 text-[11px] leading-relaxed text-text-tertiary">
                    <RiGitBranchLine className="mt-0.5 size-3.5 shrink-0 text-accent-500" />
                    <span>第 1 轮未通过后，系统优先处理 citation，把问题路由到竞争情报员；上游重跑后，第 2 轮核查通过。</span>
                  </div>
                )}
              </Surface>
            </div>
          </div>
        </TabPanel>

        <TabPanel id="events">
          <Surface className="panel mt-4 p-0">
            <div className="flex flex-wrap items-baseline justify-between gap-3 px-6 py-4">
              <SectionHead title="完整事件流" />
              <span className="t-meta">{events.length} 条 · 可回放</span>
            </div>
            <Table aria-label="完整事件流" size="sm">
              <TableHeader>
                <TableColumn>#</TableColumn>
                <TableColumn>时间</TableColumn>
                <TableColumn>类型</TableColumn>
                <TableColumn>节点</TableColumn>
                <TableColumn>消息</TableColumn>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.seq}>
                    <TableCell><span className="text-[11px] tabular-nums text-text-tertiary">{event.seq}</span></TableCell>
                    <TableCell><span className="text-[11px] tabular-nums text-text-tertiary">{formatTime(event.ts)}</span></TableCell>
                    <TableCell><code className="font-mono text-[10px] text-accent-700">{event.type}</code></TableCell>
                    <TableCell><span className="font-mono text-[10px] text-text-tertiary">{event.nodeId ?? '—'}</span></TableCell>
                    <TableCell><span className="text-[11px] text-text-secondary">{event.message}</span></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
  const calls = node.output?.toolCalls ?? []
  const reports = node.output?.pluginReports ?? []
  return (
    <div className="flex flex-col gap-4">
      {calls.length > 0 && <ToolTrace calls={calls} />}
      {reports.length > 0 && <PluginReports reports={reports} />}
      {renderNodeBody(node.output)}
    </div>
  )
}

function PluginReports({ reports }: { reports: NonNullable<NodeRun['output']>['pluginReports'] }) {
  return (
    <div className="flex flex-col gap-2 rounded-[14px] border border-separator-border bg-background-secondary-default p-3">
      <div className="flex items-center justify-between">
        <span className="t-label">插件产出</span>
        <span className="font-mono text-[10px] text-text-tertiary">{reports?.length ?? 0}</span>
      </div>
      {reports?.map((report) => (
        <div key={report.id} className="rounded-[10px] bg-background-primary-default p-2.5">
          <div className="text-[11px] font-medium text-text-primary">{report.title}</div>
          <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-text-secondary">{report.text}</p>
        </div>
      ))}
    </div>
  )
}

function ToolTrace({ calls }: { calls: ToolCall[] }) {
  return (
    <div className="rounded-[14px] border border-accent-300 bg-accent-50 p-3">
      <div className="flex items-center justify-between">
        <span className="t-label">工具调用</span>
        <span className="font-mono text-[10px] text-accent-700">{calls.length}</span>
      </div>
      <div className="mt-2 flex flex-col gap-1.5">
        {calls.map((call) => (
          <div key={call.id} className="rounded-[10px] bg-background-primary-default p-2.5">
            <div className="font-mono text-[10.5px] text-accent-700">
              {call.name}({JSON.stringify(call.args)})
            </div>
            <div className={cx('mt-1 break-all font-mono text-[10.5px]', call.error ? 'text-status-rose-text' : 'text-text-secondary')}>
              {call.error ?? JSON.stringify(call.result)} · {call.ms}ms
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function renderNodeBody(output: NodeRun['output']) {
  const candidates = output?.candidates ?? []
  if (candidates.length > 0) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex gap-2 rounded-[14px] bg-background-secondary-default p-3 text-[12px] leading-relaxed text-text-secondary">
          <RiSparklingLine className="mt-0.5 size-4 shrink-0 text-accent-500" />
          <p>{output?.judge ?? '裁判按证据覆盖与可执行性选择了主判断。'}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {candidates.map((candidate) => (
            <div key={candidate.id} className={cx('relative rounded-[16px] border p-4', output?.chosenId === candidate.id ? 'border-accent-300 bg-accent-50' : 'border-border-button-default')}>
              <div className="flex items-center justify-between gap-2">
                <strong className="text-[13px] font-medium text-text-primary">{candidate.name}</strong>
                <Chip variant="caption" color="neutral">{Math.round((candidate.score ?? 0) * 100)}</Chip>
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-text-secondary">{candidate.stance}</p>
              <ul className="mt-2 flex list-disc flex-col gap-1 ps-4 text-[11px] leading-relaxed text-text-tertiary">
                {candidate.points.map((point, index) => <li key={index}>{point}</li>)}
              </ul>
              {output?.chosenId === candidate.id && <div className="mt-3 text-[10px] text-accent-700">裁判选择</div>}
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
            <div className="text-[14px] font-semibold text-text-primary">{output.verdict.passed ? '核查通过' : '核查未通过'}</div>
            <p className="t-meta mt-0.5">{output.verdict.issues.length} 条问题</p>
          </div>
        </div>
        {(output.verdict.routes?.length ?? 0) > 0 && (
          <div className="flex flex-col gap-1.5 rounded-[14px] bg-accent-50 p-3">
            <div className="t-label">问题路由</div>
            {output.verdict.routes!.map((route, index) => (
              <div key={index} className="flex flex-wrap items-baseline gap-1.5 text-[11px]">
                <span className="font-mono text-[10px] text-accent-700">{route.type}</span>
                <span className="text-text-tertiary">→</span>
                <strong className="font-medium text-accent-700">{targetLabel(route.target)}</strong>
                <span className="text-text-tertiary">{route.message}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          {output.verdict.claims?.map((claim, index) => (
            <div key={index} className={cx('flex gap-2.5 rounded-[14px] p-3', claim.supported ? 'bg-background-secondary-default' : 'bg-status-rose-background/60')}>
              <span className={cx('mt-0.5 grid size-4.5 shrink-0 place-items-center rounded-full', claim.supported ? 'bg-status-lime-background text-status-lime-text' : 'bg-status-rose-background text-status-rose-text')}>
                {claim.supported ? <RiCheckLine className="size-3" /> : <RiCloseLine className="size-3" />}
              </span>
              <div><p className="text-[12px] leading-relaxed text-text-primary">{claim.claim}</p><p className="mt-1 text-[11px] text-text-tertiary">{claim.reason}</p></div>
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
    <pre className="max-h-[56vh] overflow-auto rounded-[16px] bg-text-primary p-4 font-mono text-[11px] leading-relaxed text-text-white">
      {JSON.stringify(output?.data ?? output ?? {}, null, 2)}
    </pre>
  )
}
