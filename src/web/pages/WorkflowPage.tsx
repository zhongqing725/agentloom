import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowRight,
  Bot,
  GitBranch,
  Info,
  Play,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Users,
  Workflow,
} from 'lucide-react'
import { useApp } from '../App'
import { api } from '../api'
import { Modal, PageHeader, Pill, PluginIcon } from '../components/ui'
import { WorkflowGraph } from '../components/Graph'

export default function WorkflowPage() {
  const { data, refresh } = useApp()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('node'))
  const [runOpen, setRunOpen] = useState(false)
  const [input, setInput] = useState(
    '请生成一份面向投资决策的 AI 眼镜产业链研究报告，重点回答市场空间、价值链分配、竞争格局与主要风险。',
  )
  const [starting, setStarting] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settings, setSettings] = useState(data?.workflow.settings)
  const [error, setError] = useState('')

  useEffect(() => {
    if (data) setSettings(data.workflow.settings)
  }, [data])

  if (!data) return null

  const selectedNode = data.workflow.graph.nodes.find((node) => node.id === selectedId)
  const selectedAgent = selectedNode?.data.agentId
    ? data.agents.find((agent) => agent.id === selectedNode.data.agentId)
    : undefined

  const stats = useMemo(() => {
    const agents = data.workflow.graph.nodes.filter((node) => node.type === 'agent' || node.type === 'verifier').length
    const parallel = data.workflow.graph.nodes.filter((node) => node.id === 'market' || node.id === 'chain' || node.id === 'competition').length
    const loops = data.workflow.graph.edges.filter((edge) => edge.kind === 'loop').length
    return { agents, parallel, loops }
  }, [data])

  const start = async () => {
    setStarting(true)
    setError('')
    try {
      const { run } = await api.createRun(input)
      navigate(`/runs/${run.id}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '启动失败')
    } finally {
      setStarting(false)
    }
  }

  const persistPositions = async (nodeId: string, position: { x: number; y: number }) => {
    const graph = {
      ...data.workflow.graph,
      nodes: data.workflow.graph.nodes.map((node) =>
        node.id === nodeId ? { ...node, position } : node,
      ),
    }
    await api.updateWorkflow({ graph })
    await refresh()
  }

  const saveSettings = async () => {
    if (!settings) return
    await api.updateWorkflow({ settings })
    await refresh()
    setSettingsOpen(false)
  }

  const togglePlugin = async (pluginId: string) => {
    if (!selectedAgent) return
    const next = selectedAgent.plugins.includes(pluginId)
      ? selectedAgent.plugins.filter((id) => id !== pluginId)
      : [...selectedAgent.plugins, pluginId]
    await api.updateAgent(selectedAgent.id, { plugins: next })
    await refresh()
  }

  return (
    <div className="page workflow-page">
      <PageHeader
        eyebrow="ORCHESTRATION"
        title="编排画布"
        description="拖拽节点调整布局；每个节点都可以挂载能力插件。运行后，同一张图会变成实时执行状态。"
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => setSettingsOpen(true)}>
              <SlidersHorizontal size={15} /> 调度设置
            </button>
            <button className="btn btn-accent" onClick={() => setRunOpen(true)}>
              <Play size={14} fill="currentColor" /> 运行此流程
            </button>
          </>
        }
      />

      <div className="workflow-meta">
        <div className="flow-meta-item"><Bot size={15} /><strong>{stats.agents}</strong><span>个 Agent</span></div>
        <div className="flow-meta-item"><GitBranch size={15} /><strong>{stats.parallel}</strong><span>条并行研究线</span></div>
        <div className="flow-meta-item"><Workflow size={15} /><strong>{stats.loops}</strong><span>条回环</span></div>
        <div className="flow-meta-item"><Users size={15} /><strong>{data.workflow.settings.maxConcurrency}</strong><span>并发上限</span></div>
        <div className="flow-meta-note">
          <Info size={14} />
          <span>点击节点查看配置；拖动可调整布局，位置会自动保存。</span>
        </div>
      </div>

      <div className="workflow-layout">
        <div className="panel canvas-panel">
          <div className="canvas-toolbar">
            <div>
              <span className="canvas-title">{data.workflow.name}</span>
              <Pill tone="teal">LIVE GRAPH</Pill>
            </div>
            <div className="canvas-legend">
              <span><i className="legend-dot green" /> 完成</span>
              <span><i className="legend-dot teal" /> 运行</span>
              <span><i className="legend-line" /> 回环</span>
            </div>
          </div>
          <WorkflowGraph
            graph={data.workflow.graph}
            agents={data.agents}
            plugins={data.plugins}
            onNodeClick={setSelectedId}
            onNodeDragStop={persistPositions}
            height={610}
          />
        </div>

        <aside className="panel inspector">
          {selectedNode ? (
            <>
              <div className="inspector-head">
                <div className="eyebrow">NODE INSPECTOR</div>
                <h2>{selectedNode.data.label}</h2>
                <p>{selectedNode.data.subtitle}</p>
              </div>
              {selectedAgent ? (
                <>
                  <div className="inspector-agent">
                    <div className="agent-avatar" style={{ background: `${selectedAgent.color}18`, color: selectedAgent.color }}>
                      <Bot size={22} />
                    </div>
                    <div>
                      <strong>{selectedAgent.name}</strong>
                      <span>{selectedAgent.title}</span>
                    </div>
                  </div>
                  <div className="inspector-section">
                    <span className="inspector-label">模型</span>
                    <div className="inspector-value mono">{selectedAgent.model}</div>
                  </div>
                  <div className="inspector-section">
                    <span className="inspector-label">温度</span>
                    <div className="temp-bar">
                      <span style={{ width: `${selectedAgent.temperature * 100}%` }} />
                    </div>
                    <div className="inspector-value">{selectedAgent.temperature.toFixed(1)}</div>
                  </div>
                  <div className="inspector-section">
                    <span className="inspector-label">挂载插件 · 点击切换</span>
                    <div className="inspector-plugin-grid">
                      {data.plugins.map((plugin) => {
                        const active = selectedAgent.plugins.includes(plugin.id)
                        return (
                          <button
                            key={plugin.id}
                            className={`inspector-plugin ${active ? 'active' : ''}`}
                            style={{ '--plugin-color': plugin.color } as CSSProperties}
                            onClick={() => togglePlugin(plugin.id)}
                            title={plugin.description}
                          >
                            <PluginIcon name={plugin.icon} size={13} />
                            <span>{plugin.name}</span>
                            {active && <span className="inspector-plugin-check">✓</span>}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <div className="inspector-section">
                    <span className="inspector-label">System Prompt 摘要</span>
                    <p className="inspector-prompt">{selectedAgent.systemPrompt}</p>
                  </div>
                  <button className="btn btn-ghost full" onClick={() => navigate('/team')}>
                    在团队中编辑 <ArrowRight size={14} />
                  </button>
                </>
              ) : (
                <div className="inspector-empty">
                  <Sparkles size={18} />
                  <p>{selectedNode.type === 'input' ? '研究任务的入口节点。' : '可交付成果的输出节点。'}</p>
                </div>
              )}
            </>
          ) : (
            <div className="inspector-placeholder">
              <div className="inspector-mark">⌘</div>
              <h3>选择一个节点</h3>
              <p>查看它的角色、模型、挂载插件与提示词。点击画布上的任意 Agent 开始。</p>
              <div className="inspector-tip">
                <GitBranch size={14} />
                <span>试试点击「首席分析师」——它挂载了「发散思考」。</span>
              </div>
            </div>
          )}
        </aside>
      </div>

      <Modal
        open={runOpen}
        onClose={() => setRunOpen(false)}
        title="运行此流程"
        subtitle="8 个 Agent 会按当前画布执行；核查未通过时自动回到写作节点。"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setRunOpen(false)}>取消</button>
            <button className="btn btn-accent" onClick={start} disabled={starting}>
              {starting ? '启动中…' : '开始运行'}
            </button>
          </>
        }
      >
        <label className="field">
          <span>研究任务</span>
          <textarea rows={5} value={input} onChange={(event) => setInput(event.target.value)} />
        </label>
        {error && <div className="form-error">{error}</div>}
      </Modal>

      <Modal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="调度与验证设置"
        subtitle="这些参数会在下一次运行时生效。"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setSettingsOpen(false)}>取消</button>
            <button className="btn btn-accent" onClick={saveSettings}>保存设置</button>
          </>
        }
      >
        {settings && (
          <div className="settings-grid">
            <label className="field">
              <span>最大并发</span>
              <input
                type="number"
                min={1}
                max={8}
                value={settings.maxConcurrency}
                onChange={(event) => setSettings({ ...settings, maxConcurrency: Number(event.target.value) })}
              />
            </label>
            <label className="field">
              <span>最大回环次数</span>
              <input
                type="number"
                min={0}
                max={4}
                value={settings.maxLoop}
                onChange={(event) => setSettings({ ...settings, maxLoop: Number(event.target.value) })}
              />
            </label>
            <label className="field">
              <span>核查通过阈值</span>
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={settings.verifyThreshold}
                onChange={(event) => setSettings({ ...settings, verifyThreshold: Number(event.target.value) })}
              />
            </label>
            <label className="field">
              <span>预算上限（USD）</span>
              <input
                type="number"
                min={0}
                step={0.1}
                value={settings.budgetUsd}
                onChange={(event) => setSettings({ ...settings, budgetUsd: Number(event.target.value) })}
              />
            </label>
          </div>
        )}
      </Modal>
    </div>
  )
}
