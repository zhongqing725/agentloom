import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { Connection } from '@xyflow/react'
import {
  ArrowRight,
  Bot,
  Check,
  GitBranch,
  GripVertical,
  Info,
  Link2,
  Play,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Users,
  Workflow,
  X,
} from 'lucide-react'
import { useApp } from '../App'
import { api } from '../api'
import { Modal, PageHeader, Pill, PluginIcon } from '../components/ui'
import { WorkflowGraph } from '../components/Graph'
import type { GraphNode, Workflow as WorkflowModel } from '../../shared/types'

type Graph = WorkflowModel['graph']
type Notice = { message: string; tone: 'ok' | 'warn' }
type SpecialistDraft = {
  name: string
  title: string
  description: string
  color: string
  plugins: string[]
}

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

function draftFromTemplate(index: number): SpecialistDraft {
  const template = SPECIALISTS[index] ?? SPECIALISTS[0]
  return { ...template, plugins: [...template.plugins] }
}

function createsCycle(edges: Graph['edges'], source: string, target: string) {
  const outgoing = new Map<string, string[]>()
  for (const edge of edges) {
    if (edge.kind === 'loop') continue
    const list = outgoing.get(edge.source) ?? []
    list.push(edge.target)
    outgoing.set(edge.source, list)
  }

  const stack = [target]
  const seen = new Set<string>()
  while (stack.length > 0) {
    const current = stack.pop()!
    if (current === source) return true
    if (seen.has(current)) continue
    seen.add(current)
    for (const next of outgoing.get(current) ?? []) stack.push(next)
  }
  return false
}

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
  const [templateIndex, setTemplateIndex] = useState(0)
  const [draft, setDraft] = useState<SpecialistDraft>(() => draftFromTemplate(0))
  const [insertAfter, setInsertAfter] = useState('writer')
  const [creating, setCreating] = useState(false)
  const [pluginBusy, setPluginBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const noticeTimer = useRef<number | undefined>(undefined)
  const graphBusy = useRef(false)

  useEffect(() => {
    if (data) setSettings(data.workflow.settings)
  }, [data])

  useEffect(() => {
    return () => {
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current)
    }
  }, [])

  const notify = useCallback((message: string, tone: Notice['tone'] = 'ok') => {
    setNotice({ message, tone })
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 3800)
  }, [])

  const saveGraph = useCallback(
    async (graph: Graph) => {
      if (graphBusy.current) {
        notify('正在保存上一步改动，请稍候。', 'warn')
        return false
      }
      graphBusy.current = true
      try {
        await api.updateWorkflow({ graph })
        await refresh()
        return true
      } catch (cause) {
        notify(cause instanceof Error ? cause.message : '画布保存失败。', 'warn')
        return false
      } finally {
        graphBusy.current = false
      }
    },
    [notify, refresh],
  )

  const dropPlugin = useCallback(
    async (nodeId: string, pluginId: string) => {
      if (!data) return
      const node = data.workflow.graph.nodes.find((item) => item.id === nodeId)
      const agent = node?.data.agentId ? data.agents.find((item) => item.id === node.data.agentId) : undefined
      const plugin = data.plugins.find((item) => item.id === pluginId)
      if (!agent || !plugin) {
        notify('这个节点没有可挂载插件的 Agent。', 'warn')
        return
      }
      if (agent.plugins.includes(pluginId)) {
        notify(`「${agent.name}」已经挂载了「${plugin.name}」。`, 'warn')
        return
      }
      if (pluginBusy) return
      setPluginBusy(pluginId)
      try {
        await api.updateAgent(agent.id, { plugins: [...agent.plugins, pluginId] })
        await refresh()
        notify(`已将「${plugin.name}」挂载到「${agent.name}」。`)
      } catch (cause) {
        notify(cause instanceof Error ? cause.message : '插件挂载失败。', 'warn')
      } finally {
        setPluginBusy(null)
      }
    },
    [data, notify, pluginBusy, refresh],
  )

  if (!data) return null

  const graph = data.workflow.graph
  const flowEdges = graph.edges.filter((edge) => edge.kind !== 'loop')
  const selectedNode = graph.nodes.find((node) => node.id === selectedId)
  const selectedAgent = selectedNode?.data.agentId
    ? data.agents.find((agent) => agent.id === selectedNode.data.agentId)
    : undefined
  const relatedEdges = selectedNode
    ? graph.edges.filter((edge) => edge.source === selectedNode.id || edge.target === selectedNode.id)
    : []
  const insertionTargets = graph.nodes.filter(
    (node) =>
      node.type !== 'input' &&
      node.type !== 'output' &&
      flowEdges.filter((edge) => edge.source === node.id).length === 1,
  )

  const stats = {
    agents: graph.nodes.filter((node) => node.type === 'agent' || node.type === 'verifier').length,
    edges: graph.edges.length,
    loops: graph.edges.filter((edge) => edge.kind === 'loop').length,
  }

  const nodeLabel = (id: string) => graph.nodes.find((node) => node.id === id)?.data.label ?? id
  const nextNodeOf = (id: string) => {
    const edge = flowEdges.find((item) => item.source === id)
    return edge ? graph.nodes.find((node) => node.id === edge.target) : undefined
  }
  const insertAnchor = graph.nodes.find((node) => node.id === insertAfter)
  const insertBefore = nextNodeOf(insertAfter)

  const openAdd = () => {
    const preferred =
      selectedId && insertionTargets.some((node) => node.id === selectedId)
        ? selectedId
        : insertionTargets.find((node) => node.id === 'writer')?.id ?? insertionTargets[0]?.id ?? ''
    setInsertAfter(preferred)
    setTemplateIndex(0)
    setDraft(draftFromTemplate(0))
    setError('')
    setAddOpen(true)
  }

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

  const saveSettings = async () => {
    if (!settings) return
    try {
      await api.updateWorkflow({ settings })
      await refresh()
      setSettingsOpen(false)
      notify('调度设置已保存，将在下一次运行时生效。')
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : '设置保存失败。', 'warn')
    }
  }

  const togglePlugin = async (pluginId: string) => {
    if (!selectedAgent) {
      notify('先在画布上点选一个 Agent 节点，再点击插件。', 'warn')
      return
    }
    if (pluginBusy) return
    const plugin = data.plugins.find((item) => item.id === pluginId)
    const active = selectedAgent.plugins.includes(pluginId)
    const next = active
      ? selectedAgent.plugins.filter((id) => id !== pluginId)
      : [...selectedAgent.plugins, pluginId]
    setPluginBusy(pluginId)
    try {
      await api.updateAgent(selectedAgent.id, { plugins: next })
      await refresh()
      notify(
        active
          ? `已从「${selectedAgent.name}」卸下「${plugin?.name ?? pluginId}」。`
          : `已将「${plugin?.name ?? pluginId}」挂载到「${selectedAgent.name}」。`,
      )
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : '插件更新失败。', 'warn')
    } finally {
      setPluginBusy(null)
    }
  }

  const persistPositions = async (nodeId: string, position: { x: number; y: number }) => {
    await saveGraph({
      ...graph,
      nodes: graph.nodes.map((node) => (node.id === nodeId ? { ...node, position } : node)),
    })
  }

  const connect = async (connection: Connection) => {
    const source = connection.source
    const target = connection.target
    if (!source || !target) return
    if (source === target) {
      notify('不能把节点连接到它自己。', 'warn')
      return
    }
    if (flowEdges.some((edge) => edge.source === source && edge.target === target)) {
      notify('这两个节点之间已经有一条连线。', 'warn')
      return
    }
    if (createsCycle(graph.edges, source, target)) {
      notify('这条连线会形成环路，DAG 无法调度；请改接其他节点。', 'warn')
      return
    }
    const ok = await saveGraph({
      ...graph,
      edges: [
        ...graph.edges,
        {
          id: `e-${source}-${target}-${Date.now().toString(36)}`,
          source,
          target,
          kind: 'flow',
        },
      ],
    })
    if (ok) notify(`已连接「${nodeLabel(source)}」→「${nodeLabel(target)}」。`)
  }

  const removeNodes = async (nodeIds: string[]) => {
    const ids = new Set(nodeIds)
    const removable = graph.nodes.filter(
      (node) => ids.has(node.id) && node.type !== 'input' && node.type !== 'output',
    )
    if (removable.length === 0) {
      notify('输入与研究结论节点是流程边界，不能删除。', 'warn')
      return
    }
    const removeIds = new Set(removable.map((node) => node.id))
    let edges = graph.edges.filter((edge) => !removeIds.has(edge.source) && !removeIds.has(edge.target))
    let bridged = 0

    for (const node of removable) {
      const incoming = graph.edges.filter(
        (edge) =>
          edge.kind !== 'loop' &&
          edge.target === node.id &&
          !removeIds.has(edge.source),
      )
      const outgoing = graph.edges.filter(
        (edge) =>
          edge.kind !== 'loop' &&
          edge.source === node.id &&
          !removeIds.has(edge.target),
      )
      if (incoming.length !== 1 || outgoing.length !== 1) continue
      const source = incoming[0].source
      const target = outgoing[0].target
      if (source === target) continue
      if (edges.some((edge) => edge.kind !== 'loop' && edge.source === source && edge.target === target)) continue
      if (createsCycle(edges, source, target)) continue
      edges = [
        ...edges,
        {
          id: `e-${source}-${target}-${Date.now().toString(36)}`,
          source,
          target,
          kind: 'flow',
        },
      ]
      bridged += 1
    }

    const ok = await saveGraph({
      nodes: graph.nodes.filter((node) => !removeIds.has(node.id)),
      edges,
    })
    if (!ok) return
    if (selectedId && removeIds.has(selectedId)) setSelectedId(null)
    const kept = [...ids].filter((id) => !removeIds.has(id)).length
    const baseMessage =
      removable.length === 1
        ? `已移除「${removable[0].data.label}」`
        : `已移除 ${removable.length} 个节点`
    notify(
      `${baseMessage}${bridged > 0 ? `，并自动接回 ${bridged} 处上下游。` : '，请检查剩余连线。'}`,
      kept > 0 ? 'warn' : 'ok',
    )
  }

  const removeEdges = async (edgeIds: string[]) => {
    const ids = new Set(edgeIds)
    const existing = graph.edges.filter((edge) => ids.has(edge.id))
    if (existing.length === 0) return
    const ok = await saveGraph({
      ...graph,
      edges: graph.edges.filter((edge) => !ids.has(edge.id)),
    })
    if (ok) notify(existing.length === 1 ? '已断开这条连线。' : `已断开 ${existing.length} 条连线。`)
  }

  const addSpecialist = async () => {
    const name = draft.name.trim()
    const title = draft.title.trim()
    if (!name || !title) {
      setError('请填写 Agent 名称与一句话职责。')
      return
    }
    const anchor = graph.nodes.find((node) => node.id === insertAfter)
    const outgoing = flowEdges.filter((edge) => edge.source === insertAfter)
    const nextEdge = outgoing[0]
    const nextNode = nextEdge ? graph.nodes.find((node) => node.id === nextEdge.target) : undefined
    if (!anchor || !nextNode) {
      setError('这个插入位置没有可用的单一上游/下游路径，请重新选择。')
      return
    }
    setCreating(true)
    setError('')
    try {
      const { agent } = await api.createAgent({
        name,
        title,
        description: draft.description,
        color: draft.color,
        plugins: draft.plugins,
      })
      const newNodeId = `node-${agent.id}`
      const step = 205
      const shiftIds = new Set<string>([nextNode.id])
      let changed = true
      while (changed) {
        changed = false
        for (const edge of flowEdges) {
          if (shiftIds.has(edge.source) && !shiftIds.has(edge.target)) {
            shiftIds.add(edge.target)
            changed = true
          }
        }
      }
      const nodes = graph.nodes.map((node) =>
        shiftIds.has(node.id)
          ? { ...node, position: { x: node.position.x + step, y: node.position.y } }
          : node,
      )
      const newNode: GraphNode = {
        id: newNodeId,
        type: 'agent',
        position: { x: nextNode.position.x, y: nextNode.position.y },
        data: {
          label: agent.name,
          subtitle: agent.title,
          agentId: agent.id,
          kind: 'agent',
        },
      }
      const ok = await saveGraph({
        nodes: [...nodes, newNode],
        edges: [
          ...graph.edges.filter((edge) => edge.id !== nextEdge.id),
          { id: `e-${anchor.id}-${newNodeId}`, source: anchor.id, target: newNodeId, kind: 'flow' },
          { id: `e-${newNodeId}-${nextNode.id}`, source: newNodeId, target: nextNode.id, kind: 'flow' },
        ],
      })
      if (!ok) {
        setError('Agent 已创建，但插入画布失败。可打开「添加 Agent」重新尝试。')
        return
      }
      setSelectedId(newNodeId)
      setAddOpen(false)
      notify(`已添加「${agent.name}」，插在「${anchor.data.label}」之后。`)
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
        description="拖动节点、从端口拉线，或把插件卡拖到节点上；选中连线即可删除。运行后，同一张图会变成实时执行状态。"
        actions={
          <>
            <button className="btn btn-ghost" onClick={openAdd}>
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
        <div className="flow-meta-item"><Link2 size={15} /><strong>{stats.edges}</strong><span>条连线</span></div>
        <div className="flow-meta-item"><Workflow size={15} /><strong>{stats.loops}</strong><span>条回环</span></div>
        <div className="flow-meta-item"><Users size={15} /><strong>{data.workflow.settings.maxConcurrency}</strong><span>并发上限</span></div>
        <div className="flow-meta-note">
          <Info size={14} />
          <span>拖动节点调整布局并自动保存；按 Delete 可删除选中的连线或节点。</span>
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
              <span className="legend-tip">点连线后可删除</span>
            </div>
          </div>
          <div className="plugin-drawer">
            <span className="plugin-drawer-label">
              <GripVertical size={12} />
              {selectedAgent
                ? `拖到节点，或点击挂载到「${selectedAgent.name}」`
                : '拖一张插件卡到节点上，或先选中节点再点击'}
            </span>
            {data.plugins.map((plugin) => {
              const active = Boolean(selectedAgent?.plugins.includes(plugin.id))
              return (
                <span
                  role="button"
                  tabIndex={0}
                  aria-pressed={active}
                  aria-disabled={pluginBusy === plugin.id}
                  className={`plugin-drag ${active ? 'active' : ''}`}
                  key={plugin.id}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData('text/plain', plugin.id)
                    event.dataTransfer.effectAllowed = 'copy'
                  }}
                  onClick={() => void togglePlugin(plugin.id)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    event.preventDefault()
                    void togglePlugin(plugin.id)
                  }}
                  style={{ '--plugin-color': plugin.color } as CSSProperties}
                  title={`${plugin.description}${selectedAgent ? ' · 点击切换挂载' : ''}`}
                >
                  <PluginIcon name={plugin.icon} size={12} />
                  {plugin.name}
                  {active && <Check size={10} />}
                </span>
              )
            })}
          </div>
          <WorkflowGraph
            graph={graph}
            agents={data.agents}
            plugins={data.plugins}
            onNodeClick={setSelectedId}
            onNodeDragStop={persistPositions}
            onConnect={connect}
            onNodesDelete={(nodeIds) => void removeNodes(nodeIds)}
            onEdgesDelete={(edgeIds) => void removeEdges(edgeIds)}
            onPluginDrop={dropPlugin}
            height={610}
          />
        </div>

        <aside className={`panel inspector ${selectedNode ? 'is-open' : ''}`}>
          {selectedNode ? (
            <>
              <div className="inspector-head">
                <div className="inspector-head-row">
                  <div className="eyebrow">NODE INSPECTOR</div>
                  <button
                    className="icon-btn inspector-close"
                    onClick={() => setSelectedId(null)}
                    aria-label="关闭节点配置"
                  >
                    <X size={14} />
                  </button>
                </div>
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
                            onClick={() => void togglePlugin(plugin.id)}
                            disabled={pluginBusy === plugin.id}
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
                </>
              ) : (
                <div className="inspector-empty">
                  <Sparkles size={18} />
                  <p>
                    {selectedNode.type === 'input'
                      ? '研究任务的入口节点，不可删除。'
                      : '可交付成果的出口节点，不可删除。'}
                  </p>
                </div>
              )}

              <div className="inspector-section">
                <span className="inspector-label">连线 · {relatedEdges.length}</span>
                <div className="inspector-links">
                  {relatedEdges.map((edge) => (
                    <div className={`inspector-link ${edge.kind === 'loop' ? 'loop' : ''}`} key={edge.id}>
                      <span className="inspector-link-nodes">
                        <span>{nodeLabel(edge.source)}</span>
                        <ArrowRight size={10} />
                        <span>{nodeLabel(edge.target)}</span>
                      </span>
                      {edge.kind === 'loop' && <em>回环</em>}
                      <button
                        className="inspector-unlink"
                        onClick={() => void removeEdges([edge.id])}
                        title="删除这条连线"
                        aria-label="删除这条连线"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  {relatedEdges.length === 0 && <p className="inspector-link-hint">这个节点还没有连线。</p>}
                </div>
                <p className="inspector-link-hint">从节点右侧圆点拖到另一个节点左侧即可连线；形成环路会被拦截。</p>
              </div>

              {selectedAgent && (
                <button className="btn btn-ghost full" onClick={() => navigate('/team')}>
                  在团队中编辑 <ArrowRight size={14} />
                </button>
              )}
              {selectedNode.type !== 'input' && selectedNode.type !== 'output' && (
                <button
                  className="btn btn-ghost full inspector-delete"
                  onClick={() => void removeNodes([selectedNode.id])}
                >
                  <Trash2 size={14} /> 从画布移除节点
                </button>
              )}
            </>
          ) : (
            <div className="inspector-placeholder">
              <div className="inspector-mark">⌘</div>
              <h3>选择一个节点</h3>
              <p>查看角色、模型、挂载插件与提示词。也可以直接点插件卡挂载，或从端口拉线。</p>
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
        subtitle={`${stats.agents} 个 Agent 会按当前画布执行；核查未通过时自动回到写作节点。`}
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
        <p className="hint">运行会即时开始，执行状态通过 SSE 同步到运行页。</p>
        {error && <div className="form-error">{error}</div>}
      </Modal>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="添加 Agent"
        subtitle="选择模板并确认插入位置。新 Agent 会接在所选节点之后，原有下游节点整体右移。"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setAddOpen(false)}>取消</button>
            <button
              className="btn btn-accent"
              onClick={() => void addSpecialist()}
              disabled={creating || !insertAfter || !draft.name.trim() || !draft.title.trim()}
            >
              {creating ? '正在创建…' : '创建并插入'}
            </button>
          </>
        }
      >
        <div className="specialist-grid">
          {SPECIALISTS.map((template, index) => (
            <button
              key={template.name}
              className={`specialist-card ${index === templateIndex ? 'active' : ''}`}
              onClick={() => {
                setTemplateIndex(index)
                setDraft(draftFromTemplate(index))
              }}
            >
              <span className="specialist-bar" style={{ background: template.color }} />
              {index === templateIndex && <span className="specialist-check"><Check size={11} /></span>}
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

        <div className="field-row add-agent-fields">
          <label className="field">
            <span>Agent 名称</span>
            <input
              value={draft.name}
              maxLength={24}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="例如：风险审查员"
            />
          </label>
          <label className="field">
            <span>一句话职责</span>
            <input
              value={draft.title}
              maxLength={48}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              placeholder="它负责补充哪一类判断"
            />
          </label>
        </div>

        <label className="field">
          <span>插入位置</span>
          <select value={insertAfter} onChange={(event) => setInsertAfter(event.target.value)}>
            {insertionTargets.map((node) => (
              <option key={node.id} value={node.id}>
                {node.data.label} 之后{nextNodeOf(node.id) ? ` / ${nextNodeOf(node.id)!.data.label} 之前` : ''}
              </option>
            ))}
          </select>
        </label>
        {insertAnchor && insertBefore && (
          <div className="insert-preview">
            <span>{insertAnchor.data.label}</span>
            <ArrowRight size={12} />
            <strong>{draft.name.trim() || '新 Agent'}</strong>
            <ArrowRight size={12} />
            <span>{insertBefore.data.label}</span>
          </div>
        )}

        <div className="draft-plugin-block">
          <span className="inspector-label">预挂插件</span>
          <div className="draft-plugins">
            {data.plugins.map((plugin) => {
              const active = draft.plugins.includes(plugin.id)
              return (
                <button
                  key={plugin.id}
                  className={`draft-plugin ${active ? 'active' : ''}`}
                  style={{ '--plugin-color': plugin.color } as CSSProperties}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      plugins: active
                        ? draft.plugins.filter((id) => id !== plugin.id)
                        : [...draft.plugins, plugin.id],
                    })
                  }
                >
                  <PluginIcon name={plugin.icon} size={12} />
                  {plugin.name}
                  {active && <Check size={10} />}
                </button>
              )
            })}
          </div>
        </div>
        <p className="hint">
          名称与职责可以改写；其他模型参数沿用模板。新节点会获得唯一 ID，便于在运行轨迹里追踪。
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

      {notice && (
        <div className={`app-toast ${notice.tone}`} role="status" aria-live="polite">
          <span className="app-toast-icon">
            {notice.tone === 'ok' ? <Check size={13} /> : <Info size={13} />}
          </span>
          <span>{notice.message}</span>
          <button onClick={() => setNotice(null)} aria-label="关闭提示"><X size={12} /></button>
        </div>
      )}
    </div>
  )
}
