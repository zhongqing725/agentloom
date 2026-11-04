import { useEffect, useMemo, type CSSProperties } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Bot, FileText, Play, ShieldCheck } from 'lucide-react'
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
  [key: string]: unknown
}

function LoomNode({ data, selected }: NodeProps<Node<FlowNodeData>>) {
  const status = data.status ?? 'pending'
  const Icon = data.kind === 'input' ? Play : data.kind === 'output' ? FileText : data.kind === 'verifier' ? ShieldCheck : Bot
  return (
    <div
      className={`loom-node kind-${data.kind} status-${status} ${selected ? 'selected' : ''}`}
      style={{ '--node-color': data.color } as CSSProperties}
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
          </div>
          {data.iteration !== undefined && data.iteration > 0 && <span className="loom-iter">L{data.iteration + 1}</span>}
        </div>
      </div>
      {data.kind !== 'output' && <Handle type="source" position={Position.Right} className="loom-handle" />}
    </div>
  )
}

const nodeTypes = { loom: LoomNode }

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
  readOnly = false,
  height = 520,
}: {
  graph: { nodes: GraphNode[]; edges: GraphEdge[] }
  agents: Agent[]
  plugins: PluginDef[]
  statuses?: Map<string, NodeStatusInfo>
  onNodeClick?: (nodeId: string) => void
  onNodeDragStop?: (nodeId: string, position: { x: number; y: number }) => void
  readOnly?: boolean
  height?: number
}) {
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
        },
      }
    })
  }, [graph, agents, plugins, statuses])

  const initialEdges = useMemo<Edge[]>(() => {
    return graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: edge.kind === 'loop' ? 'default' : 'smoothstep',
      animated: edge.kind === 'loop',
      label: edge.label,
      labelStyle: { fill: '#8A6A3B', fontSize: 10, fontWeight: 600 },
      labelBgStyle: { fill: '#F3EFE7', fillOpacity: 0.95 },
      style:
        edge.kind === 'loop'
          ? { stroke: '#D4552D', strokeWidth: 1.4, strokeDasharray: '5 4' }
          : { stroke: '#B9AE9D', strokeWidth: 1.3 },
      markerEnd: { type: MarkerType.ArrowClosed, color: edge.kind === 'loop' ? '#D4552D' : '#B9AE9D' },
    }))
  }, [graph])

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<FlowNodeData>>(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges)

  useEffect(() => {
    setNodes(initialNodes)
  }, [initialNodes, setNodes])

  useEffect(() => {
    setEdges(initialEdges)
  }, [initialEdges, setEdges])

  return (
    <div className="workflow-canvas" style={{ height }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_, node) => onNodeClick?.(node.id)}
        onNodeDragStop={(_, node) => onNodeDragStop?.(node.id, node.position)}
        nodesDraggable={!readOnly}
        nodesConnectable={false}
        edgesFocusable={false}
        elementsSelectable
        fitView
        fitViewOptions={{ padding: 0.08 }}
        minZoom={0.35}
        maxZoom={1.4}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ type: 'smoothstep' }}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#CFC6B8" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
