import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import type {
  Agent,
  Bootstrap,
  EvalCase,
  EvalFixture,
  GraphEdge,
  GraphNode,
  KnowledgeDoc,
  Mode,
  NodeOutput,
  NodeRun,
  PluginDef,
  Project,
  Run,
  RunDetail,
  RunEvent,
  Stats,
  TrainingCandidate,
  TrainingRun,
  TrainingVersion,
  Workflow,
} from '../shared/types.js'
import { PROJECT, seedDatabase, seedTraining, WORKFLOW } from './seed.js'
import { chunkDocument } from './seed.js'

// AGENTLOOM_DB lets the smoke test run against a throwaway file instead of the
// demo database. Default behaviour is unchanged.
const DB_PATH = process.env.AGENTLOOM_DB
  ? path.resolve(process.env.AGENTLOOM_DB)
  : path.join(path.resolve(process.cwd(), 'data'), 'agentloom.db')
const DATA_DIR = path.dirname(DB_PATH)

let db: DatabaseSync

export function getDb(): DatabaseSync {
  return db
}

export function initDb(): DatabaseSync {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  db = new DatabaseSync(DB_PATH)
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      scenario TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      color TEXT NOT NULL,
      model TEXT NOT NULL,
      temperature REAL NOT NULL,
      system_prompt TEXT NOT NULL,
      tools_json TEXT NOT NULL,
      plugins_json TEXT NOT NULL,
      sort INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS plugins (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      icon TEXT NOT NULL,
      color TEXT NOT NULL,
      config_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      source TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      content TEXT NOT NULL,
      url TEXT,
      kind TEXT,
      published_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      idx INTEGER NOT NULL,
      text TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chunks_project ON chunks(project_id);
    CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(document_id);

    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      graph_json TEXT NOT NULL,
      settings_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      workflow_id TEXT NOT NULL,
      graph_json TEXT,
      status TEXT NOT NULL,
      input TEXT NOT NULL,
      output TEXT,
      score REAL,
      cost REAL NOT NULL DEFAULT 0,
      tokens INTEGER NOT NULL DEFAULT 0,
      mode TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS node_runs (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      agent_id TEXT,
      title TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      iteration INTEGER NOT NULL DEFAULT 0,
      output_json TEXT,
      score REAL,
      cost REAL NOT NULL DEFAULT 0,
      tokens INTEGER NOT NULL DEFAULT 0,
      started_at TEXT,
      finished_at TEXT,
      error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_node_runs_run ON node_runs(run_id);

    CREATE TABLE IF NOT EXISTS run_events (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      ts TEXT NOT NULL,
      type TEXT NOT NULL,
      node_id TEXT,
      task_id TEXT,
      message TEXT,
      data_json TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_events_run ON run_events(run_id, seq);

    -- Agent training: versioned prompts, fixed eval cases, one row per run.
    CREATE TABLE IF NOT EXISTS agent_versions (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      system_prompt TEXT NOT NULL,
      score REAL,
      cases_json TEXT NOT NULL DEFAULT '[]',
      note TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_agent_versions ON agent_versions(agent_id, version);

    CREATE TABLE IF NOT EXISTS eval_cases (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      title TEXT NOT NULL,
      input TEXT NOT NULL,
      fixture_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS training_runs (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      status TEXT NOT NULL,
      mode TEXT NOT NULL,
      baseline REAL,
      best REAL,
      candidates_json TEXT,
      cost REAL NOT NULL DEFAULT 0,
      tokens INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_training_agent ON training_runs(agent_id, started_at);
  `)

  const count = db.prepare('SELECT COUNT(*) AS n FROM projects').get() as { n: number }
  if (count.n === 0) {
    seedDatabase(db)
  }
  migrateDocuments(db)
  migrateRunGraph(db)
  migrateAgentTools(db)
  seedTraining(db)
  return db
}

/**
 * One-time schema/data migration for demo databases created before the tool
 * runtime existed. Keeps run history instead of forcing `pnpm reset`.
 */
function migrateAgentTools(database: DatabaseSync) {
  const version = (database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
  if (version >= 1) return
  const row = database
    .prepare("SELECT tools_json, plugins_json FROM agents WHERE id = 'agent-analyst'")
    .get() as { tools_json?: string; plugins_json?: string } | undefined
  if (row) {
    const tools = parseJson<string[]>(row.tools_json, [])
    const plugins = parseJson<string[]>(row.plugins_json, [])
    database
      .prepare("UPDATE agents SET tools_json = ?, plugins_json = ? WHERE id = 'agent-analyst'")
      .run(
        JSON.stringify([...new Set([...tools, 'tool.calculator'])]),
        JSON.stringify([...new Set([...plugins, 'tool.calculator'])]),
      )
  }
  database.exec('PRAGMA user_version = 1')
}

/** Adds the graph snapshot column for runs created before snapshots existed. */
function migrateRunGraph(database: DatabaseSync) {
  const columns = database.prepare('PRAGMA table_info(runs)').all() as Array<{ name: string }>
  if (!columns.some((column) => column.name === 'graph_json')) {
    database.exec('ALTER TABLE runs ADD COLUMN graph_json TEXT')
  }
}

/** Adds the citation columns to a database created before they existed. */
function migrateDocuments(database: DatabaseSync) {
  const columns = database.prepare('PRAGMA table_info(documents)').all() as Array<{ name: string }>
  const has = (name: string) => columns.some((column) => column.name === name)
  if (!has('url')) database.exec('ALTER TABLE documents ADD COLUMN url TEXT')
  if (!has('kind')) database.exec('ALTER TABLE documents ADD COLUMN kind TEXT')
  if (!has('published_at')) database.exec('ALTER TABLE documents ADD COLUMN published_at TEXT')
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export function getProject(): Project {
  const row = db.prepare('SELECT * FROM projects LIMIT 1').get() as Record<string, string>
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    scenario: row.scenario,
    createdAt: row.created_at,
  }
}

export function listAgents(): Agent[] {
  const rows = db.prepare('SELECT * FROM agents ORDER BY sort').all() as Record<string, unknown>[]
  return rows.map((row) => ({
    id: String(row.id),
    projectId: String(row.project_id),
    name: String(row.name),
    role: row.role as Agent['role'],
    title: String(row.title),
    description: String(row.description),
    color: String(row.color),
    model: String(row.model),
    temperature: Number(row.temperature),
    systemPrompt: String(row.system_prompt),
    tools: parseJson<string[]>(row.tools_json as string, []),
    plugins: parseJson<string[]>(row.plugins_json as string, []),
    sort: Number(row.sort),
  }))
}

export function getAgent(id: string): Agent | undefined {
  return listAgents().find((agent) => agent.id === id)
}

export function updateAgent(id: string, patch: Partial<Agent>): Agent | undefined {
  const current = getAgent(id)
  if (!current) return undefined
  const next: Agent = {
    id: current.id,
    projectId: current.projectId,
    name: patch.name ?? current.name,
    role: patch.role ?? current.role,
    title: patch.title ?? current.title,
    description: patch.description ?? current.description,
    color: patch.color ?? current.color,
    model: patch.model ?? current.model,
    temperature: patch.temperature ?? current.temperature,
    systemPrompt: patch.systemPrompt ?? current.systemPrompt,
    tools: patch.tools ?? current.tools,
    plugins: patch.plugins ?? current.plugins,
    sort: patch.sort ?? current.sort,
  }
  db.prepare(
    `UPDATE agents SET name=?, role=?, title=?, description=?, color=?, model=?, temperature=?, system_prompt=?, tools_json=?, plugins_json=? WHERE id=?`,
  ).run(
    next.name,
    next.role,
    next.title,
    next.description,
    next.color,
    next.model,
    next.temperature,
    next.systemPrompt,
    JSON.stringify(next.tools),
    JSON.stringify(next.plugins),
    id,
  )
  return getAgent(id)
}

export function createAgent(input: {
  projectId: string
  name: string
  role: Agent['role']
  title: string
  description: string
  color: string
  model: string
  temperature: number
  systemPrompt: string
  tools: string[]
  plugins: string[]
}): Agent {
  const id = `agent-${crypto.randomUUID().slice(0, 8)}`
  const sort = (db.prepare('SELECT COALESCE(MAX(sort), 0) AS n FROM agents').get() as { n: number }).n + 1
  db.prepare(
    `INSERT INTO agents (id, project_id, name, role, title, description, color, model, temperature, system_prompt, tools_json, plugins_json, sort)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.projectId,
    input.name,
    input.role,
    input.title,
    input.description,
    input.color,
    input.model,
    input.temperature,
    input.systemPrompt,
    JSON.stringify(input.tools),
    JSON.stringify(input.plugins),
    sort,
  )
  return getAgent(id)!
}

export function listPlugins(): PluginDef[] {
  const rows = db.prepare(
    `SELECT * FROM plugins
     ORDER BY CASE category WHEN '认知' THEN 1 WHEN '知识' THEN 2 WHEN '验证' THEN 3 ELSE 4 END, name`,
  ).all() as Record<string, unknown>[]
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    category: row.category as PluginDef['category'],
    description: String(row.description),
    icon: String(row.icon),
    color: String(row.color),
    config: parseJson<Record<string, unknown>>(row.config_json as string, {}),
  }))
}

export function listDocuments(): KnowledgeDoc[] {
  const rows = db.prepare(
    `SELECT d.*, (SELECT COUNT(*) FROM chunks c WHERE c.document_id = d.id) AS chunk_count
     FROM documents d ORDER BY d.created_at DESC`,
  ).all() as Record<string, unknown>[]
  return rows.map((row) => ({
    id: String(row.id),
    projectId: String(row.project_id),
    title: String(row.title),
    source: String(row.source),
    tags: parseJson<string[]>(row.tags_json as string, []),
    content: String(row.content),
    url: row.url ? String(row.url) : undefined,
    kind: row.kind ? (String(row.kind) as KnowledgeDoc['kind']) : undefined,
    publishedAt: row.published_at ? String(row.published_at) : undefined,
    createdAt: String(row.created_at),
    chunkCount: Number(row.chunk_count),
  }))
}

export function addDocument(input: {
  title: string
  source: string
  content: string
  tags: string[]
  url?: string
  kind?: string
  publishedAt?: string
}): KnowledgeDoc {
  const project = getProject()
  const id = `doc-${crypto.randomUUID().slice(0, 8)}`
  const now = new Date().toISOString()
  db.prepare(
    'INSERT INTO documents (id, project_id, title, source, tags_json, content, url, kind, published_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    id,
    project.id,
    input.title,
    input.source || '手动录入',
    JSON.stringify(input.tags),
    input.content,
    input.url || null,
    input.kind || null,
    input.publishedAt || null,
    now,
  )
  chunkDocument(input.content).forEach((text, idx) => {
    db.prepare('INSERT INTO chunks (id, document_id, project_id, idx, text) VALUES (?, ?, ?, ?, ?)').run(
      `${id}-c${idx}`,
      id,
      project.id,
      idx,
      text,
    )
  })
  return listDocuments().find((doc) => doc.id === id)!
}

export function deleteDocument(id: string): boolean {
  const result = db.prepare('DELETE FROM documents WHERE id = ?').run(id)
  db.prepare('DELETE FROM chunks WHERE document_id = ?').run(id)
  return Number(result.changes) > 0
}

export function listChunks(documentId: string): Array<{ id: string; idx: number; text: string }> {
  const rows = db.prepare('SELECT id, idx, text FROM chunks WHERE document_id = ? ORDER BY idx').all(documentId) as Array<Record<string, unknown>>
  return rows.map((row) => ({ id: String(row.id), idx: Number(row.idx), text: String(row.text) }))
}

/** Writes (or refreshes) one training eval case. */
export function upsertEvalCase(input: {
  id: string
  agentId: string
  title: string
  input: string
  fixture: EvalFixture
}): EvalCase {
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO eval_cases (id, agent_id, title, input, fixture_json, created_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET agent_id = excluded.agent_id, title = excluded.title, input = excluded.input, fixture_json = excluded.fixture_json`,
  ).run(input.id, input.agentId, input.title, input.input, JSON.stringify(input.fixture), now)
  return {
    id: input.id,
    agentId: input.agentId,
    title: input.title,
    input: input.input,
    fixture: input.fixture,
    createdAt: now,
  }
}

export function getWorkflow(): Workflow {
  const row = db.prepare('SELECT * FROM workflows LIMIT 1').get() as Record<string, unknown>
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    name: String(row.name),
    description: String(row.description),
    graph: parseJson<{ nodes: GraphNode[]; edges: GraphEdge[] }>(row.graph_json as string, { nodes: [], edges: [] }),
    settings: parseJson<Workflow['settings']>(
      row.settings_json as string,
      WORKFLOW.settings,
    ),
  }
}

export function updateWorkflow(input: { graph?: Workflow['graph']; settings?: Workflow['settings']; name?: string }): Workflow {
  const current = getWorkflow()
  const next: Workflow = {
    ...current,
    name: input.name ?? current.name,
    graph: input.graph ?? current.graph,
    settings: input.settings ?? current.settings,
  }
  db.prepare('UPDATE workflows SET name=?, graph_json=?, settings_json=?, updated_at=? WHERE id=?').run(
    next.name,
    JSON.stringify(next.graph),
    JSON.stringify(next.settings),
    new Date().toISOString(),
    next.id,
  )
  return getWorkflow()
}

export function createRun(input: string, mode: Mode): Run {
  const project = getProject()
  const workflow = getWorkflow()
  const run: Run = {
    id: `run-${crypto.randomUUID().slice(0, 8)}`,
    projectId: project.id,
    workflowId: workflow.id,
    status: 'running',
    input,
    cost: 0,
    tokens: 0,
    graph: workflow.graph,
    mode,
    startedAt: new Date().toISOString(),
  }
  db.prepare(
    'INSERT INTO runs (id, project_id, workflow_id, graph_json, status, input, cost, tokens, mode, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    run.id,
    run.projectId,
    run.workflowId,
    JSON.stringify(run.graph),
    run.status,
    run.input,
    run.cost,
    run.tokens,
    run.mode,
    run.startedAt,
  )
  return run
}

export function updateRun(id: string, patch: Partial<Run>): void {
  const current = getRun(id)
  if (!current) return
  const next = { ...current, ...patch }
  db.prepare(
    'UPDATE runs SET status=?, output=?, score=?, cost=?, tokens=?, finished_at=?, error=? WHERE id=?',
  ).run(
    next.status,
    next.output ?? null,
    next.score ?? null,
    next.cost,
    next.tokens,
    next.finishedAt ?? null,
    next.error ?? null,
    id,
  )
}

export function getRun(id: string): Run | undefined {
  const row = db.prepare(
    `SELECT r.*, (SELECT COALESCE(MAX(nr.iteration), 0) FROM node_runs nr WHERE nr.run_id = r.id AND nr.node_id = 'verifier') AS loops
     FROM runs r WHERE r.id = ?`,
  ).get(id) as Record<string, unknown> | undefined
  if (!row) return undefined
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    workflowId: String(row.workflow_id),
    graph: row.graph_json
      ? parseJson<Workflow['graph']>(String(row.graph_json), { nodes: [], edges: [] })
      : undefined,
    status: row.status as Run['status'],
    input: String(row.input),
    output: row.output ? String(row.output) : undefined,
    score: row.score === null || row.score === undefined ? undefined : Number(row.score),
    cost: Number(row.cost),
    tokens: Number(row.tokens),
    loops: Number(row.loops ?? 0),
    mode: row.mode as Mode,
    startedAt: String(row.started_at),
    finishedAt: row.finished_at ? String(row.finished_at) : undefined,
    error: row.error ? String(row.error) : undefined,
  }
}

export function listRuns(limit = 20): Run[] {
  const rows = db.prepare(
    `SELECT r.*, (SELECT COALESCE(MAX(nr.iteration), 0) FROM node_runs nr WHERE nr.run_id = r.id AND nr.node_id = 'verifier') AS loops
     FROM runs r ORDER BY r.started_at DESC LIMIT ?`,
  ).all(limit) as Record<string, unknown>[]
  return rows.map((row) => ({
    id: String(row.id),
    projectId: String(row.project_id),
    workflowId: String(row.workflow_id),
    status: row.status as Run['status'],
    input: String(row.input),
    output: row.output ? String(row.output) : undefined,
    score: row.score === null || row.score === undefined ? undefined : Number(row.score),
    cost: Number(row.cost),
    tokens: Number(row.tokens),
    loops: Number(row.loops ?? 0),
    mode: row.mode as Mode,
    startedAt: String(row.started_at),
    finishedAt: row.finished_at ? String(row.finished_at) : undefined,
    error: row.error ? String(row.error) : undefined,
  }))
}

export function createNodeRun(input: {
  runId: string
  nodeId: string
  agentId?: string
  title: string
  kind: string
  iteration: number
}): NodeRun {
  const node: NodeRun = {
    id: `nr-${crypto.randomUUID().slice(0, 8)}`,
    runId: input.runId,
    nodeId: input.nodeId,
    agentId: input.agentId,
    title: input.title,
    kind: input.kind,
    status: 'running',
    iteration: input.iteration,
    cost: 0,
    tokens: 0,
    startedAt: new Date().toISOString(),
  }
  db.prepare(
    'INSERT INTO node_runs (id, run_id, node_id, agent_id, title, kind, status, iteration, cost, tokens, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    node.id,
    node.runId,
    node.nodeId,
    node.agentId ?? null,
    node.title,
    node.kind,
    node.status,
    node.iteration,
    node.cost,
    node.tokens,
    node.startedAt!,
  )
  return node
}

export function updateNodeRun(id: string, patch: Partial<NodeRun>): void {
  const current = getNodeRun(id)
  if (!current) return
  const next = { ...current, ...patch }
  db.prepare(
    'UPDATE node_runs SET status=?, output_json=?, score=?, cost=?, tokens=?, finished_at=?, error=? WHERE id=?',
  ).run(
    next.status,
    next.output ? JSON.stringify(next.output) : null,
    next.score ?? null,
    next.cost,
    next.tokens,
    next.finishedAt ?? null,
    next.error ?? null,
    id,
  )
}

export function getNodeRun(id: string): NodeRun | undefined {
  const row = db.prepare('SELECT * FROM node_runs WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!row) return undefined
  return mapNodeRun(row)
}

export function listNodeRuns(runId: string): NodeRun[] {
  const rows = db.prepare('SELECT * FROM node_runs WHERE run_id = ? ORDER BY started_at').all(runId) as Record<string, unknown>[]
  return rows.map(mapNodeRun)
}

function mapNodeRun(row: Record<string, unknown>): NodeRun {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    nodeId: String(row.node_id),
    agentId: row.agent_id ? String(row.agent_id) : undefined,
    title: String(row.title),
    kind: String(row.kind),
    status: row.status as NodeRun['status'],
    iteration: Number(row.iteration),
    output: parseJson<NodeOutput | undefined>(row.output_json as string, undefined),
    score: row.score === null || row.score === undefined ? undefined : Number(row.score),
    cost: Number(row.cost),
    tokens: Number(row.tokens),
    startedAt: row.started_at ? String(row.started_at) : undefined,
    finishedAt: row.finished_at ? String(row.finished_at) : undefined,
    error: row.error ? String(row.error) : undefined,
  }
}

export function appendEvent(input: Omit<RunEvent, 'seq'>): RunEvent {
  const result = db.prepare(
    'INSERT INTO run_events (run_id, ts, type, node_id, task_id, message, data_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(
    input.runId,
    input.ts,
    input.type,
    input.nodeId ?? null,
    input.taskId ?? null,
    input.message ?? null,
    input.data ? JSON.stringify(input.data) : null,
  )
  return { ...input, seq: Number(result.lastInsertRowid) }
}

export function listEvents(runId: string): RunEvent[] {
  const rows = db.prepare('SELECT * FROM run_events WHERE run_id = ? ORDER BY seq').all(runId) as Record<string, unknown>[]
  return rows.map((row) => ({
    seq: Number(row.seq),
    runId: String(row.run_id),
    ts: String(row.ts),
    type: String(row.type),
    nodeId: row.node_id ? String(row.node_id) : undefined,
    taskId: row.task_id ? String(row.task_id) : undefined,
    message: row.message ? String(row.message) : undefined,
    data: parseJson<Record<string, unknown> | undefined>(row.data_json as string, undefined),
  }))
}

export function getRunDetail(id: string): RunDetail | undefined {
  const run = getRun(id)
  if (!run) return undefined
  return { run, nodes: listNodeRuns(id), events: listEvents(id) }
}

export function getStats(): Stats {
  const runs = listRuns(500)
  const completed = runs.filter((run) => run.status === 'completed')
  const scores = completed.map((run) => run.score ?? 0).filter((score) => score > 0)
  return {
    runs: runs.length,
    passRate: completed.length === 0 ? 0 : Math.round((scores.filter((score) => score >= 0.8).length / completed.length) * 100),
    docs: listDocuments().length,
    agents: listAgents().length,
    avgScore: scores.length === 0 ? 0 : Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)),
    totalTokens: runs.reduce((sum, run) => sum + run.tokens, 0),
  }
}

export function getBootstrap(mode: Mode): Bootstrap {
  return {
    project: getProject() ?? PROJECT,
    agents: listAgents(),
    plugins: listPlugins(),
    workflow: getWorkflow(),
    documents: listDocuments(),
    runs: listRuns(),
    stats: getStats(),
    mode,
  }
}

/* ---------------------------------------------------------------------------
 * Agent training storage
 * ------------------------------------------------------------------------ */

function mapVersion(row: Record<string, unknown>): TrainingVersion {
  return {
    id: String(row.id),
    agentId: String(row.agent_id),
    version: Number(row.version),
    systemPrompt: String(row.system_prompt),
    score: row.score === null || row.score === undefined ? undefined : Number(row.score),
    note: String(row.note ?? ''),
    isActive: Number(row.is_active) === 1,
    createdAt: String(row.created_at),
  }
}

function mapTrainingRun(row: Record<string, unknown>): TrainingRun {
  return {
    id: String(row.id),
    agentId: String(row.agent_id),
    status: row.status as TrainingRun['status'],
    mode: row.mode as Mode,
    baseline: row.baseline === null || row.baseline === undefined ? undefined : Number(row.baseline),
    best: row.best === null || row.best === undefined ? undefined : Number(row.best),
    candidates: parseJson<TrainingCandidate[]>(row.candidates_json as string | null, []),
    cost: Number(row.cost),
    tokens: Number(row.tokens),
    error: row.error ? String(row.error) : undefined,
    startedAt: String(row.started_at),
    finishedAt: row.finished_at ? String(row.finished_at) : undefined,
  }
}

export function listEvalCases(agentId: string): EvalCase[] {
  const rows = db.prepare('SELECT * FROM eval_cases WHERE agent_id = ? ORDER BY id').all(agentId) as Record<string, unknown>[]
  return rows.map((row) => ({
    id: String(row.id),
    agentId: String(row.agent_id),
    title: String(row.title),
    input: String(row.input),
    fixture: parseJson<EvalFixture>(row.fixture_json as string, { evidence: [], upstream: [] }),
    createdAt: String(row.created_at),
  }))
}

export function countEvalCases(): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM eval_cases').get() as { n: number }).n
}

export function listVersions(agentId: string): TrainingVersion[] {
  const rows = db.prepare('SELECT * FROM agent_versions WHERE agent_id = ? ORDER BY version DESC').all(agentId) as Record<string, unknown>[]
  return rows.map(mapVersion)
}

export function countVersions(): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM agent_versions').get() as { n: number }).n
}

export function createVersion(input: {
  agentId: string
  systemPrompt: string
  score?: number
  note: string
}): TrainingVersion {
  const last = db.prepare('SELECT COALESCE(MAX(version), 0) AS n FROM agent_versions WHERE agent_id = ?').get(input.agentId) as { n: number }
  const version = last.n + 1
  const id = `ver-${crypto.randomUUID().slice(0, 8)}`
  db.prepare(
    'INSERT INTO agent_versions (id, agent_id, version, system_prompt, score, cases_json, note, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)',
  ).run(id, input.agentId, version, input.systemPrompt, input.score ?? null, '[]', input.note, new Date().toISOString())
  const created = listVersions(input.agentId).find((item) => item.id === id)
  return created ?? { id, agentId: input.agentId, version, systemPrompt: input.systemPrompt, score: input.score, note: input.note, isActive: false, createdAt: new Date().toISOString() }
}

/** Makes one version the live prompt for its agent and points the agent at it. */
export function activateVersion(versionId: string): TrainingVersion | undefined {
  const row = db.prepare('SELECT * FROM agent_versions WHERE id = ?').get(versionId) as Record<string, unknown> | undefined
  if (!row) return undefined
  const version = mapVersion(row)
  db.exec('BEGIN')
  try {
    db.prepare('UPDATE agent_versions SET is_active = 0 WHERE agent_id = ?').run(version.agentId)
    db.prepare('UPDATE agent_versions SET is_active = 1 WHERE id = ?').run(versionId)
    db.prepare('UPDATE agents SET system_prompt = ? WHERE id = ?').run(version.systemPrompt, version.agentId)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  return { ...version, isActive: true }
}

export function createTrainingRun(agentId: string, mode: Mode): TrainingRun {
  const run: TrainingRun = {
    id: `tr-${crypto.randomUUID().slice(0, 8)}`,
    agentId,
    status: 'running',
    mode,
    candidates: [],
    cost: 0,
    tokens: 0,
    startedAt: new Date().toISOString(),
  }
  db.prepare(
    'INSERT INTO training_runs (id, agent_id, status, mode, baseline, best, candidates_json, cost, tokens, started_at) VALUES (?, ?, ?, ?, NULL, NULL, NULL, 0, 0, ?)',
  ).run(run.id, run.agentId, run.status, run.mode, run.startedAt)
  return run
}

export function updateTrainingRun(id: string, patch: Partial<TrainingRun>): void {
  const current = getTrainingRun(id)
  if (!current) return
  const next = { ...current, ...patch }
  db.prepare(
    'UPDATE training_runs SET status = ?, baseline = ?, best = ?, candidates_json = ?, cost = ?, tokens = ?, error = ?, finished_at = ? WHERE id = ?',
  ).run(
    next.status,
    next.baseline ?? null,
    next.best ?? null,
    JSON.stringify(next.candidates ?? []),
    next.cost,
    next.tokens,
    next.error ?? null,
    next.finishedAt ?? null,
    id,
  )
}

export function getTrainingRun(id: string): TrainingRun | undefined {
  const row = db.prepare('SELECT * FROM training_runs WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return row ? mapTrainingRun(row) : undefined
}

export function listTrainingRuns(agentId: string, limit = 8): TrainingRun[] {
  const rows = db.prepare('SELECT * FROM training_runs WHERE agent_id = ? ORDER BY started_at DESC LIMIT ?').all(agentId, limit) as Record<string, unknown>[]
  return rows.map(mapTrainingRun)
}
