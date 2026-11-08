import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { RadioGroup } from 'react-aria-components'
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
  RiPlayLargeLine,
  RiRobot2Line,
  RiSettings3Line,
  RiSparklingLine,
} from '@remixicon/react'
import { useApp } from '../App'
import Antigravity from '../components/Antigravity'
import { api } from '../api'
import { Button } from '@/components/base/buttons/button'
import { IconButton } from '@/components/base/buttons/icon-button'
import { Chip } from '@/components/base/badges/chip'
import { Input } from '@/components/base/input/input'
import { RadioCard } from '@/components/base/radio/radio-card'
import { Switch } from '@/components/base/switch/switch'
import { Textarea } from '@/components/base/textarea/textarea'
import { Tooltip, TooltipTrigger } from '@/components/base/tooltip/tooltip'
import { cx } from '@/utils/cx'
import {
  Modal,
  PageHeader,
  PluginIcon,
  pluginIconComponent,
  SectionHead,
  Surface,
} from '../components/ui'
import { WorkflowGraph } from '../components/Graph'
import { SwarmBuild } from '../components/SwarmBuild'
import { TOOL_PLUGIN_IDS, type Agent, type GraphNode, type Workflow as WorkflowModel } from '../../shared/types'

type Graph = WorkflowModel['graph']
type Notice = { message: string; tone: 'ok' | 'warn' }
type SpecialistDraft = {
  name: string
  title: string
  description: string
  plugins: string[]
  systemPrompt: string
  temperature: number
}

/** Only plugins with a runtime path are draggable; the rest stay catalog-only. */
const RUNTIME_PLUGINS = new Set(['knowledge.retrieve', 'cognition.diverge', 'verify.citations', 'tool.calculator'])

/**
 * The preset library behind 「添加 Agent」. Each template carries its own
 * contract prompt, so a node dropped on the canvas behaves differently from
 * the day it is created — the plugins alone only decide *which* strategy
 * runs, the prompt decides how the role thinks.
 *
 * `brief` is the one line the picker shows; `description` is the longer
 * explanation in the preview panel.
 */
const SPECIALISTS = [
  {
    name: '风险审查员',
    title: '独立审查风险、反方证据与下行情形',
    brief: '挑战主判断',
    description: '在主判断形成之后插入一道独立审查：找出被忽略的下行情形、单一来源和过度乐观的假设。',
    plugins: ['knowledge.retrieve'],
    temperature: 0.4,
    systemPrompt:
      '你是独立风险审查员。只审视上游判断的风险面：找出可证伪的假设、单一来源证据、被忽略的下行情形。不要复述结论，不要给出礼貌性的平衡意见。只输出 JSON：{"summary":"","findings":[""],"recommendation":""}',
  },
  {
    name: '反方研究员',
    title: '专门挑战主判断，找出证伪条件',
    brief: '站到对立面',
    description: '假定主判断是错的那一方，给出最强的反驳论据与可观察的证伪信号，供分析师修正。',
    plugins: ['knowledge.retrieve'],
    temperature: 0.7,
    systemPrompt:
      '你是反方研究员。假定团队的主判断是错的，给出最强的反驳论据、你最想看到的数据缺口，以及出现什么信号就应当推翻结论。不要两边都说。只输出 JSON：{"thesis":"","counterpoints":[""],"falsifiers":[""]}',
  },
  {
    name: '政策研究员',
    title: '监管口径、政策窗口与落地节奏',
    brief: '政策与合规',
    description: '检索监管文件与政策口径，判断哪些结论会因合规收紧而失效，并给出政策窗口的时间判断。',
    plugins: ['knowledge.retrieve'],
    temperature: 0.3,
    systemPrompt:
      '你是政策研究员。只基于检索到的监管与政策证据回答，区分已生效条款与征求意见稿。每条判断都要能回到条文或官方表述。只输出 JSON：{"summary":"","keyPoints":[""],"evidence":[""]}',
  },
  {
    name: '量化分析师',
    title: '规模、增速与敏感性的确定性测算',
    brief: '先算清口径',
    description: '把报告里的关键数字重算一遍：口径、年化方式、敏感性区间，指出算不通或互相矛盾的地方。',
    plugins: ['tool.calculator'],
    temperature: 0.2,
    systemPrompt:
      '你是量化分析师。只做确定性的数字核对与测算：复核口径、单位、年化方式，给出关键变量的敏感性区间。算不出来就说明缺哪个输入，不要估算。只输出 JSON：{"checks":[{"number":"","verdict":"","note":""}],"sensitivity":""}',
  },
  {
    name: '用户研究员',
    title: '真实场景、留存与退货原因',
    brief: '看场景与留存',
    description: '用使用场景、留存和退货数据检验“产品力”这类软判断，指出只有出货量没有留存的结论。',
    plugins: ['knowledge.retrieve'],
    temperature: 0.4,
    systemPrompt:
      '你是用户研究员。只基于检索到的使用数据回答：场景频次、留存曲线、退货原因。把“用户喜欢”这类说法换成可测指标。只输出 JSON：{"summary":"","metrics":[""],"risks":[""]}',
  },
  {
    name: '竞品拆解师',
    title: '单机成本、体验与渠道的横向对比',
    brief: '竞品同口径',
    description: '选 3 个直接竞品，按 BOM、体验指标、渠道与价格逐项对比，指出报告里被笼统概括的竞争判断。',
    plugins: ['knowledge.retrieve'],
    temperature: 0.3,
    systemPrompt:
      '你是竞品拆解师。选 3 个与前文直接竞争的对手，按成本、体验指标、渠道、价格做同口径对比。没有数据的格子写“缺数据”，不要补。只输出 JSON：{"table":[{"name":"","cost":"","experience":"","channel":"","price":""}],"takeaway":""}',
  },
  {
    name: '数据可视化师',
    title: '把关键数字整理成图表规格',
    brief: '给数字配图',
    description: '为市场、产业链、竞争章节各产出一张图的规格：图表类型、轴、单位、数据来源，可直接交给前端。',
    plugins: ['tool.calculator'],
    temperature: 0.3,
    systemPrompt:
      '你是数据可视化师。为报告中的关键数字给出可执行的图表规格：类型、x/y 轴含义与单位、数据点来源引用编号。不要写营销式的图注。只输出 JSON：{"charts":[{"title":"","type":"","x":"","y":"","source":""}]}',
  },
  {
    name: '合规审查员',
    title: '隐私、合规与对外表述',
    brief: '能不能这样说',
    description: '检查引用授权、免责声明与可能引发合规风险的表述，给出必须修改的句子清单。',
    plugins: ['verify.citations'],
    temperature: 0.2,
    systemPrompt:
      '你是合规审查员。检查报告是否存在隐私采集、未授权引用、绝对化承诺或未标注的预测。逐条给出原句与改法。只输出 JSON：{"issues":[{"quote":"","problem":"","fix":""}],"verdict":""}',
  },
  {
    name: '本地化编辑',
    title: '中文表达、术语统一与可读性',
    brief: '改表达不改事实',
    description: '统一术语与数字格式，拆掉翻译腔和长定语，指出读起来像机器生成的段落。',
    plugins: [],
    temperature: 0.5,
    systemPrompt:
      '你是中文编辑。只改表达不改事实：统一术语、数字与单位格式，拆开长定语和翻译腔。逐条给出原句与改写，并说明问题类型。只输出 JSON：{"edits":[{"before":"","after":"","reason":""}]}',
  },
  {
    name: '数据工程师',
    title: '多源数据的清洗、对齐与口径统一',
    brief: '先对齐口径',
    description: '检查多份资料之间的口径冲突（年份、口径、单位），列出需要对齐的字段与处理建议。',
    plugins: ['tool.calculator'],
    temperature: 0.2,
    systemPrompt:
      '你是数据工程师。检查多份资料之间的口径冲突：统计年份、统计范围、单位、汇率。列出冲突字段、各自出处与建议采用的统一口径。只输出 JSON：{"conflicts":[{"field":"","values":[""],"suggestion":""}],"normalized":""}',
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
  const [draft, setDraft] = useState<SpecialistDraft>(() => draftFromTemplate(0))
  const [insertAfter, setInsertAfter] = useState('writer')
  const [existingId, setExistingId] = useState('')
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
        const next = [...agent.plugins, pluginId]
        await api.updateAgent(agent.id, { plugins: next, tools: next.filter((id) => TOOL_PLUGIN_IDS.includes(id)) })
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
  const availableAgents = data.agents.filter(
    (agent) => !graph.nodes.some((node) => node.data.agentId === agent.id),
  )
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
      await api.updateAgent(selectedAgent.id, {
        plugins: next,
        tools: next.filter((id) => TOOL_PLUGIN_IDS.includes(id)),
      })
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

  const insertAgentNode = async (agent: Agent, anchorId: string): Promise<boolean> => {
    const anchor = graph.nodes.find((node) => node.id === anchorId)
    const nextEdge = flowEdges.find((edge) => edge.source === anchorId)
    const nextNode = nextEdge ? graph.nodes.find((node) => node.id === nextEdge.target) : undefined
    if (!anchor || !nextEdge || !nextNode) {
      setError('这个插入位置没有可用的单一上游/下游路径，请重新选择。')
      return false
    }
    const newNodeId = `node-${agent.id}`
    if (graph.nodes.some((node) => node.id === newNodeId)) {
      setError('这个角色已经在画布上。')
      return false
    }
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
    const angle = agent.role === 'researcher' ? agent.name.replace(/研究员|情报员/g, '') : undefined
    const newNode: GraphNode = {
      id: newNodeId,
      type: 'agent',
      position: { x: nextNode.position.x, y: nextNode.position.y },
      data: {
        label: agent.name,
        subtitle: agent.title,
        agentId: agent.id,
        kind: 'agent',
        ...(angle ? { angle } : {}),
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
      setError('插入画布失败，请检查画布状态后重试。')
      return false
    }
    setSelectedId(newNodeId)
    return true
  }

  const addSpecialist = async () => {
    const name = draft.name.trim()
    const title = draft.title.trim()
    if (!name || !title) {
      setError('请填写 Agent 名称与一句话职责。')
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
        tools: draft.plugins.filter((id) => TOOL_PLUGIN_IDS.includes(id)),
        systemPrompt: draft.systemPrompt,
        temperature: draft.temperature,
      })
      const ok = await insertAgentNode(agent, insertAfter)
      if (!ok) {
        setError('Agent 已创建，但插入画布失败。可打开「添加 Agent」重新尝试。')
        return
      }
      setAddOpen(false)
      notify(`已添加「${agent.name}」。`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建 Agent 失败')
    } finally {
      setCreating(false)
    }
  }

  const addExistingAgent = async () => {
    const agent = availableAgents.find((item) => item.id === existingId)
    if (!agent) {
      setError('先选择一个团队角色。')
      return
    }
    setCreating(true)
    setError('')
    try {
      const ok = await insertAgentNode(agent, insertAfter)
      if (!ok) return
      setAddOpen(false)
      setExistingId('')
      notify(`已把「${agent.name}」加入画布。`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '插入失败')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="app-page">
      <div className="page-particles" aria-hidden>
        <Antigravity
          colors={['#5227FF', '#FF9FFC', '#B497CF']}
          count={1200}
          magnetRadius={8}
          ringRadius={6}
          particleSize={0.4}
          particleShape="capsule"
          particleVariance={0.9}
          waveSpeed={0.5}
          waveAmplitude={1}
          colorMode="conic"
          colorSpeed={0.06}
          pulseSpeed={2.4}
          depthFactor={1}
          ambient={0.3}
          lerpSpeed={0.08}
          autoAnimate
          interactive={false}
          intro
          lightMode={false}
          opacity={0.6}
        />
      </div>
      <PageHeader
        title="编排画布"
        meta={`${data.workflow.name} · ${stats.agents} 个 Agent · ${stats.edges} 条连线 · ${stats.loops} 条回环 · 并发 ${data.workflow.settings.maxConcurrency}`}
        actions={
          <>
            <Button variant="secondary" className="lm-cta-secondary" leadingIcon={RiAddLine} onClick={openAdd}>添加 Agent</Button>
            <Button variant="ghost" className="lm-cta-secondary" leadingIcon={RiSettings3Line} onClick={() => setSettingsOpen(true)}>调度设置</Button>
            <Button className="lm-cta-primary" leadingIcon={RiPlayLargeLine} onClick={() => setRunOpen(true)}>运行此流程</Button>
          </>
        }
      />

      <div className="relative">
        <SwarmBuild graph={graph} agents={data.agents} />
        <Surface tilt={false} className="relative overflow-hidden p-0">
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
            height={600}
          />

          <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-wrap items-start justify-between gap-2">
            <div className="glass-strong pointer-events-auto flex items-center gap-2 rounded-full py-1.5 pe-3 ps-2.5">
              <span className="size-1.5 rounded-full bg-status-lime-text" aria-hidden />
              <span className="text-[12px] font-medium text-text-primary">{data.workflow.name}</span>
              <span className="text-[10px] text-text-tertiary">已自动保存</span>
            </div>
            <div className="glass pointer-events-auto hidden items-center gap-3 rounded-full px-3 py-1.5 text-[10px] text-text-tertiary sm:flex">
              <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-status-lime-text" /> 完成</span>
              <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-accent-500" /> 运行</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-px w-3 border-t border-dashed border-accent-500" /> 回环</span>
            </div>
          </div>

          <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex justify-center">
            <div className="glass-strong pointer-events-auto hide-scrollbar flex max-w-full items-center gap-1 overflow-x-auto rounded-full p-1.5">
              <span className="hidden shrink-0 items-center gap-1 pe-1.5 ps-1.5 text-[10px] text-text-tertiary sm:flex">
                <RiDraggable className="size-3" aria-hidden />
                {selectedAgent ? `挂到「${selectedAgent.name}」` : '插件'}
              </span>
              {data.plugins.filter((plugin) => RUNTIME_PLUGINS.has(plugin.id)).map((plugin) => {
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
                    className={cx('shrink-0 rounded-full cursor-grab', active && 'text-accent-700')}
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
          </div>
        </Surface>

        {selectedNode && (
          <Surface
            as="aside"
            className={cx(
              'glass-strong fixed inset-x-2 bottom-2 z-50 max-h-[72dvh] overflow-y-auto rounded-3xl p-5',
              'lg:absolute lg:bottom-4 lg:end-4 lg:left-auto lg:top-[76px] lg:z-20 lg:max-h-none lg:w-[348px]',
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="t-label">节点配置</div>
                <h2 className="t-h3 mt-1">{selectedNode.data.label}</h2>
                <p className="mt-0.5 text-[11px] text-text-tertiary">{selectedNode.data.subtitle}</p>
              </div>
              <IconButton icon={RiCloseLine} size="small" aria-label="关闭节点配置" onClick={() => setSelectedId(null)} />
            </div>

            {selectedAgent ? (
              <>
                <div className="mt-4 flex items-center gap-3 rounded-[14px] bg-background-tertiary-default p-3">
                  <span className="grid size-9 place-items-center rounded-[10px] bg-background-primary-default text-accent-600">
                    <RiRobot2Line className="size-4.5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-text-primary">{selectedAgent.name}</div>
                    <div className="truncate text-[11px] text-text-tertiary">{selectedAgent.title}</div>
                  </div>
                  <Chip variant="caption" color="neutral">{selectedAgent.plugins.length}</Chip>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-[12px] bg-background-secondary-default px-3 py-2">
                    <div className="t-label">模型</div>
                    <div className="mt-1 truncate font-mono text-[11px] text-text-primary">{selectedAgent.model}</div>
                  </div>
                  <div className="rounded-[12px] bg-background-secondary-default px-3 py-2">
                    <div className="t-label">温度</div>
                    <div className="mt-1 font-mono text-[11px] text-text-primary">{selectedAgent.temperature.toFixed(1)}</div>
                  </div>
                </div>

                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between px-1">
                    <span className="text-[12px] font-medium text-text-secondary">挂载插件</span>
                    <span className="text-[11px] text-text-tertiary">{selectedAgent.plugins.length}/{RUNTIME_PLUGINS.size}</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {data.plugins.filter((plugin) => RUNTIME_PLUGINS.has(plugin.id)).map((plugin) => {
                      const active = selectedAgent.plugins.includes(plugin.id)
                      return (
                        <div key={plugin.id} className="flex items-center gap-2.5 rounded-[12px] bg-background-secondary-default px-2.5 py-2">
                          <span className="grid size-7 shrink-0 place-items-center rounded-[8px] bg-background-primary-default text-accent-600">
                            <PluginIcon name={plugin.icon} size={13} />
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[12px] text-text-primary">{plugin.name}</span>
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

                <div className="mt-5 border-t border-border-button-default pt-4">
                  <div className="t-label">System Prompt</div>
                  <p className="mt-1.5 line-clamp-5 text-[11px] leading-relaxed text-text-tertiary">
                    {selectedAgent.systemPrompt}
                  </p>
                </div>
              </>
            ) : (
              <div className="mt-4 flex gap-2 rounded-[14px] bg-background-secondary-default p-3 text-[11px] leading-relaxed text-text-secondary">
                <RiSparklingLine className="mt-0.5 size-3.5 shrink-0 text-accent-500" aria-hidden />
                {selectedNode.type === 'input' ? '研究任务的入口节点，不可删除。' : '可交付成果的出口节点，不可删除。'}
              </div>
            )}

            <div className="mt-5 border-t border-border-button-default pt-4">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-medium text-text-secondary">连线</span>
                <span className="text-[11px] text-text-tertiary">{relatedEdges.length}</span>
              </div>
              <div className="mt-2 flex flex-col gap-1.5">
                {relatedEdges.map((edge) => (
                  <div
                    key={edge.id}
                    className={cx(
                      'flex items-center gap-1.5 rounded-[10px] px-2 py-1.5 text-[11px]',
                      edge.kind === 'loop' ? 'bg-accent-50' : 'bg-background-secondary-default',
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate text-text-secondary">{nodeLabel(edge.source)}</span>
                    <RiArrowRightLine className="size-3 shrink-0 text-accent-500" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-text-secondary">{nodeLabel(edge.target)}</span>
                    {edge.kind === 'loop' && <span className="shrink-0 text-[10px] text-accent-700">回环</span>}
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
                {relatedEdges.length === 0 && <p className="text-[11px] text-text-tertiary">这个节点还没有连线。</p>}
              </div>
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
        subtitle={`${stats.agents} 个 Agent 会按当前画布执行；核查未通过时自动回到上游节点。`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRunOpen(false)}>取消</Button>
            <Button onClick={() => void start()} disabled={starting}>{starting ? '启动中…' : '开始运行'}</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Textarea label="研究任务" rows={5} value={input} onChange={setInput} />
          <p className="t-meta">运行会即时开始，执行状态通过 SSE 同步到运行页。</p>
          {error && <p className="text-[12px] text-status-rose-text">{error}</p>}
        </div>
      </Modal>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="添加 Agent"
        subtitle="从团队库插入现有角色，或选模板新建。新节点接在所选节点之后，原有下游节点整体右移。"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>取消</Button>
            <Button
              onClick={() => void (existingId ? addExistingAgent() : addSpecialist())}
              disabled={creating || !insertAfter || (existingId ? false : !draft.name.trim() || !draft.title.trim())}
            >
              {creating ? '正在插入…' : existingId ? '插入现有角色' : '创建并插入'}
            </Button>
          </>
        }
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          <div className="flex min-w-0 flex-col">
            <div className="rounded-[14px] bg-background-secondary-default p-3">
              <label className="flex flex-col gap-1.5">
                <span className="t-label">团队库</span>
                <select
                  value={existingId}
                  onChange={(event) => {
                    const id = event.target.value
                    setExistingId(id)
                    const agent = availableAgents.find((item) => item.id === id)
                    if (agent) {
                      setDraft({
                        name: agent.name,
                        title: agent.title,
                        description: agent.description,
                        plugins: [...agent.plugins],
                        systemPrompt: agent.systemPrompt,
                        temperature: agent.temperature,
                      })
                    }
                  }}
                  className="h-9 w-full rounded-2lg border border-border-button-default bg-background-tertiary-default px-3 text-[13px] text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                >
                  <option value="">新建 Agent（从模板）</option>
                  {availableAgents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name} · {agent.title}
                    </option>
                  ))}
                </select>
              </label>
              <p className="t-meta mt-1.5">
                选择团队库角色会直接插入画布，不新建 Agent；已在画布上的角色不在列表。
              </p>
            </div>

            <div className="mt-3 flex items-baseline justify-between gap-3">
              <span className="t-label">模板</span>
              <span className="t-meta">{SPECIALISTS.length} 个预设</span>
            </div>
            <RadioGroup
              aria-label="模板"
              value={draft.name}
              onChange={(value) => {
                setExistingId('')
                const index = SPECIALISTS.findIndex((template) => template.name === value)
                if (index >= 0) setDraft(draftFromTemplate(index))
              }}
              className="mt-2 flex max-h-[366px] flex-col gap-1.5 overflow-y-auto pe-1"
            >
              {SPECIALISTS.map((template) => (
                <RadioCard
                  key={template.name}
                  value={template.name}
                  title={template.name}
                  description={template.brief}
                />
              ))}
            </RadioGroup>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <div className="rounded-[16px] bg-background-secondary-default p-3.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13px] font-medium text-text-primary">{draft.name}</span>
                <span className="t-meta">温度 {draft.temperature.toFixed(1)}</span>
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-text-secondary">{draft.description}</p>
              <p className="mt-2 line-clamp-3 border-t border-border-button-default pt-2 font-mono text-[10.5px] leading-relaxed text-text-tertiary">
                {draft.systemPrompt}
              </p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {data.plugins.filter((plugin) => RUNTIME_PLUGINS.has(plugin.id)).map((plugin) => {
                  const active = draft.plugins.includes(plugin.id)
                  const Icon = pluginIconComponent(plugin.icon)
                  return (
                    <Button
                      key={plugin.id}
                      variant={active ? 'secondary' : 'ghost'}
                      size="xs"
                      leadingIcon={Icon}
                      trailingIcon={active ? RiCheckLine : undefined}
                      aria-pressed={active}
                      className={cx(active && 'text-accent-700')}
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

            <Input label="Agent 名称" value={draft.name} onChange={(value) => setDraft({ ...draft, name: value })} placeholder="例如：风险审查员" />
            <Input label="一句话职责" value={draft.title} onChange={(value) => setDraft({ ...draft, title: value })} placeholder="它负责补充哪一类判断" />

            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-text-secondary">插入位置</span>
              <select
                value={insertAfter}
                onChange={(event) => setInsertAfter(event.target.value)}
                className="h-9 w-full rounded-2lg border border-border-button-default bg-background-tertiary-default px-3 text-[13px] text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
              >
                {insertionTargets.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.data.label} 之后{nextNodeOf(node.id) ? ` / ${nextNodeOf(node.id)!.data.label} 之前` : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-2 rounded-[14px] bg-background-secondary-default px-3 py-2.5 text-[12px] text-text-secondary">
            <span>{insertAnchor?.data.label}</span>
            <RiArrowRightSLine className="size-3.5 text-accent-500" aria-hidden />
            <strong className="font-medium text-text-primary">{draft.name.trim() || '新 Agent'}</strong>
            <RiArrowRightSLine className="size-3.5 text-accent-500" aria-hidden />
            <span>{insertBefore?.data.label}</span>
            <span className="t-meta ms-auto">新节点获得唯一 ID，可在运行轨迹中追踪</span>
          </div>
          {error && <p className="text-[12px] text-status-rose-text">{error}</p>}
          </div>
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
            'glass-strong fixed bottom-4 end-4 z-[90] flex max-w-[calc(100vw-2rem)] items-start gap-2 rounded-[16px] p-3 text-[13px]',
            notice.tone === 'warn' ? 'text-status-orange-text' : 'text-text-primary',
          )}
          role="status"
          aria-live="polite"
        >
          <span className="mt-0.5 shrink-0">
            {notice.tone === 'ok' ? <RiCheckLine className="size-4 text-accent-500" /> : <RiErrorWarningLine className="size-4" />}
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
