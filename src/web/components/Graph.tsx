import { useEffect, useMemo, useState, type CSSProperties } from 'react'
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
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Bot, FileText, Play, PlugZap, ShieldCheck, X } from 'lucide-react'
import type { Agent, GraphEdge, GraphNode, PluginDef } from '../../shared/types'
import { PluginIcon } from './ui'

type FlowNodeData = {
  label: string
  subtitle?: string
  color: string
  kind: string
  status?: string
  score?: number
  iteration?: number
  pluginIds?: string[]
  pluginDefs?: PluginDef[]
  droppable?: boolean
  onPluginDrop?: (pluginId: string) => void
  [key: string]: unknown
}

type LoomEdgeData = {
  kind?: string
  onDelete?: (edgeId: string) => void
  [key: string]: unknown
}

function LoomNode({ data, selected }: NodeProps<Node<FlowNodeData>>) {
  const [dragOver, setDragOver] = useState(false)
  const status = data.status ?? 'pending'
  const Icon = data.kind === 'input' ? Play : data.kind === 'output' ? FileText : data.kind === 'verifier' ? ShieldCheck : Bot
  const acceptsPlugin = Boolean(data.droppable)

  return (
    <div
      className={`loom-node kind-${data.kind} status-${status} ${selected ? 'selected' : ''} ${dragOver ? 'drop-active' : ''}`}
      style={{ '--node-color': data.color } as CSSProperties}
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
      {data.kind !== 'input' && <Handle type="target" position={Position.Left} className="loom-handle" />}
      <div className="loom-node-bar" style={{ background: data.color }} />
      <div className="loom-node-body">
        <div className="loom-node-top">
          <span className="loom-node-icon" style={{ background: `${data.color}18`, color: data.color }}>
            <Icon size={15} />
          </span>
          <span className="loom-node-kind">{data.kind === 'agent' ? 'AGENT' : data.kind.toUpperCase()}</span>
          {status === 'running' && <span className="loom-spinner" />}
          {status === 'queued' && <span className="loom-queued">QUEUED</span>}
          {data.score !== undefined && <span className="loom-score">{Math.round((data.score ?? 0) * 100)}</span>}
        </div>
        <strong>{data.label}</strong>
        {data.subtitle && <small>{data.subtitle}</small>}
        <div className="loom-node-foot">
          <div className="loom-plugins">
            {(data.pluginDefs ?? []).slice(0, 3).map((plugin) => (
              <span key={plugin.id} title={plugin.name} style={{ color: plugin.color }}>
                <PluginIcon name={plugin.icon} size={12} />
              </span>
            ))}
            {(data.pluginDefs ?? []).length > 3 && (
              <span className="loom-plugin-more">+{(data.pluginDefs ?? []).length - 3}</span>
            )}
          </div>
          {data.iteration !== undefined && data.iteration > 0 && <span className="loom-iter">L{data.iteration + 1}</span>}
        </div>
      </div>
      {data.kind !== 'output' && <Handle type="source" position={Position.Right} className="loom-handle" />}
      {dragOver && (
        <span className="loom-drop-hint">
          <PlugZap size={14} /> 松开挂载插件
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
          className={`loom-edge-label ${loop ? 'loop' : ''} ${selected ? 'selected' : ''}`}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
        >
          {label ? <span className="loom-edge-text">{label}</span> : null}
          {selected && edgeData?.onDelete ? (
            <button
              type="button"
              className="loom-edge-delete"
              title="删除这条连线"
              aria-label="删除这条连线"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                edgeData?.onDelete?.(id)
              }}
            >
              <X size={11} />
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
  readOnly?: boolean
  height?: number
}) {
  const narrow = useNarrowCanvas()
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
          color: agent?.color ?? (node.type === 'input' ? '#2F6F6A' : node.type === 'output' ? '#D4552D' : '#5B5F9E'),
          kind: node.type,
          status: info?.status ?? 'pending',
          score: info?.score,
          iteration: info?.iteration,
          pluginIds,
          pluginDefs: pluginIds.map((id) => plugins.find((plugin) => plugin.id === id)).filter(Boolean) as PluginDef[],
          droppable: Boolean(agent) && !readOnly,
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
          ? { stroke: '#D4552D', strokeWidth: 1.4, strokeDasharray: '5 4' }
          : { stroke: '#B9AE9D', strokeWidth: 1.3 },
      markerEnd: { type: MarkerType.ArrowClosed, color: edge.kind === 'loop' ? '#D4552D' : '#B9AE9D' },
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

  return (
    <div className="workflow-canvas" style={{ '--canvas-h': `${height}px` } as CSSProperties}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
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
        defaultViewport={narrow ? { x: 24, y: 44, zoom: 0.9 } : undefined}
        minZoom={0.28}
        maxZoom={1.4}
        connectionRadius={32}
        connectionLineStyle={{ stroke: '#D4552D', strokeWidth: 1.8 }}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ type: 'loom' }}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#CFC6B8" />
        <Controls showInteractive={false} />
        <div className="canvas-touch-hint">拖动平移 · 双指缩放 · 点节点看配置</div>
      </ReactFlow>
    </div>
  )
}
