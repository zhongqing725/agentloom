import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  getSmoothStepPath,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  RiCloseLine,
  RiFileTextLine,
  RiFlowChart,
  RiGitBranchLine,
  RiLoader4Line,
  RiPlayLargeLine,
  RiPlugLine,
  RiRobot2Line,
  RiShieldCheckLine,
} from '@remixicon/react'
import type { Agent, GraphEdge, GraphNode, PluginDef } from '../../shared/types'
import { cx } from '@/utils/cx'
import { PluginIcon } from './ui'

type FlowNodeData = {
  label: string
  subtitle?: string
  kind: string
  status?: string
  score?: number
  iteration?: number
  pluginIds?: string[]
  pluginDefs?: PluginDef[]
  droppable?: boolean
  connectable?: boolean
  onPluginDrop?: (pluginId: string) => void
  [key: string]: unknown
}

type LoomEdgeData = {
  kind?: string
  onDelete?: (edgeId: string) => void
  [key: string]: unknown
}

const KIND_LABEL: Record<string, string> = {
  input: 'INPUT',
  agent: 'AGENT',
  verifier: 'VERIFIER',
  output: 'OUTPUT',
  condition: 'CONDITION',
  subflow: 'SUBFLOW',
}

function LoomNode({ data, selected }: NodeProps<Node<FlowNodeData>>) {
  const [dragOver, setDragOver] = useState(false)
  const status = data.status ?? 'pending'
  const Icon =
    data.kind === 'input'
      ? RiPlayLargeLine
      : data.kind === 'output'
        ? RiFileTextLine
        : data.kind === 'verifier'
          ? RiShieldCheckLine
          : data.kind === 'condition'
            ? RiGitBranchLine
            : data.kind === 'subflow'
              ? RiFlowChart
              : RiRobot2Line
  const acceptsPlugin = Boolean(data.droppable)
  const running = status === 'running' || status === 'queued'

  return (
    <div
      className={cx(
        'loom-node group relative flex w-[168px] flex-col rounded-[16px] border px-3 py-2.5 backdrop-blur-xl',
        'transition-[border-color,box-shadow] duration-200',
        'bg-background-primary-default shadow-card',
        selected ? 'border-accent-400' : 'border-border-button-default hover:border-border-button-hover',
        status === 'failed' && 'border-status-rose-text/40',
        status === 'waiting' && 'border-status-orange-text/40',
        dragOver && 'border-accent-500 ring-2 ring-accent-500/25',
      )}
      onDragEnter={(event) => {
        if (!acceptsPlugin || !event.dataTransfer.types.includes('text/plain')) return
        event.preventDefault()
        setDragOver(true)
      }}
      onDragOver={(event) => {
        if (!acceptsPlugin || !event.dataTransfer.types.includes('text/plain')) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as HTMLElement | null)) return
        setDragOver(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setDragOver(false)
        if (!acceptsPlugin) return
        const pluginId = event.dataTransfer.getData('text/plain')
        if (pluginId) data.onPluginDrop?.(pluginId)
      }}
    >
      {data.kind !== 'input' && (
        <Handle type="target" position={Position.Left} isConnectable={data.connectable !== false} />
      )}

      <div className="flex items-center gap-1.5">
        <Icon className={cx('size-3 shrink-0', running ? 'text-accent-500' : 'text-text-placeholder')} aria-hidden />
        <span className="text-[9px] font-medium tracking-[0.12em] text-text-placeholder">
          {KIND_LABEL[data.kind] ?? data.kind.toUpperCase()}
        </span>
        <span className="ms-auto flex items-center gap-1.5">
          {running && <RiLoader4Line className="size-3 animate-spin text-accent-500" aria-label="执行中" />}
          {data.score !== undefined && (
            <span className="text-[9px] tabular-nums text-status-lime-text">{Math.round(data.score * 100)}</span>
          )}
          <span
            className={cx(
              'size-1.5 rounded-full',
              status === 'completed' ? 'bg-status-lime-text' : running ? 'bg-accent-500' : status === 'failed' ? 'bg-status-rose-text' : status === 'waiting' ? 'bg-status-orange-text' : 'bg-text-placeholder',
            )}
            aria-hidden
          />
        </span>
      </div>

      <div className="mt-1.5 truncate text-[12.5px] font-medium tracking-[-0.01em] text-text-primary">{data.label}</div>
      {data.subtitle && <div className="mt-0.5 truncate text-[10.5px] text-text-tertiary">{data.subtitle}</div>}

      <div className="mt-2 flex min-h-3.5 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 text-text-placeholder">
          {(data.pluginDefs ?? []).slice(0, 3).map((plugin) => (
            <span key={plugin.id} title={plugin.name}>
              <PluginIcon name={plugin.icon} size={11} />
            </span>
          ))}
          {(data.pluginDefs ?? []).length > 3 && (
            <span className="text-[9px] tabular-nums">+{(data.pluginDefs ?? []).length - 3}</span>
          )}
        </div>
        {data.iteration !== undefined && data.iteration > 0 && (
          <span className="rounded bg-accent-100 px-1 text-[9px] tabular-nums text-accent-700">
            L{data.iteration + 1}
          </span>
        )}
      </div>

      {data.kind !== 'output' && (
        <Handle type="source" position={Position.Right} isConnectable={data.connectable !== false} />
      )}

      {dragOver && (
        <span className="pointer-events-none absolute inset-1 z-20 flex items-center justify-center gap-1.5 rounded-[12px] border border-dashed border-accent-500 bg-background-primary-active text-[10px] font-medium text-accent-700">
          <RiPlugLine className="size-3.5" aria-hidden /> 松开挂载
        </span>
      )}
    </div>
  )
}

function LoomEdgeView({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  selected,
  label,
  data,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 16,
  })
  const edgeData = data as LoomEdgeData | undefined

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} interactionWidth={24} />
      <EdgeLabelRenderer>
        <div
          className={cx('nodrag nopan pointer-events-none absolute z-10 flex items-center gap-1', selected && 'z-20')}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
        >
          {label ? (
            <span className="whitespace-nowrap rounded-full border border-border-button-default bg-background-primary-active px-2 py-0.5 text-[9px] text-text-tertiary shadow-xs">
              {label}
            </span>
          ) : null}
          {selected && edgeData?.onDelete ? (
            <button
              type="button"
              className="pointer-events-auto grid size-5 place-items-center rounded-full bg-accent-500 text-text-white shadow-sm outline-none transition-colors duration-150 hover:bg-accent-600 focus-visible:ring-2 focus-visible:ring-border-focus-ring"
              title="删除这条连线"
              aria-label="删除这条连线"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                edgeData?.onDelete?.(id)
              }}
            >
              <RiCloseLine className="size-3" aria-hidden />
            </button>
          ) : null}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}

const nodeTypes = { loom: LoomNode }
const edgeTypes = { loom: LoomEdgeView }

function useNarrowCanvas() {
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches,
  )

  useEffect(() => {
    const query = window.matchMedia('(max-width: 760px)')
    const update = () => setNarrow(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  return narrow
}

export interface NodeStatusInfo {
  status: string
  score?: number
  iteration?: number
}

export function WorkflowGraph({
  graph,
  agents,
  plugins,
  statuses,
  onNodeClick,
  onNodeDragStop,
  onConnect,
  onNodesDelete,
  onEdgesDelete,
  onPluginDrop,
  focusNodeId,
  readOnly = false,
  height = 520,
}: {
  graph: { nodes: GraphNode[]; edges: GraphEdge[] }
  agents: Agent[]
  plugins: PluginDef[]
  statuses?: Map<string, NodeStatusInfo>
  onNodeClick?: (nodeId: string) => void
  onNodeDragStop?: (nodeId: string, position: { x: number; y: number }) => void
  onConnect?: (connection: Connection) => void
  onNodesDelete?: (nodeIds: string[]) => void
  onEdgesDelete?: (edgeIds: string[]) => void
  onPluginDrop?: (nodeId: string, pluginId: string) => void
  focusNodeId?: string | null
  readOnly?: boolean
  height?: number
}) {
  const narrow = useNarrowCanvas()
  const flowRef = useRef<ReactFlowInstance<Node<FlowNodeData>, Edge<LoomEdgeData>> | null>(null)
  const initialNodes = useMemo<Node<FlowNodeData>[]>(() => {
    return graph.nodes.map((node) => {
      const agent = node.data.agentId ? agents.find((item) => item.id === node.data.agentId) : undefined
      const pluginIds = node.data.pluginIds ?? agent?.plugins ?? []
      const info = statuses?.get(node.id)
      return {
        id: node.id,
        type: 'loom',
        position: node.position,
        data: {
          label: node.data.label,
          subtitle: node.data.subtitle,
          kind: node.type,
          status: info?.status ?? 'pending',
          score: info?.score,
          iteration: info?.iteration,
          pluginIds,
          pluginDefs: pluginIds.map((id) => plugins.find((plugin) => plugin.id === id)).filter(Boolean) as PluginDef[],
          droppable: Boolean(agent) && !readOnly,
          connectable: !readOnly,
          onPluginDrop: onPluginDrop ? (pluginId: string) => onPluginDrop(node.id, pluginId) : undefined,
        },
      }
    })
  }, [graph, agents, plugins, statuses, onPluginDrop, readOnly])

  const initialEdges = useMemo<Edge<LoomEdgeData>[]>(() => {
    return graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'loom',
      animated: edge.kind === 'loop',
      label: edge.label,
      selectable: !readOnly,
      focusable: false,
      data: {
        kind: edge.kind,
        onDelete: onEdgesDelete ? (edgeId: string) => onEdgesDelete([edgeId]) : undefined,
      },
      style:
        edge.kind === 'loop'
          ? { stroke: 'var(--color-accent-500)', strokeWidth: 1.4, strokeDasharray: '5 4', opacity: 0.85 }
          : { stroke: 'rgb(0 0 0 / 0.2)', strokeWidth: 1.2 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color: edge.kind === 'loop' ? 'var(--color-accent-500)' : 'rgb(0 0 0 / 0.32)',
      },
    }))
  }, [graph, onEdgesDelete, readOnly])

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<FlowNodeData>>(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge<LoomEdgeData>>(initialEdges)

  useEffect(() => {
    setNodes((current) => {
      const previous = new Map(current.map((node) => [node.id, node]))
      return initialNodes.map((node) => {
        const existing = previous.get(node.id)
        if (!existing) return node
        return {
          ...node,
          selected: existing.selected,
          dragging: existing.dragging,
          position: existing.dragging ? existing.position : node.position,
        }
      })
    })
  }, [initialNodes, setNodes])

  useEffect(() => {
    setEdges((current) => {
      const previous = new Map(current.map((edge) => [edge.id, edge]))
      return initialEdges.map((edge) => ({ ...edge, selected: previous.get(edge.id)?.selected }))
    })
  }, [initialEdges, setEdges])

  // When the desktop inspector opens over the canvas, pan the selected node
  // left into the visible area instead of leaving it underneath the panel.
  useEffect(() => {
    if (!focusNodeId || narrow || !window.matchMedia('(min-width: 1024px)').matches) return
    const instance = flowRef.current
    const node = instance?.getNode(focusNodeId)
    if (!instance || !node) return
    const zoom = instance.getZoom()
    const width = node.measured?.width ?? 168
    const nodeHeight = node.measured?.height ?? 104
    const offset = 180 / zoom
    instance.setCenter(node.position.x + width / 2 + offset, node.position.y + nodeHeight / 2, {
      zoom,
      duration: 320,
    })
  }, [focusNodeId, narrow])

  return (
    <div className="agent-canvas" style={{ '--canvas-h': `${height}px` } as CSSProperties}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onInit={(instance) => {
          flowRef.current = instance
        }}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_, node) => onNodeClick?.(node.id)}
        onNodeDragStop={(_, node) => onNodeDragStop?.(node.id, node.position)}
        onConnect={onConnect}
        onNodesDelete={(deleted) => onNodesDelete?.(deleted.map((node) => node.id))}
        onEdgesDelete={(deleted) => onEdgesDelete?.(deleted.map((edge) => edge.id))}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        edgesReconnectable={false}
        deleteKeyCode={readOnly ? null : ['Delete', 'Backspace']}
        edgesFocusable={false}
        elementsSelectable
        fitView={!narrow}
        fitViewOptions={{ padding: 0.06, maxZoom: 1 }}
        defaultViewport={narrow ? { x: 8, y: 20, zoom: 0.66 } : undefined}
        minZoom={0.28}
        maxZoom={1.4}
        connectionRadius={32}
        connectionLineStyle={{ stroke: 'var(--color-accent-500)', strokeWidth: 1.6 }}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ type: 'loom' }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="rgb(0 0 0 / 0.1)" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
