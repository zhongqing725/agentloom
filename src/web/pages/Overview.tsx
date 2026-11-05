import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RiArrowRightLine, RiPlayLargeLine } from '@remixicon/react'
import { useApp } from '../App'
import { api } from '../api'
import { Avatar } from '@/components/base/avatar/avatar'
import { Button } from '@/components/base/buttons/button'
import { Chip } from '@/components/base/badges/chip'
import { Textarea } from '@/components/base/textarea/textarea'
import { cx } from '@/utils/cx'
import { Figure, PageHeader, PluginIcon, ScoreRing, SectionHead, StatusPill, Surface } from '../components/ui'
import { WorkflowGraph, type NodeStatusInfo } from '../components/Graph'
import type { NodeRun } from '../../shared/types'

function formatDate(value?: string) {
  if (!value) return '—'
  const date = new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export default function Overview() {
  const { data } = useApp()
  const navigate = useNavigate()
  const [input, setInput] = useState(
    '请生成一份面向投资决策的 AI 眼镜产业链研究报告，重点回答市场空间、价值链分配、竞争格局与主要风险。',
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statuses, setStatuses] = useState<Map<string, NodeStatusInfo>>(new Map())

  const latest = data?.runs[0]
  const stagedRun = data?.runs.find((run) => run.status === 'completed') ?? latest

  useEffect(() => {
    if (!stagedRun) {
      setStatuses(new Map())
      return
    }
    let alive = true
    void api.getRun(stagedRun.id).then((detail) => {
      if (!alive) return
      const byNode = new Map<string, NodeRun>()
      for (const node of detail.nodes) {
        const current = byNode.get(node.nodeId)
        if (!current || node.iteration >= current.iteration) byNode.set(node.nodeId, node)
      }
      const next = new Map<string, NodeStatusInfo>()
      for (const [nodeId, node] of byNode) {
        next.set(nodeId, { status: node.status, score: node.score, iteration: node.iteration })
      }
      setStatuses(next)
    }).catch(() => undefined)
    return () => { alive = false }
  }, [stagedRun])

  const chunkTotal = useMemo(
    () => data?.documents.reduce((sum, doc) => sum + doc.chunkCount, 0) ?? 0,
    [data],
  )

  if (!data) return null

  const start = async () => {
    if (!input.trim()) return
    setLoading(true)
    setError(null)
    try {
      const { run } = await api.createRun(input)
      navigate(`/runs/${run.id}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '启动失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app-page">
      <PageHeader
        title="工作台"
        meta={`${data.workflow.name} · ${data.stats.agents} 个节点 · ${data.stats.docs} 篇资料 · ${
          latest ? `最近一次 ${formatDate(latest.startedAt)}` : '尚无运行'
        }`}
        actions={
          <Button variant="ghost" size="small" trailingIcon={RiArrowRightLine} onClick={() => navigate('/workflow')}>
            打开编排画布
          </Button>
        }
      />

      {/* Command strip ------------------------------------------------------- */}
      <Surface className="flex flex-col gap-2 p-2.5 sm:flex-row sm:items-center">
        <Textarea
          aria-label="研究任务"
          rows={2}
          value={input}
          onChange={setInput}
          fieldClassName="bg-transparent ring-0"
          className="min-w-0 flex-1"
          placeholder="交办一项需要多步研究、证据核验的任务…"
        />
        <div className="flex items-center justify-between gap-3 px-1 sm:flex-col sm:items-end sm:gap-2">
          <Button onClick={() => void start()} disabled={loading || !input.trim()} leadingIcon={RiPlayLargeLine}>
            {loading ? '正在启动…' : '开始研究'}
          </Button>
          <span className="t-meta whitespace-nowrap">
            并发 {data.workflow.settings.maxConcurrency} · 回环 {data.workflow.settings.maxLoop} · 阈值{' '}
            {Math.round(data.workflow.settings.verifyThreshold * 100)}%
          </span>
        </div>
        {error && <p className="px-2 text-[12px] text-status-rose-text">{error}</p>}
      </Surface>

      {/* Stage ---------------------------------------------------------------- */}
      <Surface className="mt-4 flex flex-col overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-text-primary">{data.workflow.name}</span>
            <Chip variant="caption" color="neutral">上次运行状态</Chip>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-text-tertiary">
            <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-status-lime-text" /> 完成</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-accent-500" /> 运行</span>
            <button type="button" className="link" onClick={() => navigate('/workflow')}>打开画布</button>
          </div>
        </div>
        <WorkflowGraph
          graph={data.workflow.graph}
          agents={data.agents}
          plugins={data.plugins}
          statuses={statuses}
          readOnly
          height={404}
          onNodeClick={() => navigate('/workflow')}
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border-button-default px-4 py-2 text-[11px] text-text-tertiary">
          <span>{data.workflow.graph.nodes.length} 个节点</span>
          <span>{data.workflow.graph.edges.filter((edge) => edge.kind !== 'loop').length} 条依赖</span>
          <span>{data.workflow.graph.edges.filter((edge) => edge.kind === 'loop').length} 条回环</span>
          <span className="ms-auto">点击任意节点进入编辑</span>
        </div>
      </Surface>

      {/* Runs + team ---------------------------------------------------------- */}
      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
        <Surface className="panel p-5">
          <SectionHead
            title="最近的执行"
            aside={
              <button type="button" className="link text-[12px]" onClick={() => navigate('/evals')}>
                全部
              </button>
            }
          />
          {data.runs.length === 0 ? (
            <p className="t-small mt-3">还没有运行记录。</p>
          ) : (
            <div className="mt-3 flex flex-col gap-0.5">
              {data.runs.slice(0, 4).map((run) => (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => navigate(`/runs/${run.id}`)}
                  className="row -mx-2 w-[calc(100%+16px)] justify-between gap-3 px-2 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] text-text-primary">
                      {run.input.replace(/^请生成一份面向投资决策的研究报告：/, '').replace(/。重点回答.*$/, '')}
                    </span>
                    <span className="t-code mt-0.5 block">{run.id} · {formatDate(run.startedAt)}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <StatusPill status={run.status} />
                    {run.score !== undefined ? <ScoreRing score={run.score} size={38} /> : null}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Surface>

        <Surface className="panel p-5">
          <SectionHead
            title="节点"
            aside={
              <button type="button" className="link text-[12px]" onClick={() => navigate('/team')}>
                管理
              </button>
            }
          />
          <div className="mt-3 flex flex-col">
            {data.agents.map((agent) => (
              <div key={agent.id} className="flex items-center gap-2.5 py-1">
                <Avatar size="xs" initials={agent.name.slice(0, 1)} alt={agent.name} />
                <span className="w-[86px] shrink-0 truncate text-[12px] text-text-primary">{agent.name}</span>
                <span className="min-w-0 flex-1 truncate text-[11px] text-text-tertiary">{agent.title}</span>
                  <span className="flex shrink-0 items-center gap-1 text-text-placeholder">
                    {agent.plugins.map((pluginId) => {
                      const plugin = data.plugins.find((item) => item.id === pluginId)
                      return plugin ? <PluginIcon key={pluginId} name={plugin.icon} size={11} /> : null
                    })}
                  </span>
                </div>
              ))}
          </div>
        </Surface>
      </div>

      {/* Metrics strip -------------------------------------------------------- */}
      <section className="mt-4 grid grid-cols-2 gap-y-6 rounded-3xl glass px-6 py-5 sm:grid-cols-4">
        {[
          { label: '累计运行', value: data.stats.runs, note: latest ? `最近 ${formatDate(latest.startedAt)}` : '尚无记录' },
          {
            label: '平均核查分',
            value: data.stats.avgScore ? `${Math.round(data.stats.avgScore * 100)}%` : '—',
            note: '引用支持率均值',
          },
          { label: '知识片段', value: chunkTotal, note: `${data.stats.docs} 篇资料` },
          { label: '累计 Tokens', value: data.stats.totalTokens.toLocaleString(), note: 'Mock 为模拟计量' },
        ].map((item, index) => (
          <div key={item.label} className={cx('min-w-0', index > 0 && 'sm:border-s sm:border-border-button-default sm:ps-6')}>
            <Figure label={item.label} value={item.value} note={item.note} />
          </div>
        ))}
      </section>

      <footer className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1">
        <span className="t-meta">Mock 演示数据</span>
        {latest && <span className="t-meta">最近一次运行 {latest.id}</span>}
        <span className="t-meta ms-auto">知识库为模拟整理，不构成投资依据</span>
      </footer>
    </div>
  )
}
