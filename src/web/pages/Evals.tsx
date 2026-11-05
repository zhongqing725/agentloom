import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RiArrowRightSLine,
  RiBarChartLine,
  RiCheckboxCircleLine,
  RiFlaskLine,
  RiGitBranchLine,
  RiLineChartLine,
  RiPulseLine,
  RiTeamLine,
  RiTimerLine,
} from '@remixicon/react'
import { useApp } from '../App'
import { api } from '../api'
import { Badge } from '@/components/base/badges/badge'
import { Button } from '@/components/base/buttons/button'
import { ScoreRing, Empty, PageHeader, StatusPill, Surface } from '../components/ui'
import { cx } from '@/utils/cx'

function formatDate(value: string) {
  const date = new Date(value)
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export default function Evals() {
  const { data } = useApp()
  const navigate = useNavigate()
  const [sample, setSample] = useState<{ first: number; final: number; loops: number; tokens: number; id: string } | null>(null)

  useEffect(() => {
    const latest = data?.runs[0]
    if (!latest) {
      setSample(null)
      return
    }
    let active = true
    void api.getRun(latest.id).then((detail) => {
      if (!active) return
      const verifierRuns = detail.nodes
        .filter((node) => node.nodeId === 'verifier')
        .sort((a, b) => a.iteration - b.iteration)
      if (verifierRuns.length === 0) return
      setSample({
        first: verifierRuns[0].score ?? 0,
        final: verifierRuns[verifierRuns.length - 1].score ?? 0,
        loops: verifierRuns.length - 1,
        tokens: detail.run.tokens,
        id: detail.run.id,
      })
    })
    return () => { active = false }
  }, [data?.runs])

  const metrics = useMemo(() => {
    if (!data) return null
    const completed = data.runs.filter((run) => run.status === 'completed')
    const scored = completed.filter((run) => typeof run.score === 'number')
    const avg = scored.length ? scored.reduce((sum, run) => sum + (run.score ?? 0), 0) / scored.length : 0
    const pass = scored.filter((run) => (run.score ?? 0) >= (data.workflow.settings.verifyThreshold ?? 0.85)).length
    return {
      completed: completed.length,
      avg,
      passRate: scored.length ? Math.round((pass / scored.length) * 100) : 0,
      tokens: data.runs.reduce((sum, run) => sum + run.tokens, 0),
    }
  }, [data])

  if (!data || !metrics) return null

  const cards = [
    { icon: RiPulseLine, label: '完成任务', value: metrics.completed, note: `共 ${data.runs.length} 次运行` },
    { icon: RiLineChartLine, label: '平均核查分', value: `${Math.round(metrics.avg * 100)}%`, note: `阈值 ${Math.round((data.workflow.settings.verifyThreshold ?? 0.85) * 100)}%` },
    { icon: RiCheckboxCircleLine, label: '一次通过率', value: `${metrics.passRate}%`, note: '含 Self-Loop 后的最终结果' },
    { icon: RiBarChartLine, label: '累计 Tokens', value: metrics.tokens.toLocaleString(), note: 'Mock 模式为模拟计量' },
  ]

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Evaluation"
        title="评测"
        description="把每次运行当成一次实验：核查分、回环次数、Token 成本都可以被追踪。"
        actions={
          <Button leadingIcon={RiFlaskLine} onClick={() => navigate('/workflow')}>
            发起新实验
          </Button>
        }
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <Surface key={card.label} className="p-4 sm:p-5">
              <span className="grid size-8 place-items-center rounded-xl bg-background-tertiary-default text-accent-600">
                <Icon className="size-4" aria-hidden />
              </span>
              <div className="mt-4 text-caption-1-medium text-text-secondary">{card.label}</div>
              <div className="mt-1 text-title-1-semibold tracking-[-0.03em] text-text-primary">{card.value}</div>
              <div className="mt-2 text-caption-1-regular leading-relaxed text-text-tertiary">{card.note}</div>
            </Surface>
          )
        })}
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Surface className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-caption-1-semibold uppercase tracking-[0.16em] text-accent-600">Self-loop observation</div>
              <h2 className="mt-1.5 text-title-2-semibold text-text-primary">回环前 vs 回环后</h2>
            </div>
            <span className="inline-flex items-center gap-1.5 text-caption-1-medium text-text-tertiary">
              <span className={cx('size-1.5 rounded-full', sample ? 'bg-status-lime-text' : 'bg-text-tertiary')} />
              {sample ? '已记录' : '等待运行'}
            </span>
          </div>
          <p className="mt-3 max-w-2xl text-body-2-regular leading-relaxed text-text-secondary">
            同一个任务，第一次核查不通过时自动回到写作节点；第二次带着问题清单重写。用最近一次运行看回环前后的变化。
          </p>
          <div className="mt-6 flex flex-col gap-4">
            {[
              { label: '回环前', value: sample?.first, width: `${Math.round((sample?.first ?? 0) * 100)}%`, accent: false },
              { label: '回环后', value: sample?.final, width: `${Math.round((sample?.final ?? 0) * 100)}%`, accent: true },
              { label: '回环次数', value: sample?.loops, width: sample ? `${Math.min(100, sample.loops * 50 + 25)}%` : '0%', accent: false },
            ].map((row) => (
              <div key={row.label} className="grid grid-cols-[64px_minmax(0,1fr)_52px] items-center gap-3">
                <span className="text-caption-1-medium text-text-secondary">{row.label}</span>
                <div className="h-2 overflow-hidden rounded-full bg-background-tertiary-default">
                  <div
                    className={cx('h-full rounded-full transition-[width] duration-500', row.accent ? 'bg-accent-500' : 'bg-text-tertiary/40')}
                    style={{ width: row.width }}
                  />
                </div>
                <span className="text-end font-mono text-caption-1-medium text-text-primary">
                  {row.value === undefined ? '—' : row.label === '回环次数' ? `${row.value} 轮` : `${Math.round(row.value * 100)}%`}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-6 flex gap-2 rounded-2xl bg-background-secondary-default p-3 text-caption-1-regular leading-relaxed text-text-tertiary">
            <RiGitBranchLine className="mt-0.5 size-3.5 shrink-0 text-accent-600" aria-hidden />
            <span>
              {sample
                ? `数据来自最近一次运行 ${sample.id}：${sample.tokens.toLocaleString()} tokens，核查分从 ${Math.round(sample.first * 100)}% 提升到 ${Math.round(sample.final * 100)}%。`
                : '跑完一次示例研究后，这里会自动填充真实数据。'}
            </span>
          </div>
        </Surface>

        <Surface className="p-5 sm:p-6">
          <div className="text-caption-1-semibold uppercase tracking-[0.16em] text-accent-600">What we measure</div>
          <h2 className="mt-1.5 text-title-2-semibold text-text-primary">四个指标</h2>
          <div className="mt-5 flex flex-col gap-4">
            {[
              { title: '质量', text: '裁判按证据覆盖、假设可检验性、行动性打分。' },
              { title: '引用支持率', text: '核查员逐条核对结论与证据，能否被原文支持。' },
              { title: '延迟', text: '从任务开始到报告可交付的总耗时。' },
              { title: '成本', text: 'Tokens 与模型调用次数，按运行聚合。' },
            ].map((item, index) => (
              <div key={item.title} className="flex gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-50 text-caption-2-semibold text-accent-700">{index + 1}</span>
                <div>
                  <div className="text-body-2-medium text-text-primary">{item.title}</div>
                  <p className="mt-0.5 text-caption-1-regular leading-relaxed text-text-tertiary">{item.text}</p>
                </div>
              </div>
            ))}
          </div>
        </Surface>
      </section>

      <Surface className="mt-4 overflow-hidden">
        <div className="flex items-end justify-between gap-4 p-5 pb-4 sm:p-6 sm:pb-4">
          <div>
            <div className="text-caption-1-semibold uppercase tracking-[0.16em] text-accent-600">Run history</div>
            <h2 className="mt-1.5 text-title-2-semibold text-text-primary">全部运行</h2>
          </div>
          <span className="inline-flex items-center gap-1.5 text-caption-1-regular text-text-tertiary">
            <RiTimerLine className="size-3.5" aria-hidden /> 按开始时间倒序
          </span>
        </div>
        {data.runs.length === 0 ? (
          <div className="px-5 pb-5 sm:px-6 sm:pb-6">
            <Empty title="还没有运行" description="先跑一次示例研究，评测数据会自动出现。" />
          </div>
        ) : (
          <div>
            <div className="hidden grid-cols-[minmax(0,1fr)_96px_60px_48px_80px_110px_18px] items-center gap-4 border-y border-separator-border bg-background-secondary-default px-5 py-2.5 text-caption-2-semibold uppercase tracking-[0.08em] text-text-tertiary sm:mx-6 sm:grid sm:rounded-t-xl sm:px-3">
              <span>任务</span><span>状态</span><span>核查分</span><span>回环</span><span>Tokens</span><span>时间</span><span />
            </div>
            <div className="px-2 pb-2 sm:px-4 sm:pb-4">
              {data.runs.map((run) => (
                <button
                  key={run.id}
                  onClick={() => navigate(`/runs/${run.id}`)}
                  className={cx(
                    'grid w-full items-center gap-4 rounded-xl border-b border-separator-border px-3 py-3 text-left last:border-0',
                    'grid-cols-[minmax(0,1fr)_auto_18px] transition-colors duration-150 hover:bg-background-secondary-default',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring',
                    'sm:grid-cols-[minmax(0,1fr)_96px_60px_48px_80px_110px_18px]',
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-body-2-medium text-text-primary">{run.input.slice(0, 42)}…</span>
                    <span className="mt-0.5 block truncate font-mono text-caption-2-regular text-text-tertiary">{run.id}</span>
                  </span>
                  <span><StatusPill status={run.status} /></span>
                  <span className="hidden sm:block">{run.score !== undefined ? <ScoreRing score={run.score} size={38} label="" /> : '—'}</span>
                  <span className="hidden sm:block"><Badge color="neutral">{run.loops ?? 0}</Badge></span>
                  <span className="hidden font-mono text-caption-1-regular text-text-secondary sm:block">{run.tokens.toLocaleString()}</span>
                  <span className="hidden font-mono text-caption-1-regular text-text-tertiary sm:block">{formatDate(run.startedAt)}</span>
                  <RiArrowRightSLine className="size-4 text-text-tertiary" aria-hidden />
                </button>
              ))}
            </div>
          </div>
        )}
      </Surface>

      <div className="mt-5 flex items-center gap-1.5 text-caption-1-regular text-text-tertiary">
        <RiTeamLine className="size-3.5" aria-hidden /> 评测数据来自当前工作区的运行记录；Mock 模式的 Token 与成本为模拟值。
      </div>
    </div>
  )
}
