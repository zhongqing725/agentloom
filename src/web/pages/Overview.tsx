import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RiArrowRightLine,
  RiArrowRightSLine,
  RiBookOpenLine,
  RiFlashlightLine,
  RiGitBranchLine,
  RiLineChartLine,
  RiPlayLargeLine,
  RiRobot2Line,
  RiSparklingLine,
  RiStackLine,
  RiTeamLine,
  RiTimerLine,
  RiVerifiedBadgeLine,
} from '@remixicon/react'
import { useApp } from '../App'
import { api } from '../api'
import { Badge } from '@/components/base/badges/badge'
import { Button } from '@/components/base/buttons/button'
import { Textarea } from '@/components/base/textarea/textarea'
import { cx } from '@/utils/cx'
import { PluginIcon, ScoreRing, StatusPill, Surface } from '../components/ui'

function formatDate(value?: string) {
  if (!value) return '—'
  const date = new Date(value)
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export default function Overview() {
  const { data } = useApp()
  const navigate = useNavigate()
  const [input, setInput] = useState(
    '请生成一份面向投资决策的 AI 眼镜产业链研究报告，重点回答市场空间、价值链分配、竞争格局与主要风险。',
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  const latest = data.runs[0]
  const agents = data.agents

  return (
    <div className="app-page">
      <section className="grid items-center gap-10 py-4 lg:grid-cols-[minmax(0,1.12fr)_minmax(360px,0.88fr)] lg:gap-16 lg:py-8">
        <div className="min-w-0">
          <div className="text-caption-1-semibold uppercase tracking-[0.2em] text-accent-600">
            Multi-agent orchestration · 赛道一
          </div>
          <h1 className="mt-4 max-w-3xl text-display-4-medium tracking-[-0.04em] text-text-primary sm:text-display-2-medium">
            把一支 Agent 团队，
            <br />
            织成<span className="text-accent-600">可验证</span>的执行流。
          </h1>
          <p className="mt-5 max-w-xl text-headline-regular leading-relaxed text-text-secondary">
            织序 AgentLoom 是一个可验证的多 Agent 编排调度平台。增减 Agent、给节点插上“发散”或“核验”能力，
            让它在关键步骤多想几条路，再带着证据收敛成一份可交付的报告。
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Button className="h-10 px-4" leadingIcon={RiPlayLargeLine} onClick={() => void start()} disabled={loading || !input.trim()}>
              {loading ? '正在启动…' : '运行示例研究'}
            </Button>
            <Button className="h-10 px-4" variant="secondary" trailingIcon={RiArrowRightLine} onClick={() => navigate('/workflow')}>
              打开编排画布
            </Button>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-caption-1-medium text-text-tertiary">
            <span className="inline-flex items-center gap-1.5"><RiRobot2Line className="size-4 text-accent-600" /> {data.stats.agents} 个 Agent</span>
            <span className="inline-flex items-center gap-1.5"><RiBookOpenLine className="size-4 text-accent-600" /> {data.stats.docs} 篇资料</span>
            <span className="inline-flex items-center gap-1.5"><RiGitBranchLine className="size-4 text-accent-600" /> 3 条并行研究线</span>
          </div>
          {error && <p className="mt-4 text-caption-1-medium text-status-rose-text">{error}</p>}
        </div>

        <div className="relative min-w-0">
          <div className="absolute inset-[12%_-8%_-8%_8%] rounded-full bg-accent-500/10 blur-3xl" aria-hidden />
          <Surface className="relative overflow-hidden p-6">
            <div className="flex items-center justify-between border-b border-separator-border pb-4">
              <span className="text-caption-2-semibold uppercase tracking-[0.16em] text-text-tertiary">Live workflow</span>
              <span className="inline-flex items-center gap-1.5 text-caption-1-medium text-status-lime-text">
                <span className="size-1.5 rounded-full bg-current" /> READY
              </span>
            </div>
            <div className="pt-2">
              {agents.slice(0, 5).map((agent, index) => (
                <div className="flex items-center gap-3 border-b border-separator-border py-3 last:border-b-0" key={agent.id}>
                  <span className="w-6 shrink-0 font-mono text-caption-2-medium text-text-tertiary">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="size-2 shrink-0 rounded-full bg-accent-500" />
                  <div className="min-w-0 flex-1">
                    <div className="text-body-2-medium text-text-primary">{agent.name}</div>
                    <div className="mt-0.5 truncate text-caption-1-regular text-text-tertiary">{agent.title}</div>
                  </div>
                  <RiArrowRightSLine className="size-4 shrink-0 text-text-tertiary" aria-hidden />
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1.5 pt-4" aria-hidden>
              <span className="h-px w-[38%] bg-accent-300" />
              <span className="h-px w-[24%] bg-accent-400" />
              <span className="h-px w-[17%] bg-accent-500" />
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-separator-border pt-4 text-caption-1-medium text-text-secondary">
              <span className="inline-flex items-center gap-1.5"><RiVerifiedBadgeLine className="size-3.5" /> 引用核验</span>
              <span className="inline-flex items-center gap-1.5"><RiGitBranchLine className="size-3.5" /> Self-Loop × 2</span>
              <span className="inline-flex items-center gap-1.5"><RiTimerLine className="size-3.5" /> 约 40 秒</span>
            </div>
          </Surface>
          <div className="absolute -bottom-5 end-6 grid size-21 place-items-center rounded-full border-4 border-background-full bg-linear-to-br from-accent-400 to-accent-600 text-text-white shadow-xl">
            <div className="text-center">
              <div className="text-title-2-semibold leading-none">8</div>
              <div className="mt-1 text-caption-2-semibold uppercase tracking-[0.08em] opacity-80">Roles<br />one flow</div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { icon: RiPlayLargeLine, label: '累计运行', value: data.stats.runs, note: '每次运行都保留完整轨迹' },
          {
            icon: RiLineChartLine,
            label: '平均核查分',
            value: data.stats.avgScore ? `${Math.round(data.stats.avgScore * 100)}%` : '—',
            note: '引用支持率的平均值',
          },
          {
            icon: RiStackLine,
            label: '知识片段',
            value: data.documents.reduce((sum, doc) => sum + doc.chunkCount, 0),
            note: `${data.stats.docs} 篇资料，BM25 检索`,
          },
          { icon: RiTeamLine, label: '团队角色', value: data.stats.agents, note: `${data.plugins.length} 个可挂载能力插件` },
        ].map((item) => {
          const Icon = item.icon
          return (
            <Surface key={item.label} className="p-4 sm:p-5">
              <div className="flex size-8 items-center justify-center rounded-xl bg-background-tertiary-default text-accent-600">
                <Icon className="size-4" aria-hidden />
              </div>
              <div className="mt-4 text-caption-1-medium text-text-secondary">{item.label}</div>
              <div className="mt-1 text-title-1-semibold tracking-[-0.03em] text-text-primary">{item.value}</div>
              <div className="mt-2 text-caption-1-regular leading-relaxed text-text-tertiary">{item.note}</div>
            </Surface>
          )
        })}
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <Surface className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-caption-1-semibold uppercase tracking-[0.16em] text-accent-600">Start a run</div>
              <h2 className="mt-1.5 text-title-2-semibold text-text-primary">今天，让团队研究什么？</h2>
            </div>
            <Badge color="neutral">{agents.length} AGENTS</Badge>
          </div>
          <div className="mt-5">
            <Textarea
              aria-label="研究任务"
              rows={4}
              value={input}
              onChange={setInput}
              placeholder="输入一个需要多步研究、证据核验的复杂任务…"
            />
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption-1-medium text-text-tertiary">
              <span className="inline-flex items-center gap-1.5"><RiVerifiedBadgeLine className="size-3.5 text-accent-600" /> 自动核查</span>
              <span className="inline-flex items-center gap-1.5"><RiSparklingLine className="size-3.5 text-accent-600" /> 三视角发散</span>
              <span className="inline-flex items-center gap-1.5"><RiGitBranchLine className="size-3.5 text-accent-600" /> 失败回环</span>
            </div>
            <Button trailingIcon={RiArrowRightLine} onClick={() => void start()} disabled={loading || !input.trim()}>
              {loading ? '启动中…' : '开始研究'}
            </Button>
          </div>
        </Surface>

        <Surface className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-caption-1-semibold uppercase tracking-[0.16em] text-accent-600">The team</div>
              <h2 className="mt-1.5 text-title-2-semibold text-text-primary">八种角色，一条流水线</h2>
            </div>
            <Button variant="ghost" size="xs" trailingIcon={RiArrowRightLine} onClick={() => navigate('/team')}>
              管理团队
            </Button>
          </div>
          <div className="mt-3 flex flex-col">
            {agents.map((agent, index) => (
              <div className="flex items-center gap-2.5 border-b border-separator-border py-2 last:border-0" key={agent.id}>
                <span className="w-5 shrink-0 font-mono text-caption-2-medium text-text-tertiary">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="size-1.5 shrink-0 rounded-full bg-accent-500" />
                <span className="min-w-0 flex-1 truncate text-body-2-medium text-text-primary">{agent.name}</span>
                <div className="flex shrink-0 items-center gap-1.5">
                  {agent.plugins.map((pluginId) => {
                    const plugin = data.plugins.find((item) => item.id === pluginId)
                    return plugin ? <PluginIcon key={pluginId} name={plugin.icon} size={13} className="text-text-tertiary" /> : null
                  })}
                </div>
              </div>
            ))}
          </div>
        </Surface>
      </section>

      <Surface className="mt-4 overflow-hidden">
        <div className="flex items-end justify-between gap-4 p-5 pb-4 sm:p-6 sm:pb-4">
          <div>
            <div className="text-caption-1-semibold uppercase tracking-[0.16em] text-accent-600">Recent runs</div>
            <h2 className="mt-1.5 text-title-2-semibold text-text-primary">最近的执行</h2>
          </div>
          <Button variant="ghost" size="xs" trailingIcon={RiArrowRightLine} onClick={() => navigate('/evals')}>
            查看评测
          </Button>
        </div>
        {data.runs.length === 0 ? (
          <div className="mx-5 mb-5 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border-button-default px-5 py-10 text-center sm:mx-6 sm:mb-6">
            <RiSparklingLine className="size-5 text-accent-600" />
            <p className="text-body-regular text-text-secondary">还没有运行记录。点击“运行示例研究”，第一份报告会在几十秒内生成。</p>
          </div>
        ) : (
          <div>
            <div className="hidden grid-cols-[minmax(0,1fr)_100px_72px_80px_112px_18px] items-center gap-4 border-y border-separator-border bg-background-secondary-default px-5 py-2.5 text-caption-2-semibold uppercase tracking-[0.08em] text-text-tertiary sm:mx-6 sm:grid sm:rounded-t-xl sm:px-3">
              <span>运行</span><span>状态</span><span>核查分</span><span>Tokens</span><span>开始时间</span><span />
            </div>
            <div className="px-2 pb-2 sm:px-4 sm:pb-4">
              {data.runs.slice(0, 5).map((run) => (
                <button
                  key={run.id}
                  onClick={() => navigate(`/runs/${run.id}`)}
                  className={cx(
                    'grid w-full items-center gap-4 rounded-xl border-b border-separator-border px-3 py-3 text-left last:border-0',
                    'grid-cols-[minmax(0,1fr)_auto_18px] transition-colors duration-150 hover:bg-background-secondary-default',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring',
                    'sm:grid-cols-[minmax(0,1fr)_100px_72px_80px_112px_18px]',
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-body-2-medium text-text-primary">{run.input.slice(0, 34)}…</span>
                    <span className="mt-0.5 block truncate font-mono text-caption-2-regular text-text-tertiary">{run.id}</span>
                  </span>
                  <span><StatusPill status={run.status} /></span>
                  <span className="hidden sm:block">
                    {run.score !== undefined ? <ScoreRing score={run.score} size={38} label="" /> : '—'}
                  </span>
                  <span className="hidden font-mono text-caption-1-regular text-text-secondary sm:block">{run.tokens.toLocaleString()}</span>
                  <span className="hidden font-mono text-caption-1-regular text-text-tertiary sm:block">{formatDate(run.startedAt)}</span>
                  <RiArrowRightSLine className="size-4 text-text-tertiary" aria-hidden />
                </button>
              ))}
            </div>
          </div>
        )}
      </Surface>

      {latest && (
        <div className="mt-5 flex flex-wrap items-center gap-1.5 text-caption-1-regular text-text-tertiary">
          <RiFlashlightLine className="size-3.5" aria-hidden />
          最近一次运行 <code className="rounded-sm bg-background-tertiary-default px-1 py-0.5 font-mono">{latest.id}</code> · {latest.mode === 'live' ? 'Live 模型' : 'Mock 演示'} · 所有轨迹可在运行详情中回放。
        </div>
      )}
    </div>
  )
}
