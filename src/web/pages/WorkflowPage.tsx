import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { Connection } from '@xyflow/react'
import {
  ArrowRight,
  Bot,
  GitBranch,
  GripVertical,
  Info,
  Play,
  Plus,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Users,
  Workflow,
} from 'lucide-react'
import { useApp } from '../App'
import { api } from '../api'
import { Modal, PageHeader, Pill, PluginIcon } from '../components/ui'
import { WorkflowGraph } from '../components/Graph'

const SPECIALISTS = [
  {
    name: '风险审查员',
    title: '独立审查风险、反方证据与下行情形',
    description: '在报告交付前加入一道独立审查，专门挑战主判断。',
    color: '#8C4A2F',
    plugins: ['cognition.critique'],
  },
  {
    name: '数据可视化师',
    title: '把关键数字整理成图表建议',
    description: '为市场、产业链和竞争章节生成可执行的图表规格。',
    color: '#2F6F6A',
    plugins: ['tool.calculator'],
  },
  {
    name: '合规审查员',
    title: '检查隐私、合规与对外表述',
    description: '检查引用、免责声明与可能引发合规风险的表述。',
    color: '#5B5F9E',
    plugins: ['verify.citations'],
  },
]

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
  const [addOpen, setAddOpen] = useState(false)
  const [specialistIndex, setSpecialistIndex] = useState(0)
  const [creating, setCreating] = useState(false)

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

  const saveGraph = async (graph: typeof data.workflow.graph) => {
    await api.updateWorkflow({ graph })
    await refresh()
  }

  const connect = async (connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return
    if (data.workflow.graph.edges.some((edge) => edge.source === connection.source && edge.target === connection.target)) return
    await saveGraph({
      ...data.workflow.graph,
      edges: [
        ...data.workflow.graph.edges,
        {
          id: `e-${connection.source}-${connection.target}-${Date.now()}`,
          source: connection.source,
          target: connection.target,
        },
      ],
    })
  }

  const removeNode = async (nodeId: string) => {
    const node = data.workflow.graph.nodes.find((item) => item.id === nodeId)
    if (!node || node.type === 'input' || node.type === 'output') return
    await saveGraph({
      nodes: data.workflow.graph.nodes.filter((item) => item.id !== nodeId),
      edges: data.workflow.graph.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
    })
    setSelectedId(null)
  }

  const removeEdges = async (edgeIds: string[]) => {
    const remove = new Set(edgeIds)
    await saveGraph({
      ...data.workflow.graph,
      edges: data.workflow.graph.edges.filter((edge) => !remove.has(edge.id)),
    })
  }

  const dropPlugin = useCallback(async (nodeId: string, pluginId: string) => {
    const node = data.workflow.graph.nodes.find((item) => item.id === nodeId)
    const agent = node?.data.agentId ? data.agents.find((item) => item.id === node.data.agentId) : undefined
    if (!agent || agent.plugins.includes(pluginId)) return
    await api.updateAgent(agent.id, { plugins: [...agent.plugins, pluginId] })
    await refresh()
  }, [data, refresh])

  const addSpecialist = async () => {
    const template = SPECIALISTS[specialistIndex]
    setCreating(true)
    setError('')
    try {
      const { agent } = await api.createAgent({
        name: template.name,
        title: template.title,
        description: template.description,
        color: template.color,
        plugins: template.plugins,
      })
      const newNodeId = `node-${agent.id}`
      const anchor = selectedNode && selectedNode.type !== 'input' ? selectedNode : data.workflow.graph.nodes.find((node) => node.id === 'writer')
      const outgoing = anchor
        ? data.workflow.graph.edges.filter((edge) => edge.kind !== 'loop' && edge.source === anchor.id)
        : []
      const next = outgoing[0]?.target
      const anchorPosition = anchor?.position ?? { x: 700, y: 500 }
      const nextNode = next ? data.workflow.graph.nodes.find((node) => node.id === next) : undefined
      const position = nextNode
        ? {
            x: (anchorPosition.x + nextNode.position.x) / 2,
            y: Math.max(anchorPosition.y, nextNode.position.y) + 115,
          }
        : { x: anchorPosition.x + 190, y: anchorPosition.y + 110 }
      const node = {
        id: newNodeId,
        type: 'agent' as const,
        position,
        data: {
          label: agent.name,
          subtitle: agent.title,
          agentId: agent.id,
          kind: 'agent' as const,
        },
      }
      const baseEdges = outgoing.length === 1
        ? data.workflow.graph.edges.filter((edge) => edge.id !== outgoing[0].id)
        : data.workflow.graph.edges
      const edges = anchor
        ? [
            ...baseEdges,
            { id: `e-${anchor.id}-${newNodeId}`, source: anchor.id, target: newNodeId },
            ...(next ? [{ id: `e-${newNodeId}-${next}`, source: newNodeId, target: next }] : []),
          ]
        : baseEdges
      await saveGraph({ nodes: [...data.workflow.graph.nodes, node], edges })
      setSelectedId(newNodeId)
      setAddOpen(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建 Agent 失败')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="page workflow-page">
      <PageHeader
        eyebrow="ORCHESTRATION"
        title="编排画布"
        description="拖动节点、连线，或把插件卡拖到节点上；运行后，同一张图会变成实时执行状态。"
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => setAddOpen(true)}>
              <Plus size={15} /> 添加 Agent
            </button>
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
          <div className="plugin-drawer">
            <span className="plugin-drawer-label"><GripVertical size={12} /> 拖一张插件卡到节点上</span>
            {data.plugins.map((plugin) => (
              <span
                className="plugin-drag"
                key={plugin.id}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData('text/plain', plugin.id)
                  event.dataTransfer.effectAllowed = 'copy'
                }}
                style={{ '--plugin-color': plugin.color } as CSSProperties}
                title={plugin.description}
              >
                <PluginIcon name={plugin.icon} size={12} />
                {plugin.name}
              </span>
            ))}
          </div>
          <WorkflowGraph
            graph={data.workflow.graph}
            agents={data.agents}
            plugins={data.plugins}
            onNodeClick={setSelectedId}
            onNodeDragStop={persistPositions}
            onConnect={connect}
            onNodesDelete={(nodeIds) => { for (const nodeId of nodeIds) void removeNode(nodeId) }}
            onEdgesDelete={(edgeIds) => void removeEdges(edgeIds)}
            onPluginDrop={dropPlugin}
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
                  {selectedNode.type !== 'input' && selectedNode.type !== 'output' && (
                    <button className="btn btn-ghost full inspector-delete" onClick={() => removeNode(selectedNode.id)}>
                      <Trash2 size={14} /> 从画布移除节点
                    </button>
                  )}
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
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="添加专家节点"
        subtitle="插入到当前选中节点之后；如果它只有一个下游，会自动接上，保持流程可运行。"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setAddOpen(false)}>取消</button>
            <button className="btn btn-accent" onClick={addSpecialist} disabled={creating}>
              {creating ? '正在创建…' : '创建并插入'}
            </button>
          </>
        }
      >
        <div className="specialist-grid">
          {SPECIALISTS.map((template, index) => (
            <button
              key={template.name}
              className={`specialist-card ${index === specialistIndex ? 'active' : ''}`}
              onClick={() => setSpecialistIndex(index)}
            >
              <span className="specialist-bar" style={{ background: template.color }} />
              <strong>{template.name}</strong>
              <p>{template.description}</p>
              <span className="specialist-plugins">
                {template.plugins.map((pluginId) => {
                  const plugin = data.plugins.find((item) => item.id === pluginId)
                  return plugin ? <span key={pluginId}><PluginIcon name={plugin.icon} size={11} /> {plugin.name}</span> : null
                })}
              </span>
            </button>
          ))}
        </div>
        <p className="hint">
          将插入到「{selectedNode?.data.label ?? '报告撰写师'}」之后；如果该节点有多个下游，只建立一条入边，之后可在画布上手动连线。
        </p>
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
