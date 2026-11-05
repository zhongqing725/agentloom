export type RunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
export type NodeStatus = 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'waiting' | 'skipped'
export type AgentRole = 'planner' | 'researcher' | 'analyst' | 'writer' | 'verifier' | 'editor' | 'specialist'
export type NodeKind = 'input' | 'agent' | 'verifier' | 'output'
export type Mode = 'mock' | 'live'

export interface Project {
  id: string
  name: string
  description: string
  scenario: string
  createdAt: string
}

export interface KnowledgeDoc {
  id: string
  projectId: string
  title: string
  source: string
  tags: string[]
  content: string
  createdAt: string
  chunkCount: number
}

export interface Agent {
  id: string
  projectId: string
  name: string
  role: AgentRole
  title: string
  description: string
  color: string
  model: string
  temperature: number
  systemPrompt: string
  tools: string[]
  plugins: string[]
  sort: number
}

export interface PluginDef {
  id: string
  name: string
  category: '知识' | '认知' | '验证' | '工具'
  description: string
  icon: string
  color: string
  config: Record<string, unknown>
}

export interface GraphNodeData {
  label: string
  subtitle?: string
  agentId?: string
  angle?: string
  pluginIds?: string[]
  kind?: NodeKind
}

export interface GraphNode {
  id: string
  type: NodeKind
  position: { x: number; y: number }
  data: GraphNodeData
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  kind?: 'flow' | 'loop'
  label?: string
}

export interface Workflow {
  id: string
  projectId: string
  name: string
  description: string
  graph: { nodes: GraphNode[]; edges: GraphEdge[] }
  settings: {
    maxConcurrency: number
    budgetUsd: number
    maxLoop: number
    verifyThreshold: number
  }
}

export interface Citation {
  id: string
  docId?: string
  docTitle: string
  quote: string
  score?: number
}

export interface Usage {
  promptTokens: number
  completionTokens: number
  cost: number
}

export type IssueType = 'citation' | 'number' | 'logic' | 'coverage' | 'wording' | 'other'

export interface VerdictRoute {
  type: IssueType
  target: string
  message: string
}

export interface Verdict {
  passed: boolean
  score: number
  issues: string[]
  routes?: VerdictRoute[]
  selectedTarget?: string
  selectedType?: IssueType
  claims?: Array<{
    claim: string
    citation: string | null
    supported: boolean
    reason: string
  }>
}

export interface Candidate {
  id: string
  name: string
  stance: string
  points: string[]
  score?: number
  rationale?: string
}

export interface NodeOutput {
  text?: string
  markdown?: string
  data?: Record<string, unknown>
  citations?: Citation[]
  score?: number
  usage?: Usage
  verdict?: Verdict
  candidates?: Candidate[]
  chosenId?: string
  judge?: string
  feedback?: string
}

export interface Run {
  id: string
  projectId: string
  workflowId: string
  status: RunStatus
  input: string
  output?: string
  score?: number
  cost: number
  tokens: number
  loops?: number
  mode: Mode
  startedAt: string
  finishedAt?: string
  error?: string
}

export interface NodeRun {
  id: string
  runId: string
  nodeId: string
  agentId?: string
  title: string
  kind: string
  status: NodeStatus
  iteration: number
  output?: NodeOutput
  score?: number
  cost: number
  tokens: number
  startedAt?: string
  finishedAt?: string
  error?: string
}

export interface RunEvent {
  seq: number
  runId: string
  ts: string
  type: string
  nodeId?: string
  taskId?: string
  message?: string
  data?: Record<string, unknown>
}

export interface Stats {
  runs: number
  passRate: number
  docs: number
  agents: number
  avgScore: number
  totalTokens: number
}

export interface Bootstrap {
  project: Project
  agents: Agent[]
  plugins: PluginDef[]
  workflow: Workflow
  documents: KnowledgeDoc[]
  runs: Run[]
  stats: Stats
  mode: Mode
}

export interface RunDetail {
  run: Run
  nodes: NodeRun[]
  events: RunEvent[]
}

export interface SearchHit {
  chunkId: string
  docId: string
  docTitle: string
  text: string
  score: number
}
