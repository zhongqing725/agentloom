import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Bot,
  Clock3,
  GitBranch,
  Network,
  Play,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react'
import { useApp } from '../App'
import { api } from '../api'
import { Pill, ScoreRing, StatusPill } from '../components/ui'

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
    <div className="page overview">
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">MULTI-AGENT ORCHESTRATION · 赛道一</div>
          <h1>
            把一支 Agent 团队，
            <br />
            织成<span>可验证</span>的执行流。
          </h1>
          <p>
            织序 AgentLoom 是一个可验证的多 Agent 编排调度平台。增减 Agent、给节点插上“发散”或“核验”能力，
            让它在关键步骤多想几条路，再带着证据收敛成一份可交付的报告。
          </p>
          <div className="hero-actions">
            <button className="btn btn-accent lg" onClick={start} disabled={loading}>
              <Play size={15} fill="currentColor" />
              {loading ? '正在启动…' : '运行示例研究'}
            </button>
            <button className="btn btn-ghost lg" onClick={() => navigate('/workflow')}>
              打开编排画布
              <ArrowRight size={15} />
            </button>
          </div>
          <div className="hero-meta">
            <span><Bot size={14} /> {data.stats.agents} 个 Agent</span>
            <span><BookOpen size={14} /> {data.stats.docs} 篇资料</span>
            <span><GitBranch size={14} /> 3 条并行研究线</span>
          </div>
        </div>
        <div className="hero-visual">
          <div className="loom-card">
            <div className="loom-card-top">
              <span>LIVE WORKFLOW</span>
              <Pill tone="green">READY</Pill>
            </div>
            <div className="loom-line">
              {agents.slice(0, 5).map((agent, index) => (
                <div className="loom-agent" key={agent.id}>
                  <span className="loom-index">0{index + 1}</span>
                  <span className="loom-dot" style={{ background: agent.color }} />
                  <div>
                    <strong>{agent.name}</strong>
                    <small>{agent.title}</small>
                  </div>
                </div>
              ))}
            </div>
            <div className="loom-thread">
              <span />
              <span />
              <span />
            </div>
            <div className="loom-card-foot">
              <span><BadgeCheck size={13} /> 引用核验</span>
              <span><GitBranch size={13} /> Self-Loop × 2</span>
              <span><Clock3 size={13} /> 约 40 秒</span>
            </div>
          </div>
          <div className="hero-stamp">
            <span>8</span>
            <small>ROLES<br />ONE FLOW</small>
          </div>
        </div>
      </section>

      <section className="stat-grid">
        <div className="stat-card">
          <div className="stat-icon"><Play size={16} /></div>
          <span>累计运行</span>
          <strong>{data.stats.runs}</strong>
          <small>每次运行都保留完整轨迹</small>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><TrendingUp size={16} /></div>
          <span>平均核查分</span>
          <strong>{data.stats.avgScore ? Math.round(data.stats.avgScore * 100) : '—'}<em>{data.stats.avgScore ? '%' : ''}</em></strong>
          <small>引用支持率的平均值</small>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><BookOpen size={16} /></div>
          <span>知识片段</span>
          <strong>{data.documents.reduce((sum, doc) => sum + doc.chunkCount, 0)}</strong>
          <small>{data.stats.docs} 篇资料，BM25 检索</small>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><Users size={16} /></div>
          <span>团队角色</span>
          <strong>{data.stats.agents}</strong>
          <small>{data.plugins.length} 个可挂载能力插件</small>
        </div>
      </section>

      <section className="overview-grid">
        <div className="panel run-panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">START A RUN</div>
              <h2>今天，让团队研究什么？</h2>
            </div>
            <span className="panel-badge">8 AGENTS</span>
          </div>
          <textarea
            className="run-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            rows={4}
            placeholder="输入一个需要多步研究、证据核验的复杂任务…"
          />
          <div className="run-panel-foot">
            <div className="run-hints">
              <span><BadgeCheck size={13} /> 自动核查</span>
              <span><GitBranch size={13} /> 三视角发散</span>
              <span><Network size={13} /> 失败回环</span>
            </div>
            <button className="btn btn-accent" onClick={start} disabled={loading || !input.trim()}>
              {loading ? '启动中…' : '开始研究'}
              <ArrowRight size={14} />
            </button>
          </div>
          {error && <div className="form-error">{error}</div>}
        </div>

        <div className="panel flow-panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">THE TEAM</div>
              <h2>一条流水线，三种思考深度</h2>
            </div>
            <button className="link-btn" onClick={() => navigate('/team')}>管理团队 <ArrowRight size={13} /></button>
          </div>
          <div className="team-mini">
            {agents.map((agent, index) => (
              <div className="team-mini-row" key={agent.id}>
                <span className="mini-num">{String(index + 1).padStart(2, '0')}</span>
                <span className="mini-dot" style={{ background: agent.color }} />
                <div className="mini-main">
                  <strong>{agent.name}</strong>
                  <small>{agent.title}</small>
                </div>
                {agent.plugins.includes('cognition.diverge') && <Pill tone="orange">发散</Pill>}
                {agent.plugins.includes('verify.citations') && <Pill tone="purple">核验</Pill>}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel recent-panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">RECENT RUNS</div>
            <h2>最近的执行</h2>
          </div>
          <button className="link-btn" onClick={() => navigate('/evals')}>查看评测 <ArrowRight size={13} /></button>
        </div>
        {data.runs.length === 0 ? (
          <div className="recent-empty">
            <Sparkles size={18} />
            <span>还没有运行记录。点击“运行示例研究”，第一份报告会在几十秒内生成。</span>
          </div>
        ) : (
          <div className="run-table">
            <div className="run-table-head">
              <span>运行</span><span>状态</span><span>核查分</span><span>Tokens</span><span>开始时间</span><span />
            </div>
            {data.runs.slice(0, 5).map((run) => (
              <button className="run-row" key={run.id} onClick={() => navigate(`/runs/${run.id}`)}>
                <span className="run-name">
                  <strong>{run.input.slice(0, 34)}…</strong>
                  <small>{run.id}</small>
                </span>
                <span><StatusPill status={run.status} /></span>
                <span>{run.score !== undefined ? <ScoreRing score={run.score} size={38} label="" /> : '—'}</span>
                <span className="mono">{run.tokens.toLocaleString()}</span>
                <span className="mono muted">{formatDate(run.startedAt)}</span>
                <span className="row-arrow"><ArrowRight size={14} /></span>
              </button>
            ))}
          </div>
        )}
      </section>

      {latest && (
        <div className="footnote">
          最近一次运行 <code>{latest.id}</code> · {latest.mode === 'live' ? 'Live 模型' : 'Mock 演示'} · 所有轨迹可在运行详情中回放。
        </div>
      )}
    </div>
  )
}
