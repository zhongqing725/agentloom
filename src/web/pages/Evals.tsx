import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock3,
  FlaskConical,
  GitBranch,
  TrendingUp,
  Users,
} from 'lucide-react'
import { useApp } from '../App'
import { api } from '../api'
import { PageHeader, Pill, ScoreRing, StatusPill } from '../components/ui'

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

  return (
    <div className="page">
      <PageHeader
        eyebrow="EVALUATION"
        title="评测"
        description="把每次运行当成一次实验：核查分、回环次数、Token 成本都可以被追踪。"
        actions={
          <button className="btn btn-accent" onClick={() => navigate('/workflow')}>
            <FlaskConical size={15} /> 发起新实验
          </button>
        }
      />

      <section className="eval-metrics">
        <div className="eval-card">
          <span className="eval-icon"><Activity size={17} /></span>
          <div><span>完成任务</span><strong>{metrics.completed}</strong></div>
          <small>共 {data.runs.length} 次运行</small>
        </div>
        <div className="eval-card">
          <span className="eval-icon"><TrendingUp size={17} /></span>
          <div><span>平均核查分</span><strong>{Math.round(metrics.avg * 100)}<em>%</em></strong></div>
          <small>阈值 {Math.round((data.workflow.settings.verifyThreshold ?? 0.85) * 100)}%</small>
        </div>
        <div className="eval-card">
          <span className="eval-icon"><CheckCircle2 size={17} /></span>
          <div><span>一次通过率</span><strong>{metrics.passRate}<em>%</em></strong></div>
          <small>含 Self-Loop 后的最终结果</small>
        </div>
        <div className="eval-card">
          <span className="eval-icon"><BarChart3 size={17} /></span>
          <div><span>累计 Tokens</span><strong>{metrics.tokens.toLocaleString()}</strong></div>
          <small>Mock 模式为模拟计量</small>
        </div>
      </section>

      <section className="eval-grid">
        <div className="panel benchmark-panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">SELF-LOOP OBSERVATION</div>
              <h2>回环前 vs 回环后</h2>
            </div>
            <Pill tone={sample ? 'green' : 'orange'}>{sample ? '已记录' : '等待运行'}</Pill>
          </div>
          <p className="benchmark-desc">
            同一个任务，第一次核查不通过时自动回到写作节点；第二次带着问题清单重写。用最近一次运行看回环前后的变化。
          </p>
          <div className="benchmark-bars">
            <div className="benchmark-row">
              <span>回环前</span>
              <div className="bar-track"><i style={{ width: `${Math.round((sample?.first ?? 0) * 100)}%` }} /></div>
              <strong>{sample ? `${Math.round(sample.first * 100)}%` : '—'}</strong>
            </div>
            <div className="benchmark-row">
              <span>回环后</span>
              <div className="bar-track accent"><i style={{ width: `${Math.round((sample?.final ?? 0) * 100)}%` }} /></div>
              <strong>{sample ? `${Math.round(sample.final * 100)}%` : '—'}</strong>
            </div>
            <div className="benchmark-row">
              <span>回环次数</span>
              <div className="bar-track teal"><i style={{ width: sample ? `${Math.min(100, sample.loops * 50 + 25)}%` : '0%' }} /></div>
              <strong>{sample ? `${sample.loops} 轮` : '—'}</strong>
            </div>
          </div>
          <div className="benchmark-foot">
            <GitBranch size={14} />
            <span>
              {sample
                ? `数据来自最近一次运行 ${sample.id}：${sample.tokens.toLocaleString()} tokens，核查分从 ${Math.round(sample.first * 100)}% 提升到 ${Math.round(sample.final * 100)}%。`
                : '跑完一次示例研究后，这里会自动填充真实数据。'}
            </span>
          </div>
        </div>

        <div className="panel eval-side">
          <div className="panel-head compact">
            <div>
              <div className="eyebrow">WHAT WE MEASURE</div>
              <h2>四个指标</h2>
            </div>
          </div>
          <div className="metric-list">
            <div><span className="metric-dot orange" /><div><strong>质量</strong><p>裁判按证据覆盖、假设可检验性、行动性打分。</p></div></div>
            <div><span className="metric-dot teal" /><div><strong>引用支持率</strong><p>核查员逐条核对结论与证据，能否被原文支持。</p></div></div>
            <div><span className="metric-dot purple" /><div><strong>延迟</strong><p>从任务开始到报告可交付的总耗时。</p></div></div>
            <div><span className="metric-dot green" /><div><strong>成本</strong><p>Tokens 与模型调用次数，按运行聚合。</p></div></div>
          </div>
        </div>
      </section>

      <section className="panel eval-table-panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">RUN HISTORY</div>
            <h2>全部运行</h2>
          </div>
          <span className="hint"><Clock3 size={13} /> 按开始时间倒序</span>
        </div>
        <div className="eval-table">
          <div className="eval-table-head">
            <span>任务</span><span>状态</span><span>核查分</span><span>回环</span><span>Tokens</span><span>时间</span><span />
          </div>
          {data.runs.map((run) => {
            const loops = run.loops ?? 0
            return (
              <button className="eval-row" key={run.id} onClick={() => navigate(`/runs/${run.id}`)}>
                <span className="eval-task">
                  <strong>{run.input.slice(0, 42)}…</strong>
                  <small>{run.id}</small>
                </span>
                <span><StatusPill status={run.status} /></span>
                <span>{run.score !== undefined ? <ScoreRing score={run.score} size={38} label="" /> : '—'}</span>
                <span className="mono">{loops}</span>
                <span className="mono">{run.tokens.toLocaleString()}</span>
                <span className="mono">{formatDate(run.startedAt)}</span>
                <span><ArrowRight size={14} /></span>
              </button>
            )
          })}
          {data.runs.length === 0 && <div className="hint pad">还没有运行。先跑一次示例研究吧。</div>}
        </div>
      </section>

      <div className="footnote">
        <Users size={13} /> 评测数据来自当前工作区的运行记录；Mock 模式的 Token 与成本为模拟值。
      </div>
    </div>
  )
}
