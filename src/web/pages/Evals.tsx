import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RiFlaskLine } from '@remixicon/react'
import { useApp } from '../App'
import { api } from '../api'
import { Button } from '@/components/base/buttons/button'
import { Chip } from '@/components/base/badges/chip'
import { ProgressBar } from '@/components/base/progress/progress'
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from '@/components/base/table/table'
import { Empty, Figure, PageHeader, ScoreRing, SectionHead, StatusPill, Surface } from '../components/ui'
import { cx } from '@/utils/cx'

function formatDate(value: string) {
  const date = new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export default function Evals() {
  const { data } = useApp()
  const navigate = useNavigate()
  const [sample, setSample] = useState<{ first: number; final: number; loops: number; tokens: number; id: string } | null>(null)

  useEffect(() => {
    const latest = data?.runs.find((run) => run.status === 'completed') ?? data?.runs[0]
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
    const threshold = data.workflow.settings.verifyThreshold ?? 0.85
    const pass = scored.filter((run) => (run.score ?? 0) >= threshold).length
    return {
      completed: completed.length,
      avg,
      passRate: scored.length ? Math.round((pass / scored.length) * 100) : 0,
      tokens: data.runs.reduce((sum, run) => sum + run.tokens, 0),
      threshold,
    }
  }, [data])

  if (!data || !metrics) return null

  return (
    <div className="app-page">
      <PageHeader
        title="评测"
        meta={`${data.runs.length} 次运行 · 平均核查分 ${Math.round(metrics.avg * 100)}% · 阈值 ${Math.round(metrics.threshold * 100)}% · 回环后通过 ${metrics.passRate}%`}
        actions={
          <Button leadingIcon={RiFlaskLine} onClick={() => navigate('/workflow')}>
            发起新实验
          </Button>
        }
      />

      <section className="grid grid-cols-2 gap-y-6 rounded-3xl glass px-6 py-5 sm:grid-cols-4">
        {[
          { label: '完成任务', value: metrics.completed, note: `共 ${data.runs.length} 次运行` },
          { label: '平均核查分', value: `${Math.round(metrics.avg * 100)}%`, note: `阈值 ${Math.round(metrics.threshold * 100)}%` },
          { label: '一次通过率', value: `${metrics.passRate}%`, note: '含 Self-Loop 后的最终结果' },
          { label: '累计 Tokens', value: metrics.tokens.toLocaleString(), note: 'Mock 模式为模拟计量' },
        ].map((item, index) => (
          <div key={item.label} className={cx('min-w-0', index > 0 && 'sm:border-s sm:border-border-button-default sm:ps-6')}>
            <Figure label={item.label} value={item.value} note={item.note} />
          </div>
        ))}
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,1fr)]">
        <Surface className="panel p-6">
          <div className="flex items-baseline justify-between gap-3">
            <SectionHead title="回环前 vs 回环后" />
            <Chip variant="caption" color={sample ? 'lime' : 'neutral'}>
              {sample ? '已记录' : '等待运行'}
            </Chip>
          </div>
          <p className="t-small mt-1.5 max-w-2xl">
            第一次核查不通过时自动回到对应节点；第二次带着问题清单重跑。这里用最近一次运行看变化。
          </p>

          <div className="mt-6 flex flex-col gap-5">
            {[
              { label: '回环前', value: sample?.first, percent: Math.round((sample?.first ?? 0) * 100) },
              { label: '回环后', value: sample?.final, percent: Math.round((sample?.final ?? 0) * 100) },
            ].map((row) => (
              <div key={row.label}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[12px] text-text-secondary">{row.label}</span>
                  <span className="t-num text-[13px] text-text-primary">
                    {row.value === undefined ? '—' : `${row.percent}%`}
                  </span>
                </div>
                <ProgressBar
                  aria-label={row.label}
                  value={row.percent}
                  size="md"
                  className="mt-2"
                />
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-3 border-t border-border-button-default pt-4">
              <span className="text-[12px] text-text-secondary">回环次数</span>
              <span className="t-num text-[13px] text-text-primary">{sample ? `${sample.loops} 轮` : '—'}</span>
            </div>
          </div>

          <p className="t-meta mt-5">
            {sample
              ? `数据来自最近一次运行 ${sample.id}：${sample.tokens.toLocaleString()} tokens，核查分从 ${Math.round(sample.first * 100)}% 提升到 ${Math.round(sample.final * 100)}%。`
              : '跑完一次示例研究后，这里会自动填充真实数据。'}
          </p>
        </Surface>

        <Surface className="panel p-6">
          <SectionHead title="四个指标" />
          <dl className="mt-4 flex flex-col">
            {[
              { title: '质量', text: '裁判按证据覆盖、假设可检验性、行动性打分。' },
              { title: '引用支持率', text: '核查员逐条核对结论与证据，能否被原文支持。' },
              { title: '延迟', text: '从任务开始到报告可交付的总耗时。' },
              { title: '成本', text: 'Tokens 与模型调用次数，按运行聚合。' },
            ].map((item, index) => (
              <div key={item.title} className="flex gap-3 border-b border-border-button-default py-3 last:border-b-0">
                <span className="mt-0.5 w-5 shrink-0 text-[11px] tabular-nums text-text-placeholder">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div>
                  <dt className="text-[13px] font-medium text-text-primary">{item.title}</dt>
                  <dd className="mt-0.5 text-[12px] leading-relaxed text-text-tertiary">{item.text}</dd>
                </div>
              </div>
            ))}
          </dl>
        </Surface>
      </div>

      <Surface className="panel mt-5 p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <SectionHead title="全部运行" />
          <span className="t-meta">按开始时间倒序</span>
        </div>

        {data.runs.length === 0 ? (
          <div className="mt-4">
            <Empty title="还没有运行" description="先跑一次示例研究，评测数据会自动出现。" />
          </div>
        ) : (
          <div className="mt-3">
            <Table aria-label="全部运行" size="sm">
              <TableHeader>
                <TableColumn>任务</TableColumn>
                <TableColumn>状态</TableColumn>
                <TableColumn>核查分</TableColumn>
                <TableColumn>回环</TableColumn>
                <TableColumn>Tokens</TableColumn>
                <TableColumn>时间</TableColumn>
              </TableHeader>
              <TableBody>
                {data.runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => navigate(`/runs/${run.id}`)}
                        className="block max-w-[420px] truncate text-start text-[13px] text-text-primary outline-none hover:text-accent-600 focus-visible:text-accent-600"
                      >
                        {run.input.replace(/^请生成一份面向投资决策的研究报告：/, '').replace(/。重点回答.*$/, '')}
                      </button>
                      <span className="t-code mt-0.5 block">{run.id}</span>
                    </TableCell>
                    <TableCell><StatusPill status={run.status} /></TableCell>
                    <TableCell>{run.score !== undefined ? <ScoreRing score={run.score} size={38} /> : <span className="t-meta">—</span>}</TableCell>
                    <TableCell><span className="t-num text-[13px]">{run.loops ?? 0}</span></TableCell>
                    <TableCell><span className="t-num text-[13px] text-text-secondary">{run.tokens.toLocaleString()}</span></TableCell>
                    <TableCell><span className="t-num text-[12px] text-text-tertiary">{formatDate(run.startedAt)}</span></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <p className="t-meta mt-4">
          评测数据来自当前工作区的运行记录；Mock 模式的 Token 与成本为模拟值。
        </p>
      </Surface>
    </div>
  )
}
