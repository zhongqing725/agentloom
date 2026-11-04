import { useState } from 'react'
import {
  BadgeCheck,
  Bot,
  Brain,
  Check,
  ChevronRight,
  GitBranch,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Wrench,
} from 'lucide-react'
import { useApp } from '../App'
import { api } from '../api'
import { Modal, PageHeader, Pill, PluginIcon } from '../components/ui'
import type { Agent } from '../../shared/types'

const ROLE_LABEL: Record<string, string> = {
  planner: 'PLANNER',
  researcher: 'RESEARCHER',
  analyst: 'ANALYST',
  writer: 'WRITER',
  verifier: 'VERIFIER',
  editor: 'EDITOR',
}

export default function Team() {
  const { data, refresh } = useApp()
  const [selected, setSelected] = useState<Agent | null>(null)
  const [draft, setDraft] = useState<Agent | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!data) return null

  const edit = (agent: Agent) => {
    setSelected(agent)
    setDraft({ ...agent, plugins: [...agent.plugins] })
    setError('')
  }

  const save = async () => {
    if (!draft) return
    setSaving(true)
    setError('')
    try {
      await api.updateAgent(draft.id, {
        model: draft.model,
        temperature: draft.temperature,
        systemPrompt: draft.systemPrompt,
        plugins: draft.plugins,
        title: draft.title,
      })
      await refresh()
      setSelected(null)
      setDraft(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const togglePlugin = (id: string) => {
    if (!draft) return
    setDraft({
      ...draft,
      plugins: draft.plugins.includes(id) ? draft.plugins.filter((item) => item !== id) : [...draft.plugins, id],
    })
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="THE CREW"
        title="Agent 团队"
        description="8 个角色组成一条研究流水线。每个节点都可以挂载能力插件，改变它“想多深、怎么想”。"
        actions={
          <button className="btn btn-ghost" onClick={() => document.getElementById('plugin-library')?.scrollIntoView({ behavior: 'smooth' })}>
            <Plus size={15} /> 浏览插件库
          </button>
        }
      />

      <div className="team-summary">
        <div className="summary-quote">
          <Sparkles size={16} />
          <p>“不是让一个 Agent 什么都会，而是让每个节点在需要的时候，多一种思考方式。”</p>
        </div>
        <div className="summary-metrics">
          <div><strong>{data.agents.length}</strong><span>角色</span></div>
          <div><strong>{data.plugins.length}</strong><span>能力插件</span></div>
          <div><strong>{data.agents.filter((agent) => agent.plugins.length > 0).length}</strong><span>已挂载</span></div>
        </div>
      </div>

      <section className="agent-grid">
        {data.agents.map((agent, index) => (
          <article className="agent-card" key={agent.id} onClick={() => edit(agent)}>
            <div className="agent-accent" style={{ background: agent.color }} />
            <div className="agent-card-top">
              <div className="agent-avatar" style={{ background: `${agent.color}18`, color: agent.color }}>
                <Bot size={20} />
              </div>
              <div className="agent-title">
                <span className="agent-index">{String(index + 1).padStart(2, '0')}</span>
                <Pill tone="muted">{ROLE_LABEL[agent.role] ?? agent.role}</Pill>
              </div>
            </div>
            <h3>{agent.name}</h3>
            <p className="agent-tagline">{agent.title}</p>
            <p className="agent-desc">{agent.description}</p>
            <div className="agent-plugins">
              {agent.plugins.length === 0 && <span className="no-plugin">未挂载插件</span>}
              {agent.plugins.map((pluginId) => {
                const plugin = data.plugins.find((item) => item.id === pluginId)
                if (!plugin) return null
                return (
                  <span className="plugin-chip" key={pluginId} style={{ borderColor: `${plugin.color}55`, color: plugin.color }}>
                    <PluginIcon name={plugin.icon} /> {plugin.name}
                  </span>
                )
              })}
            </div>
            <div className="agent-foot">
              <span>{agent.model}</span>
              <span className="agent-temp">T {agent.temperature.toFixed(1)}</span>
              <ChevronRight size={14} />
            </div>
          </article>
        ))}
      </section>

      <section className="plugin-section" id="plugin-library">
        <div className="section-head">
          <div>
            <div className="eyebrow">CAPABILITY PLUGINS</div>
            <h2>能力插件库</h2>
          </div>
          <p>插件是“认知显卡”：插到任意节点上，改变这个节点的思考过程，而不是整个团队。</p>
        </div>
        <div className="plugin-grid">
          {data.plugins.map((plugin) => (
            <article className="plugin-card" key={plugin.id} style={{ borderTopColor: plugin.color }}>
              <div className="plugin-icon" style={{ background: `${plugin.color}14`, color: plugin.color }}>
                <PluginIcon name={plugin.icon} size={20} />
              </div>
              <div className="plugin-card-head">
                <h3>{plugin.name}</h3>
                <Pill tone="muted">{plugin.category}</Pill>
              </div>
              <p>{plugin.description}</p>
              <div className="plugin-meta">
                <span><Wrench size={12} /> 节点级挂载</span>
                <span><Check size={12} /> 可组合</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <Modal
        open={Boolean(selected && draft)}
        onClose={() => { setSelected(null); setDraft(null) }}
        title={draft?.name ?? ''}
        subtitle={draft?.title}
        wide
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => { setSelected(null); setDraft(null) }}>取消</button>
            <button className="btn btn-accent" onClick={save} disabled={saving}>{saving ? '保存中…' : '保存节点配置'}</button>
          </>
        }
      >
        {draft && (
          <div className="agent-editor">
            <div className="editor-main">
              <label className="field">
                <span>角色定位</span>
                <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
              </label>
              <label className="field">
                <span>System Prompt</span>
                <textarea
                  rows={7}
                  value={draft.systemPrompt}
                  onChange={(event) => setDraft({ ...draft, systemPrompt: event.target.value })}
                />
              </label>
              <div className="field-row">
                <label className="field">
                  <span>模型</span>
                  <input value={draft.model} onChange={(event) => setDraft({ ...draft, model: event.target.value })} />
                </label>
                <label className="field">
                  <span>温度 {draft.temperature.toFixed(1)}</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={draft.temperature}
                    onChange={(event) => setDraft({ ...draft, temperature: Number(event.target.value) })}
                  />
                </label>
              </div>
            </div>
            <aside className="editor-side">
              <div className="editor-side-head">
                <Brain size={15} />
                <strong>挂载能力</strong>
              </div>
              <p className="hint">同一个插件可以挂到不同节点。运行时，它会改变该节点的执行策略。</p>
              <div className="plugin-toggle-list">
                {data.plugins.map((plugin) => {
                  const active = draft.plugins.includes(plugin.id)
                  return (
                    <button
                      key={plugin.id}
                      className={`plugin-toggle ${active ? 'active' : ''}`}
                      onClick={() => togglePlugin(plugin.id)}
                    >
                      <span className="plugin-toggle-icon" style={{ color: plugin.color }}>
                        <PluginIcon name={plugin.icon} size={16} />
                      </span>
                      <span>
                        <strong>{plugin.name}</strong>
                        <small>{plugin.category}</small>
                      </span>
                      <span className={`toggle-check ${active ? 'on' : ''}`}>{active && <Check size={11} />}</span>
                    </button>
                  )
                })}
              </div>
              <div className="editor-note">
                <GitBranch size={14} />
                <span>建议只在关键节点挂载“发散思考”，避免每个节点都多想，推高延迟与成本。</span>
              </div>
            </aside>
          </div>
        )}
        {error && <div className="form-error">{error}</div>}
      </Modal>
    </div>
  )
}
