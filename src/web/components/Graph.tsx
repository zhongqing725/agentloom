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

const KIND_BAR: Record<string, string> = {
  input: 'bg-text-tertiary',
  agent: 'bg-accent-500',
  verifier: 'bg-text-primary',
  output: 'bg-accent-600',
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
          : RiRobot2Line
  const acceptsPlugin = Boolean(data.droppable)

  return (
    <div
      className={cx(
        'agent-node group relative flex w-[160px] rounded-2xl border bg-background-primary-default shadow-card',
        'transition-[border-color,box-shadow] duration-150 hover:shadow-md',
        selected ? 'border-accent-500 ring-2 ring-accent-500/20' : 'border-border-button-default',
        status === 'running' && 'border-accent-500 ring-2 ring-accent-500/15',
        status === 'completed' && 'border-status-lime-text/30',
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
        <Handle
          type="target"
          position={Position.Left}
          isConnectable={data.connectable !== false}
          className={cx('canvas-handle', data.connectable === false && 'canvas-handle-idle')}
        />
      )}
      <div className={cx('w-1 shrink-0 rounded-s-2xl', KIND_BAR[data.kind] ?? 'bg-accent-500')} aria-hidden />
      <div className="min-w-0 flex-1 px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="grid size-6 shrink-0 place-items-center rounded-md bg-background-tertiary-default text-accent-600">
            <Icon className="size-3.5" aria-hidden />
          </span>
          <span className="text-caption-2-semibold uppercase tracking-[0.12em] text-text-tertiary">
            {data.kind === 'agent' ? 'Agent' : data.kind}
          </span>
          {status === 'running' && <RiLoader4Line className="ms-auto size-3.5 animate-spin text-accent-600" aria-label="执行中" />}
          {status === 'queued' && (
            <span className="ms-auto rounded-sm bg-status-yellow-background px-1 py-0.5 text-caption-2-semibold text-status-yellow-text">
              排队
            </span>
          )}
          {data.score !== undefined && (
            <span className="ms-auto rounded-sm bg-status-lime-background px-1 py-0.5 text-caption-2-semibold text-status-lime-text">
              {Math.round(data.score * 100)}
            </span>
          )}
        </div>
        <div className="mt-2 truncate text-body-2-medium text-text-primary">{data.label}</div>
        {data.subtitle && <div className="mt-0.5 truncate text-caption-1-regular text-text-tertiary">{data.subtitle}</div>}
        <div className="mt-2 flex min-h-4 items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5 text-text-tertiary">
            {(data.pluginDefs ?? []).slice(0, 3).map((plugin) => (
              <span key={plugin.id} title={plugin.name}>
                <PluginIcon name={plugin.icon} size={12} />
              </span>
            ))}
            {(data.pluginDefs ?? []).length > 3 && (
              <span className="font-mono text-caption-2-medium">+{(data.pluginDefs ?? []).length - 3}</span>
            )}
          </div>
          {data.iteration !== undefined && data.iteration > 0 && (
            <span className="rounded-sm bg-accent-100 px-1 py-0.5 font-mono text-caption-2-semibold text-accent-700">
              L{data.iteration + 1}
            </span>
          )}
        </div>
      </div>
      {data.kind !== 'output' && (
        <Handle
          type="source"
          position={Position.Right}
          isConnectable={data.connectable !== false}
          className={cx('canvas-handle', data.connectable === false && 'canvas-handle-idle')}
        />
      )}
      {dragOver && (
        <span className="pointer-events-none absolute inset-1.5 z-20 flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-accent-500 bg-background-primary-default/95 text-caption-1-semibold text-accent-700">
          <RiPlugLine className="size-4" aria-hidden /> 松开挂载
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
    borderRadius: 14,
  })
  const edgeData = data as LoomEdgeData | undefined
  const loop = edgeData?.kind === 'loop'

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} interactionWidth={24} />
      <EdgeLabelRenderer>
        <div
          className={cx('pointer-events-none absolute z-10 flex items-center gap-1', selected && 'z-20')}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
        >
          {label ? (
            <span className="whitespace-nowrap rounded-md border border-separator-border bg-background-primary-default px-1.5 py-0.5 text-caption-2-medium text-text-secondary shadow-xs">
              {label}
            </span>
          ) : null}
          {selected && edgeData?.onDelete ? (
            <button
              type="button"
              className="pointer-events-auto grid size-6 place-items-center rounded-full border-2 border-background-primary-default bg-accent-500 text-text-white shadow-md outline-none transition-colors duration-150 hover:bg-accent-600 focus-visible:ring-2 focus-visible:ring-border-focus-ring"
              title="删除这条连线"
              aria-label="删除这条连线"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                edgeData?.onDelete?.(id)
              }}
            >
              <RiCloseLine className="size-3.5" aria-hidden />
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
          ? { stroke: 'var(--color-accent-500)', strokeWidth: 1.4, strokeDasharray: '5 4' }
          : { stroke: 'var(--color-border-button-active)', strokeWidth: 1.3 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: edge.kind === 'loop' ? 'var(--color-accent-500)' : 'var(--color-border-button-active)',
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
    const width = node.measured?.width ?? 160
    const height = node.measured?.height ?? 120
    const offset = 175 / zoom
    instance.setCenter(node.position.x + width / 2 + offset, node.position.y + height / 2, {
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
        fitViewOptions={{ padding: 0.12, maxZoom: 1 }}
        defaultViewport={narrow ? { x: 8, y: 20, zoom: 0.62 } : undefined}
        minZoom={0.28}
        maxZoom={1.4}
        connectionRadius={32}
        connectionLineStyle={{ stroke: 'var(--color-accent-500)', strokeWidth: 1.8 }}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ type: 'loom' }}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
        <Controls showInteractive={false} />
        <div className="agent-canvas-hint pointer-events-none absolute right-3 top-3 z-10 rounded-lg border border-separator-border bg-background-primary-default/90 px-2 py-1 text-caption-2-medium text-text-tertiary backdrop-blur md:hidden">
          拖动画布 · 双指缩放
        </div>
      </ReactFlow>
    </div>
  )
}
