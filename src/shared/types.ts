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

/** Where a document came from; drives the citation prefix in the KB. */
export type DocKind = 'paper' | 'report' | 'news' | 'filing' | 'other'

export interface KnowledgeDoc {
  id: string
  projectId: string
  title: string
  source: string
  tags: string[]
  content: string
  /** Canonical link (DOI, publisher page) so a citation can be checked. */
  url?: string
  kind?: DocKind
  /** Publication date of the source, not the import date. */
  publishedAt?: string
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
    /** Four-state entailment label; v1 only had supported/unsupported. */
    label?: 'supported' | 'partial' | 'contradicted' | 'unsupported'
    confidence?: number
    checks?: string[]
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

/** Plugin ids that map to an executable tool; keep in sync with server/tools.ts. */
export const TOOL_PLUGIN_IDS: string[] = ['tool.calculator', 'knowledge.retrieve']

/** One executed tool call, kept on the node output so the trace is replayable. */
export interface ToolCall {
  id: string
  name: string
  args: Record<string, unknown>
  result?: unknown
  error?: string
  ms: number
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
  toolCalls?: ToolCall[]
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
  /** Graph at creation time; old runs fall back to the current workflow. */
  graph?: Workflow['graph']
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

/* ---------------------------------------------------------------------------
 * Agent training
 * ------------------------------------------------------------------------ */

/** Upstream context a single agent needs, frozen so scores stay comparable. */
export interface EvalFixture {
  evidence: Array<{ ref: string; docId: string; docTitle: string; quote: string; score?: number }>
  upstream: Array<{
    nodeId: string
    title: string
    data?: Record<string, unknown>
    text?: string
    citations?: Citation[]
    verdict?: Verdict
  }>
  iteration?: number
  feedback?: string
}

/** One fixed evaluation task for a single agent. */
export interface EvalCase {
  id: string
  agentId: string
  title: string
  input: string
  fixture: EvalFixture
  createdAt: string
}

/** One prompt candidate scored against the eval set. */
export interface TrainingCandidate {
  id: string
  label: string
  rationale: string
  prompt: string
  scores: number[]
  average: number
  tokens: number
}

/** A single training episode for one agent. */
export interface TrainingRun {
  id: string
  agentId: string
  status: 'running' | 'done' | 'failed'
  mode: Mode
  baseline?: number
  best?: number
  candidates: TrainingCandidate[]
  cost: number
  tokens: number
  error?: string
  startedAt: string
  finishedAt?: string
}

/** A stored, activatable prompt version. */
export interface TrainingVersion {
  id: string
  agentId: string
  version: number
  systemPrompt: string
  score?: number
  note: string
  isActive: boolean
  createdAt: string
}
