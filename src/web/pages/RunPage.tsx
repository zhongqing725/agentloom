import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Check,
  ChevronRight,
  Copy,
  Download,
  FileText,
  GitBranch,
  Loader2,
  Pause,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Terminal,
  WifiOff,
  X,
} from 'lucide-react'
import { useApp } from '../App'
import { api } from '../api'
import type { Citation, NodeRun, RunEvent } from '../../shared/types'
import { MarkdownView, Modal, Pill, ScoreRing, StatusPill } from '../components/ui'
import { WorkflowGraph, type NodeStatusInfo } from '../components/Graph'

type Tab = 'graph' | 'report' | 'ledger' | 'verify' | 'events'

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
  const stickToBottom = useRef(true)

  const requestedTab = searchParams.get('tab')
  const tab: Tab =
    requestedTab === 'report' || requestedTab === 'ledger' || requestedTab === 'verify' || requestedTab === 'events'
      ? requestedTab
      : 'graph'
  const focusNode = searchParams.get('node')
  const runningNow = detail?.run.status === 'running' || detail?.run.status === 'queued'

  const load = useCallback(async () => {
    if (!id) return
    const seq = ++loadSeq.current
    try {
      const next = await api.getRun(id)
      if (seq !== loadSeq.current) return
      setDetail(next)
      setLoadError('')
      setEvents((current) => {
        const map = new Map(current.map((event) => [event.seq, event]))
        for (const event of next.events) map.set(event.seq, event)
        return [...map.values()].sort((a, b) => a.seq - b.seq)
      })
      if (next.run.status === 'completed' || next.run.status === 'failed' || next.run.status === 'cancelled') {
        setLiveState('closed')
      }
    } catch (cause) {
      if (seq === loadSeq.current) {
        setLoadError(cause instanceof Error ? cause.message : '无法刷新运行状态')
      }
    }
  }, [id])

  useEffect(() => {
    detailRef.current = detail
  }, [detail])

  useEffect(() => {
    if (focusNode) setSelectedNodeId(focusNode)
  }, [focusNode])

  useEffect(() => {
    if (!id) return
    let alive = true
    let refreshTimer: number | undefined
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
      try {
        const event = JSON.parse(message.data) as RunEvent
        setEvents((current) => {
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
      source.close()
      window.clearInterval(poll)
      if (refreshTimer) window.clearTimeout(refreshTimer)
    }
  }, [id, load])

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

  const selectTab = (next: Tab) => {
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

  if (!data || !detail) {
    return (
      <div className="page run-loading">
        <Loader2 className="spin" size={22} />
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
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  const cancel = async () => {
    if (!id || cancelling) return
    setCancelling(true)
    try {
      await api.cancelRun(id)
      await load()
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div className="page run-page">
      <div className="run-head">
        <div className="run-head-left">
          <button className="back-btn" onClick={() => navigate('/')}>
            <ArrowLeft size={15} /> 返回总览
          </button>
          <div className="run-title-row">
            <div>
              <div className="eyebrow">RUN · {detail.run.id}</div>
              <h1>{data.workflow.name}</h1>
            </div>
            <StatusPill status={detail.run.status} />
          </div>
          <p className="run-sub">
            {detail.run.mode === 'live' ? 'Live 模型' : 'Mock 演示'} · 启动于 {formatTime(detail.run.startedAt)}
          </p>
          <p className="run-request">“{detail.run.input}”</p>
        </div>
        <div className="run-head-right">
          <div className="run-metrics">
            <div className="run-metric">
              <span>核查分</span>
              <strong>{detail.run.score !== undefined ? Math.round(detail.run.score * 100) : '—'}<em>{detail.run.score !== undefined ? '%' : ''}</em></strong>
            </div>
            <div className="run-metric">
              <span>耗时</span>
              <strong>{elapsed}</strong>
            </div>
            <div className="run-metric">
              <span>Tokens</span>
              <strong>{detail.run.tokens.toLocaleString()}</strong>
            </div>
          </div>
          <div className="run-actions">
            {running ? (
              <button className="btn btn-ghost" onClick={cancel} disabled={cancelling}>
                <Pause size={14} /> {cancelling ? '取消中…' : '取消'}
              </button>
            ) : (
              <button className="btn btn-ghost" onClick={() => navigate('/workflow')}><RotateCcw size={14} /> 再运行</button>
            )}
            <a className="btn btn-dark" href={api.reportUrl(detail.run.id)} download>
              <Download size={14} /> 导出报告
            </a>
          </div>
        </div>
      </div>

      {detail.run.error && (
        <div className="run-alert">
          <AlertTriangle size={16} />
          <span>{detail.run.error}</span>
        </div>
      )}

      {running && (
        <div className="run-live-strip" aria-live="polite">
          <div className="run-live-copy">
            <span className={`live-state ${liveState}`}>
              <i />
              {liveState === 'reconnecting' ? 'RECONNECTING' : liveState === 'connecting' ? 'CONNECTING' : 'LIVE'}
            </span>
            <span>
              {activeRuns.length > 0
                ? `${activeRuns.map((nodeRun) => nodeRun!.title).join('、')} 执行中`
                : '调度器正在选择下一批节点'}
            </span>
            <span className="run-live-count">已完成 {completedCount} / {workflowNodes.length}</span>
            <strong>{progress}%</strong>
          </div>
          <div className="run-progress"><span style={{ width: `${progress}%` }} /></div>
        </div>
      )}

      <div className="run-tabs" role="tablist" aria-label="运行视图">
        <button role="tab" aria-selected={tab === 'graph'} className={tab === 'graph' ? 'active' : ''} onClick={() => selectTab('graph')}>
          <GitBranch size={14} /> 执行图谱 <span>{detail.nodes.length}</span>
        </button>
        <button role="tab" aria-selected={tab === 'report'} className={tab === 'report' ? 'active' : ''} onClick={() => selectTab('report')}>
          <FileText size={14} /> 研究报告
        </button>
        <button role="tab" aria-selected={tab === 'ledger'} className={tab === 'ledger' ? 'active' : ''} onClick={() => selectTab('ledger')}>
          <BadgeCheck size={14} /> 证据账本
          {verdict?.claims?.length ? <span>{verdict.claims.length}</span> : null}
        </button>
        <button role="tab" aria-selected={tab === 'verify'} className={tab === 'verify' ? 'active' : ''} onClick={() => selectTab('verify')}>
          <ShieldCheck size={14} /> 核查与回环
          {verifierRuns.length > 1 && <span className="tab-badge">{verifierRuns.length}</span>}
        </button>
        <button role="tab" aria-selected={tab === 'events'} className={tab === 'events' ? 'active' : ''} onClick={() => selectTab('events')}>
          <Terminal size={14} /> 事件流 <span>{events.length}</span>
        </button>
        <div className="run-tabs-right">
          {running && (
            <span className={`live-indicator ${liveState}`}>
              {liveState === 'reconnecting' ? <WifiOff size={11} /> : <i />}
              {liveState === 'reconnecting' ? '重连中' : 'LIVE'}
            </span>
          )}
          {detail.run.mode === 'mock' && <Pill tone="amber">MOCK</Pill>}
        </div>
      </div>

      {tab === 'graph' && (
        <div className="run-graph-layout">
          <div className="run-graph-main">
            <div className="panel run-canvas-panel">
              <WorkflowGraph
                graph={data.workflow.graph}
                agents={data.agents}
                plugins={data.plugins}
                statuses={statuses}
                readOnly
                height={460}
                onNodeClick={(nodeId) => {
                  if (latest.has(nodeId)) setSelectedNodeId(nodeId)
                }}
              />
            </div>
            <div className="panel node-timeline">
              <div className="panel-head compact">
                <div>
                  <div className="eyebrow">EXECUTION TRACE</div>
                  <h2>节点轨迹</h2>
                </div>
                <span className="hint">
                  {running ? `${completedCount}/${workflowNodes.length} 完成 · 点击节点看实时输出` : '点击节点查看输出与证据'}
                </span>
              </div>
              <div className="timeline-list">
                {workflowNodes.map((node) => {
                  const nodeRun = latest.get(node.id)
                  const status = nodeRun?.status ?? 'pending'
                  return (
                    <button
                      className={`timeline-row ${status}`}
                      key={node.id}
                      onClick={() => nodeRun && setSelectedNodeId(node.id)}
                    >
                      <span className={`timeline-dot ${status}`} />
                      <span className="timeline-name">
                        <strong>{node.data.label}</strong>
                        <small>{node.data.subtitle}</small>
                      </span>
                      <span className="timeline-iter">
                        {nodeRun && nodeRun.iteration > 0 ? `L${nodeRun.iteration + 1}` : ''}
                      </span>
                      <span className="timeline-score">
                        {nodeRun?.score !== undefined ? `${Math.round(nodeRun.score * 100)}%` : ''}
                      </span>
                      <span className="timeline-tokens">{nodeRun ? `${nodeRun.tokens} tok` : ''}</span>
                      <StatusPill status={status} />
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
          <aside className="panel event-feed-panel">
            <div className="panel-head compact">
              <div>
                <div className="eyebrow">LIVE FEED</div>
                <h2>调度事件</h2>
              </div>
              <span className={`feed-status ${running ? liveState : 'closed'}`}>
                <i /> {running ? (liveState === 'reconnecting' ? '重连中' : 'LIVE') : '已归档'}
              </span>
            </div>
            {loadError && <div className="feed-warning"><WifiOff size={12} /> {loadError}</div>}
            <div
              className="event-feed"
              ref={feedRef}
              onScroll={(event) => {
                const target = event.currentTarget
                stickToBottom.current = target.scrollHeight - target.scrollTop - target.clientHeight < 36
              }}
            >
              {events.map((event) => (
                <div className={`feed-item feed-${event.type.replace(/\./g, '-')}`} key={event.seq}>
                  <span className="feed-time">{formatTime(event.ts)}</span>
                  <span className="feed-dot" />
                  <span className="feed-text">{event.message ?? event.type}</span>
                </div>
              ))}
              {events.length === 0 && <div className="feed-empty">等待第一条调度事件…</div>}
              {running && <div className="feed-empty feed-live-tail">正在接收下一个调度事件…</div>}
            </div>
          </aside>
        </div>
      )}

      {tab === 'report' && (
        <div className="report-layout">
          <div className="panel report-panel">
            <div className="report-toolbar">
              <div>
                <div className="eyebrow">DELIVERABLE</div>
                <strong>{data.project.name} · 投资研究报告</strong>
              </div>
              <div className="report-toolbar-actions">
                <button className="btn btn-ghost sm" onClick={copyReport}>
                  {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? '已复制' : '复制 Markdown'}
                </button>
                <a className="btn btn-ghost sm" href={api.reportUrl(detail.run.id)} download>
                  <Download size={14} /> 下载
                </a>
              </div>
            </div>
            {markdown ? (
              <MarkdownView content={markdown} citations={citations} />
            ) : (
              <div className="report-pending">
                <Loader2 className="spin" size={20} />
                <span>{running ? '报告正在生成…' : '还没有生成报告。'}</span>
              </div>
            )}
          </div>
          <aside className="panel evidence-panel">
            <div className="panel-head compact">
              <div>
                <div className="eyebrow">EVIDENCE</div>
                <h2>引用证据</h2>
              </div>
              <Pill tone="teal">{citations.length}</Pill>
            </div>
            <div className="evidence-list">
              {citations.map((citation) => (
                <div className="evidence-item" key={citation.id}>
                  <div className="evidence-head">
                    <span className="evidence-ref">[{citation.id}]</span>
                    <strong>{citation.docTitle}</strong>
                  </div>
                  <p>{citation.quote.slice(0, 150)}…</p>
                </div>
              ))}
              {citations.length === 0 && <div className="hint">报告完成后，这里会列出全部证据。</div>}
            </div>
          </aside>
        </div>
      )}

      {tab === 'ledger' && (
        <div className="ledger-layout">
          <div className="panel ledger-panel">
            <div className="ledger-head">
              <div>
                <div className="eyebrow">CLAIM LEDGER</div>
                <h2>证据账本</h2>
                <p>每一条主张都能回到证据、核查结论与路由目标。</p>
              </div>
              <div className="ledger-summary">
                <div><strong>{ledgerClaims.length}</strong><span>条主张</span></div>
                <div><strong className="ok-text">{supportedClaims}</strong><span>被支持</span></div>
                <div><strong className="bad-text">{ledgerClaims.length - supportedClaims}</strong><span>待修正</span></div>
              </div>
            </div>
            <div className="ledger-list">
              {ledgerClaims.map((claim, index) => {
                const citation = claim.citation ? citations.find((item) => item.id === claim.citation) : undefined
                return (
                  <button
                    className={`ledger-item ${claim.supported ? 'ok' : 'bad'} ${index === selectedClaim ? 'selected' : ''}`}
                    key={index}
                    onClick={() => setSelectedClaim(index)}
                  >
                    <span className="ledger-index">{String(index + 1).padStart(2, '0')}</span>
                    <span className="ledger-item-main">
                      <p>{claim.claim}</p>
                      <span className="ledger-item-meta">
                        <span className={`ledger-status ${claim.supported ? 'ok' : 'bad'}`}>
                          {claim.supported ? '支持' : '不支持'}
                        </span>
                        {claim.citation && <span className="ledger-cite">[{claim.citation}]</span>}
                      </span>
                    </span>
                    <ChevronRight size={14} className="ledger-chevron" />
                  </button>
                )
              })}
              {ledgerClaims.length === 0 && (
                <div className="ledger-empty">
                  <BadgeCheck size={18} />
                  <span>报告生成后，这里会出现逐条主张与证据。</span>
                </div>
              )}
            </div>
          </div>
          <aside className="panel ledger-side ledger-detail">
            <ScoreRing score={verdict?.score ?? detail.run.score ?? 0} size={100} />
            <h3>{verdict?.passed ? '账本已对齐' : '账本存在缺口'}</h3>
            <p>核查器逐条比对主张与证据；不通过的意见会按类型路由回上游节点。</p>
            {activeClaim && (
              <>
                <div className="ledger-detail-block">
                  <span className="ledger-detail-label">主张 / CLAIM</span>
                  <p className="ledger-detail-claim">{activeClaim.claim}</p>
                  <div className="ledger-detail-reason">{activeClaim.reason}</div>
                </div>
                <div className="ledger-detail-block">
                  <span className="ledger-detail-label">证据 / EVIDENCE</span>
                  {activeCitation ? (
                    <div className="ledger-detail-quote">
                      <strong>{activeCitation.docTitle}</strong>
                      {activeCitation.quote}
                    </div>
                  ) : (
                    <p className="hint">没有找到对应证据。</p>
                  )}
                </div>
                {(verdict?.routes?.length ?? 0) > 0 && (
                  <div className="ledger-detail-block">
                    <span className="ledger-detail-label">问题路由 / ROUTE</span>
                    {verdict!.routes!.map((route, index) => (
                      <div className="ledger-detail-route" key={index}>
                        <span>{route.type}</span>
                        <span>→</span>
                        <strong>{targetLabel(route.target)}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            <div className="ledger-key">
              <span><i className="key-dot ok" /> 证据支持</span>
              <span><i className="key-dot bad" /> 缺少证据 / 数字不一致</span>
            </div>
          </aside>
        </div>
      )}

      {tab === 'verify' && (
        <div className="verify-layout">
          <div className="panel verify-hero">
            <div>
              <div className="eyebrow">VERIFICATION</div>
              <h2>{verdict?.passed ? '核查通过' : verdict ? '需要复核' : '等待核查'}</h2>
              <p>
                {verdict
                  ? `事实核查员逐条核对了 ${verdict.claims?.length ?? 0} 条结论。核查不通过时，运行时会按问题类型回到对应的上游节点，而不是一律重写。`
                  : '报告生成后，核查员会抽取结论、核对引用与数字，再决定是否回环。'}
              </p>
            </div>
            <ScoreRing score={verdict?.score ?? detail.run.score ?? 0} size={112} />
          </div>

          <div className="verify-grid">
            <div className="panel">
              <div className="panel-head compact">
                <div>
                  <div className="eyebrow">CLAIM BY CLAIM</div>
                  <h2>逐条核查</h2>
                </div>
                <Pill tone={verdict?.passed ? 'green' : 'orange'}>{verdict?.passed ? 'PASS' : 'REVIEW'}</Pill>
              </div>
              {(verdict?.routes?.length ?? 0) > 0 && (
                <div className="route-list">
                  <div className="route-list-head">本轮问题路由</div>
                  {verdict!.routes!.map((route, index) => (
                    <div className="route-item" key={index}>
                      <span className="route-type">{route.type}</span>
                      <span className="route-arrow">→</span>
                      <strong>{targetLabel(route.target)}</strong>
                      <span className="route-message">{route.message}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="claim-list">
                {(verdict?.claims ?? []).map((claim, index) => (
                  <div className={`claim ${claim.supported ? 'ok' : 'bad'}`} key={index}>
                    <span className="claim-icon">{claim.supported ? <Check size={13} /> : <X size={13} />}</span>
                    <div>
                      <p>{claim.claim}</p>
                      <span>{claim.reason}{claim.citation ? ` · [${claim.citation}]` : ''}</span>
                    </div>
                  </div>
                ))}
                {!verdict && <div className="hint">暂无可核查的结论。</div>}
              </div>
            </div>

            <div className="panel">
              <div className="panel-head compact">
                <div>
                  <div className="eyebrow">SELF-LOOP</div>
                  <h2>回环历史</h2>
                </div>
                <Pill tone="orange">{verifierRuns.length} 轮</Pill>
              </div>
              <div className="loop-list">
                {verifierRuns.map((run, index) => (
                  <div className="loop-item" key={run.id}>
                    <span className="loop-index">L{index + 1}</span>
                    <div>
                      <strong>{run.output?.verdict?.passed ? '通过' : '未通过'}</strong>
                      <span>
                        {Math.round((run.output?.verdict?.score ?? 0) * 100)}% · {run.output?.verdict?.issues.length ?? 0} 条问题
                        {run.output?.verdict?.selectedTarget
                          ? ` · → ${targetLabel(run.output.verdict.selectedTarget)}`
                          : run.output?.verdict?.routes?.[0]?.target
                            ? ` · → ${targetLabel(run.output.verdict.routes[0].target)}`
                            : ''}
                      </span>
                    </div>
                    {run.output?.verdict?.passed ? <BadgeCheck size={16} className="ok-icon" /> : <AlertTriangle size={16} className="warn-icon" />}
                  </div>
                ))}
                {verifierRuns.length === 0 && <div className="hint">尚未执行核查。</div>}
              </div>
              {verifierRuns.length > 1 && (
                <div className="loop-note">
                  <GitBranch size={14} />
                  <span>第 1 轮未通过后，系统优先处理 citation，把问题路由到竞争情报员；上游重跑后，第 2 轮核查通过。</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'events' && (
        <div className="panel events-full">
          <div className="panel-head compact">
            <div>
              <div className="eyebrow">EVENT LOG</div>
              <h2>完整事件流</h2>
            </div>
            <span className="hint">{events.length} 条事件 · 可回放</span>
          </div>
          <div className="event-table">
            <div className="event-table-head">
              <span>#</span><span>时间</span><span>类型</span><span>节点</span><span>消息</span>
            </div>
            {events.map((event) => (
              <div className="event-table-row" key={event.seq}>
                <span className="mono">{event.seq}</span>
                <span className="mono">{formatTime(event.ts)}</span>
                <span><code>{event.type}</code></span>
                <span className="mono">{event.nodeId ?? '—'}</span>
                <span>{event.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

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
      <div className="candidate-view">
        <div className="candidate-judge">
          <Sparkles size={16} />
          <p>{output?.judge ?? '裁判按证据覆盖与可执行性选择了主判断。'}</p>
        </div>
        <div className="candidate-grid">
          {candidates.map((candidate) => (
            <div className={`candidate-card ${output?.chosenId === candidate.id ? 'chosen' : ''}`} key={candidate.id}>
              <div className="candidate-head">
                <strong>{candidate.name}</strong>
                <Pill tone={output?.chosenId === candidate.id ? 'green' : 'muted'}>{Math.round((candidate.score ?? 0) * 100)}</Pill>
              </div>
              <p>{candidate.stance}</p>
              <ul>
                {candidate.points.map((point, index) => <li key={index}>{point}</li>)}
              </ul>
              {output?.chosenId === candidate.id && <div className="chosen-tag">裁判选择</div>}
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (output?.verdict) {
    return (
      <div className="node-verdict">
        <div className="node-verdict-head">
          <ScoreRing score={output.verdict.score} size={80} />
          <div>
            <strong>{output.verdict.passed ? '核查通过' : '核查未通过'}</strong>
            <p>{output.verdict.issues.length} 条问题</p>
          </div>
        </div>
        {(output.verdict.routes?.length ?? 0) > 0 && (
          <div className="route-list">
            <div className="route-list-head">问题路由</div>
            {output.verdict.routes!.map((route, index) => (
              <div className="route-item" key={index}>
                <span className="route-type">{route.type}</span>
                <span className="route-arrow">→</span>
                <strong>{targetLabel(route.target)}</strong>
                <span className="route-message">{route.message}</span>
              </div>
            ))}
          </div>
        )}
        <div className="claim-list">
          {output.verdict.claims?.map((claim, index) => (
            <div className={`claim ${claim.supported ? 'ok' : 'bad'}`} key={index}>
              <span className="claim-icon">{claim.supported ? <Check size={13} /> : <X size={13} />}</span>
              <div><p>{claim.claim}</p><span>{claim.reason}</span></div>
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
    <pre className="json-view">{JSON.stringify(output?.data ?? output ?? {}, null, 2)}</pre>
  )
}
