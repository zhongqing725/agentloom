import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { Connection } from '@xyflow/react'
import {
  RiAddLine,
  RiArrowRightLine,
  RiArrowRightSLine,
  RiCheckLine,
  RiCloseLine,
  RiDeleteBin6Line,
  RiDraggable,
  RiErrorWarningLine,
  RiFlashlightLine,
  RiInformationLine,
  RiLinkM,
  RiPlayLargeLine,
  RiRefreshLine,
  RiRobot2Line,
  RiSettings3Line,
  RiSparklingLine,
} from '@remixicon/react'
import { useApp } from '../App'
import { api } from '../api'
import { Badge } from '@/components/base/badges/badge'
import { Button } from '@/components/base/buttons/button'
import { IconButton } from '@/components/base/buttons/icon-button'
import { Input } from '@/components/base/input/input'
import { Switch } from '@/components/base/switch/switch'
import { Textarea } from '@/components/base/textarea/textarea'
import { Tooltip, TooltipTrigger } from '@/components/base/tooltip/tooltip'
import { cx } from '@/utils/cx'
import {
  Modal,
  PageHeader,
  PluginIcon,
  pluginIconComponent,
  Surface,
} from '../components/ui'
import { WorkflowGraph } from '../components/Graph'
import type { GraphNode, Workflow as WorkflowModel } from '../../shared/types'

type Graph = WorkflowModel['graph']
type Notice = { message: string; tone: 'ok' | 'warn' }
type SpecialistDraft = {
  name: string
  title: string
  description: string
  plugins: string[]
}

const SPECIALISTS = [
  {
    name: '风险审查员',
    title: '独立审查风险、反方证据与下行情形',
    description: '在报告交付前加入一道独立审查，专门挑战主判断。',
    plugins: ['cognition.critique'],
  },
  {
    name: '数据可视化师',
    title: '把关键数字整理成图表建议',
    description: '为市场、产业链和竞争章节生成可执行的图表规格。',
    plugins: ['tool.calculator'],
  },
  {
    name: '合规审查员',
    title: '检查隐私、合规与对外表述',
    description: '检查引用、免责声明与可能引发合规风险的表述。',
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
    <div className="app-page">
      <PageHeader
        eyebrow="Orchestration"
        title="编排画布"
        description="拖动节点、从端口拉线，或把插件卡拖到节点上。运行后，同一张图会变成实时执行状态。"
        actions={
          <>
            <Button variant="secondary" leadingIcon={RiAddLine} onClick={openAdd}>添加 Agent</Button>
            <Button variant="secondary" leadingIcon={RiSettings3Line} onClick={() => setSettingsOpen(true)}>调度设置</Button>
            <Button leadingIcon={RiPlayLargeLine} onClick={() => setRunOpen(true)}>运行此流程</Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-separator-border pb-3 text-caption-1-medium text-text-secondary">
        <span className="inline-flex items-center gap-1.5"><RiRobot2Line className="size-4 text-accent-600" /> <strong className="font-semibold text-text-primary">{stats.agents}</strong> 个 Agent</span>
        <span className="inline-flex items-center gap-1.5"><RiLinkM className="size-4 text-accent-600" /> <strong className="font-semibold text-text-primary">{stats.edges}</strong> 条连线</span>
        <span className="inline-flex items-center gap-1.5"><RiRefreshLine className="size-4 text-accent-600" /> <strong className="font-semibold text-text-primary">{stats.loops}</strong> 条回环</span>
        <span className="inline-flex items-center gap-1.5"><RiFlashlightLine className="size-4 text-accent-600" /> 并发 <strong className="font-semibold text-text-primary">{data.workflow.settings.maxConcurrency}</strong></span>
        <span className="ms-auto hidden items-center gap-1.5 text-text-tertiary xl:flex">
          <RiInformationLine className="size-3.5" /> 拖动自动保存；按 Delete 删除选中的连线或节点
        </span>
      </div>

      <div className="relative">
        <Surface className="overflow-hidden p-0">
          <div className="flex items-center justify-between gap-4 border-b border-separator-border px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="text-body-2-medium text-text-primary">{data.workflow.name}</span>
              <span className="inline-flex items-center gap-1.5 text-caption-2-semibold uppercase tracking-[0.12em] text-status-lime-text">
                <span className="size-1.5 rounded-full bg-current" /> Live graph
              </span>
            </div>
            <div className="hidden items-center gap-3 text-caption-2-medium text-text-tertiary sm:flex">
              <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-status-lime-text" /> 完成</span>
              <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-accent-500" /> 运行</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-px w-3 border-t border-dashed border-accent-500" /> 回环</span>
            </div>
          </div>
          <div className="hide-scrollbar flex items-center gap-2 overflow-x-auto border-b border-separator-border bg-background-secondary-default px-4 py-2.5">
            <span className="flex shrink-0 items-center gap-1.5 pe-1 text-caption-1-regular text-text-tertiary">
              <RiDraggable className="size-3.5" aria-hidden />
              {selectedAgent ? `点击挂载到「${selectedAgent.name}」` : '拖到节点，或先选中节点'}
            </span>
            {data.plugins.map((plugin) => {
              const active = Boolean(selectedAgent?.plugins.includes(plugin.id))
              const Icon = pluginIconComponent(plugin.icon)
              return (
                <Button
                  key={plugin.id}
                  variant={active ? 'secondary' : 'ghost'}
                  size="xs"
                  draggable
                  leadingIcon={Icon}
                  trailingIcon={active ? RiCheckLine : undefined}
                  aria-pressed={active}
                  className={cx(
                    'shrink-0 rounded-full border px-2.5',
                    active ? 'border-accent-300 text-accent-700' : 'border-transparent text-text-secondary',
                    'cursor-grab',
                  )}
                  onDragStart={(event) => {
                    event.dataTransfer.setData('text/plain', plugin.id)
                    event.dataTransfer.effectAllowed = 'copy'
                  }}
                  onClick={() => void togglePlugin(plugin.id)}
                  title={`${plugin.description}${selectedAgent ? ' · 点击切换挂载' : ''}`}
                >
                  {plugin.name}
                </Button>
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
            focusNodeId={selectedNode?.id ?? null}
            height={610}
          />
        </Surface>

        {selectedNode && (
          <Surface
            as="aside"
            className={cx(
              'fixed inset-x-2 bottom-2 z-50 max-h-[72dvh] overflow-y-auto rounded-3xl border border-separator-border bg-background-primary-default p-5 shadow-2xl backdrop-blur-2xl',
              'lg:absolute lg:bottom-4 lg:end-4 lg:left-auto lg:top-[106px] lg:z-20 lg:max-h-none lg:w-[350px] lg:p-5',
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-caption-1-semibold uppercase tracking-[0.16em] text-accent-600">Node inspector</div>
                <h2 className="mt-1.5 text-title-2-semibold text-text-primary">{selectedNode.data.label}</h2>
                <p className="mt-0.5 text-caption-1-regular text-text-tertiary">{selectedNode.data.subtitle}</p>
              </div>
              <IconButton icon={RiCloseLine} size="small" aria-label="关闭节点配置" onClick={() => setSelectedId(null)} />
            </div>

            {selectedAgent ? (
              <>
                <div className="mt-5 flex items-center gap-3 rounded-2xl bg-background-tertiary-default p-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-accent-50 text-accent-600">
                    <RiRobot2Line className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-body-2-medium text-text-primary">{selectedAgent.name}</div>
                    <div className="truncate text-caption-1-regular text-text-tertiary">{selectedAgent.title}</div>
                  </div>
                  <Badge color="neutral" className="ms-auto">{selectedAgent.plugins.length}</Badge>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-separator-border p-3">
                    <div className="text-caption-2-semibold uppercase tracking-[0.1em] text-text-tertiary">模型</div>
                    <div className="mt-1 truncate font-mono text-caption-1-medium text-text-primary">{selectedAgent.model}</div>
                  </div>
                  <div className="rounded-xl border border-separator-border p-3">
                    <div className="text-caption-2-semibold uppercase tracking-[0.1em] text-text-tertiary">温度</div>
                    <div className="mt-1 font-mono text-caption-1-medium text-text-primary">{selectedAgent.temperature.toFixed(1)}</div>
                  </div>
                </div>

                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-caption-1-semibold text-text-secondary">挂载插件</span>
                    <span className="text-caption-2-regular text-text-tertiary">{selectedAgent.plugins.length}/{data.plugins.length}</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {data.plugins.map((plugin) => {
                      const active = selectedAgent.plugins.includes(plugin.id)
                      return (
                        <div key={plugin.id} className="flex items-center gap-2.5 rounded-xl border border-separator-border px-2.5 py-2">
                          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-background-tertiary-default text-accent-600">
                            <PluginIcon name={plugin.icon} size={14} />
                          </span>
                          <span className="min-w-0 flex-1 truncate text-caption-1-medium text-text-primary">{plugin.name}</span>
                          <Switch
                            aria-label={`${active ? '卸下' : '挂载'} ${plugin.name}`}
                            size="sm"
                            isSelected={active}
                            isDisabled={pluginBusy === plugin.id}
                            onChange={() => void togglePlugin(plugin.id)}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="mt-5 border-t border-separator-border pt-4">
                  <div className="text-caption-1-semibold text-text-secondary">System Prompt</div>
                  <p className="mt-1.5 line-clamp-5 text-caption-1-regular leading-relaxed text-text-tertiary">
                    {selectedAgent.systemPrompt}
                  </p>
                </div>
              </>
            ) : (
              <div className="mt-5 flex gap-2 rounded-2xl bg-background-secondary-default p-3 text-caption-1-regular leading-relaxed text-text-secondary">
                <RiSparklingLine className="mt-0.5 size-4 shrink-0 text-accent-600" aria-hidden />
                {selectedNode.type === 'input' ? '研究任务的入口节点，不可删除。' : '可交付成果的出口节点，不可删除。'}
              </div>
            )}

            <div className="mt-5 border-t border-separator-border pt-4">
              <div className="flex items-center justify-between">
                <span className="text-caption-1-semibold text-text-secondary">连线</span>
                <span className="text-caption-2-regular text-text-tertiary">{relatedEdges.length}</span>
              </div>
              <div className="mt-2 flex flex-col gap-1.5">
                {relatedEdges.map((edge) => (
                  <div
                    key={edge.id}
                    className={cx(
                      'flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-caption-1-regular',
                      edge.kind === 'loop' ? 'border-accent-200 bg-accent-50' : 'border-separator-border',
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate text-text-secondary">{nodeLabel(edge.source)}</span>
                    <RiArrowRightLine className="size-3.5 shrink-0 text-accent-600" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-text-secondary">{nodeLabel(edge.target)}</span>
                    {edge.kind === 'loop' && <span className="shrink-0 text-caption-2-semibold text-accent-700">回环</span>}
                    <TooltipTrigger>
                      <IconButton
                        icon={RiCloseLine}
                        size="small"
                        aria-label="删除这条连线"
                        onClick={() => void removeEdges([edge.id])}
                        className="size-6 border-transparent bg-transparent text-text-tertiary shadow-none hover:text-status-rose-text"
                      />
                      <Tooltip>删除连线</Tooltip>
                    </TooltipTrigger>
                  </div>
                ))}
                {relatedEdges.length === 0 && <p className="text-caption-2-regular text-text-tertiary">这个节点还没有连线。</p>}
              </div>
              <p className="mt-2 text-caption-2-regular leading-relaxed text-text-tertiary">
                从节点右侧圆点拖到另一个节点左侧即可连线；形成环路会被拦截。
              </p>
            </div>

            <div className="mt-5 flex flex-col gap-2">
              {selectedAgent && (
                <Button variant="secondary" trailingIcon={RiArrowRightLine} onClick={() => navigate('/team')}>
                  在团队中编辑
                </Button>
              )}
              {selectedNode.type !== 'input' && selectedNode.type !== 'output' && (
                <Button
                  variant="ghost"
                  leadingIcon={RiDeleteBin6Line}
                  onClick={() => void removeNodes([selectedNode.id])}
                  className="text-status-rose-text hover:bg-status-rose-background"
                >
                  从画布移除节点
                </Button>
              )}
            </div>
          </Surface>
        )}
      </div>

      <Modal
        open={runOpen}
        onClose={() => setRunOpen(false)}
        title="运行此流程"
        subtitle={`${stats.agents} 个 Agent 会按当前画布执行；核查未通过时自动回到写作节点。`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRunOpen(false)}>取消</Button>
            <Button onClick={() => void start()} disabled={starting}>{starting ? '启动中…' : '开始运行'}</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Textarea label="研究任务" rows={5} value={input} onChange={setInput} />
          <p className="text-caption-1-regular text-text-tertiary">运行会即时开始，执行状态通过 SSE 同步到运行页。</p>
          {error && <p className="text-caption-1-medium text-status-rose-text">{error}</p>}
        </div>
      </Modal>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="添加 Agent"
        subtitle="选择模板并确认插入位置。新 Agent 会接在所选节点之后，原有下游节点整体右移。"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>取消</Button>
            <Button
              onClick={() => void addSpecialist()}
              disabled={creating || !insertAfter || !draft.name.trim() || !draft.title.trim()}
            >
              {creating ? '正在创建…' : '创建并插入'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <div className="grid gap-2 sm:grid-cols-3">
            {SPECIALISTS.map((template, index) => {
              const selected = index === templateIndex
              return (
                <Button
                  key={template.name}
                  variant={selected ? 'secondary' : 'ghost'}
                  onClick={() => {
                    setTemplateIndex(index)
                    setDraft(draftFromTemplate(index))
                  }}
                  className={cx(
                    'h-auto w-full items-start justify-start whitespace-normal border p-3 text-left',
                    '[&>span]:w-full [&>span]:flex-col [&>span]:items-start [&>span]:gap-1',
                    selected ? 'border-accent-300 bg-accent-50' : 'border-separator-border',
                  )}
                  trailingIcon={selected ? RiCheckLine : undefined}
                >
                  <span className="text-body-2-medium text-text-primary">{template.name}</span>
                  <span className="text-caption-2-regular leading-relaxed text-text-secondary">{template.description}</span>
                </Button>
              )
            })}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Agent 名称" value={draft.name} onChange={(value) => setDraft({ ...draft, name: value })} placeholder="例如：风险审查员" />
            <Input label="一句话职责" value={draft.title} onChange={(value) => setDraft({ ...draft, title: value })} placeholder="它负责补充哪一类判断" />
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-caption-1-semibold text-text-secondary">插入位置</span>
            <select
              value={insertAfter}
              onChange={(event) => setInsertAfter(event.target.value)}
              className="h-9 w-full rounded-2lg border border-border-button-default bg-background-tertiary-default px-3 text-body-regular text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
            >
              {insertionTargets.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.data.label} 之后{nextNodeOf(node.id) ? ` / ${nextNodeOf(node.id)!.data.label} 之前` : ''}
                </option>
              ))}
            </select>
          </label>
          {insertAnchor && insertBefore && (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-accent-200 bg-accent-50 px-3 py-2.5 text-caption-1-regular text-text-secondary">
              <span>{insertAnchor.data.label}</span>
              <RiArrowRightSLine className="size-3.5 text-accent-600" aria-hidden />
              <strong className="font-semibold text-accent-700">{draft.name.trim() || '新 Agent'}</strong>
              <RiArrowRightSLine className="size-3.5 text-accent-600" aria-hidden />
              <span>{insertBefore.data.label}</span>
            </div>
          )}

          <div>
            <span className="text-caption-1-semibold text-text-secondary">预挂插件</span>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {data.plugins.map((plugin) => {
                const active = draft.plugins.includes(plugin.id)
                const Icon = pluginIconComponent(plugin.icon)
                return (
                  <Button
                    key={plugin.id}
                    variant={active ? 'secondary' : 'ghost'}
                    size="xs"
                    leadingIcon={Icon}
                    trailingIcon={active ? RiCheckLine : undefined}
                    className={cx('rounded-full border', active ? 'border-accent-300 text-accent-700' : 'border-separator-border')}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        plugins: active
                          ? draft.plugins.filter((id) => id !== plugin.id)
                          : [...draft.plugins, plugin.id],
                      })
                    }
                  >
                    {plugin.name}
                  </Button>
                )
              })}
            </div>
          </div>
          <p className="text-caption-1-regular leading-relaxed text-text-tertiary">
            名称与职责可以改写；其他模型参数沿用模板。新节点会获得唯一 ID，便于在运行轨迹里追踪。
          </p>
          {error && <p className="text-caption-1-medium text-status-rose-text">{error}</p>}
        </div>
      </Modal>

      <Modal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="调度与验证设置"
        subtitle="这些参数会在下一次运行时生效。"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSettingsOpen(false)}>取消</Button>
            <Button onClick={() => void saveSettings()}>保存设置</Button>
          </>
        }
      >
        {settings && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="最大并发"
              type="number"
              value={String(settings.maxConcurrency)}
              onChange={(value) => setSettings({ ...settings, maxConcurrency: Math.max(1, Math.min(8, Number(value) || 1)) })}
            />
            <Input
              label="最大回环次数"
              type="number"
              value={String(settings.maxLoop)}
              onChange={(value) => setSettings({ ...settings, maxLoop: Math.max(0, Math.min(4, Number(value) || 0)) })}
            />
            <Input
              label="核查通过阈值"
              type="number"
              value={String(settings.verifyThreshold)}
              onChange={(value) => setSettings({ ...settings, verifyThreshold: Math.max(0, Math.min(1, Number(value) || 0)) })}
            />
            <Input
              label="预算上限（USD）"
              type="number"
              value={String(settings.budgetUsd)}
              onChange={(value) => setSettings({ ...settings, budgetUsd: Math.max(0, Number(value) || 0) })}
            />
          </div>
        )}
      </Modal>

      {notice && (
        <div
          className={cx(
            'fixed bottom-5 end-5 z-[90] flex max-w-[calc(100vw-2rem)] items-start gap-2 rounded-2xl border bg-background-primary-default p-3 text-body-2-regular text-text-primary shadow-xl backdrop-blur-xl',
            notice.tone === 'warn' ? 'border-status-orange-text/30' : 'border-separator-border',
          )}
          role="status"
          aria-live="polite"
        >
          <span className={cx('mt-0.5 shrink-0', notice.tone === 'warn' ? 'text-status-orange-text' : 'text-status-lime-text')}>
            {notice.tone === 'ok' ? <RiCheckLine className="size-4" /> : <RiErrorWarningLine className="size-4" />}
          </span>
          <span className="min-w-0 flex-1 leading-relaxed">{notice.message}</span>
          <IconButton
            icon={RiCloseLine}
            size="small"
            aria-label="关闭提示"
            onClick={() => setNotice(null)}
            className="size-6 border-transparent bg-transparent shadow-none"
          />
        </div>
      )}
    </div>
  )
}
