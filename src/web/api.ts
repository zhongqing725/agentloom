import type {
  Agent,
  Bootstrap,
  EvalCase,
  KnowledgeDoc,
  Run,
  RunDetail,
  SearchHit,
  TrainingRun,
  TrainingVersion,
  Workflow,
} from '../shared/types'

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(init?.headers ?? {}),
    },
  })
  if (!response.ok) {
    const detail = await response.text()
    let message = detail
    try {
      message = (JSON.parse(detail) as { error?: string }).error ?? detail
    } catch {
      // keep raw text
    }
    throw new Error(message || `请求失败：${response.status}`)
  }
  return (await response.json()) as T
}

export const api = {
  bootstrap: () => request<Bootstrap>('/api/bootstrap'),
  config: () => request<{ mode: 'mock' | 'live'; model: string; baseUrl: string; hasKey: boolean }>('/api/config'),
  setConfig: (input: { apiKey?: string; baseUrl?: string; model?: string; mode?: 'mock' | 'live' }) =>
    request<{ mode: 'mock' | 'live'; model: string; baseUrl: string; hasKey: boolean }>('/api/config', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  documents: () => request<{ documents: KnowledgeDoc[] }>('/api/documents'),
  addDocument: (input: {
    title: string
    source: string
    content: string
    tags: string[]
    url?: string
    kind?: string
    publishedAt?: string
  }) => request<{ document: KnowledgeDoc }>('/api/documents', { method: 'POST', body: JSON.stringify(input) }),
  uploadDocument: (form: FormData) =>
    request<{ document: KnowledgeDoc }>('/api/documents', { method: 'POST', body: form }),
  deleteDocument: (id: string) => request<{ ok: boolean }>(`/api/documents/${id}`, { method: 'DELETE' }),
  search: (query: string, limit = 6) =>
    request<{ hits: SearchHit[] }>('/api/kb/search', { method: 'POST', body: JSON.stringify({ query, limit }) }),
  createAgent: (input: {
    name: string
    title: string
    description?: string
    color?: string
    plugins?: string[]
    tools?: string[]
    systemPrompt?: string
    temperature?: number
  }) => request<{ agent: Agent }>('/api/agents', { method: 'POST', body: JSON.stringify(input) }),
  updateAgent: (id: string, patch: Partial<Agent>) =>
    request<{ agent: Agent }>(`/api/agents/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
  updateWorkflow: (patch: { graph?: Workflow['graph']; settings?: Workflow['settings']; name?: string }) =>
    request<{ workflow: Workflow }>('/api/workflow', { method: 'PUT', body: JSON.stringify(patch) }),
  runs: (limit = 30) => request<{ runs: Run[] }>(`/api/runs?limit=${limit}`),
  createRun: (input: string) =>
    request<{ run: Run }>('/api/runs', { method: 'POST', body: JSON.stringify({ input }) }),
  getRun: (id: string) => request<RunDetail>(`/api/runs/${id}`),
  cancelRun: (id: string) => request<{ ok: boolean }>(`/api/runs/${id}/cancel`, { method: 'POST' }),
  training: (agentId: string) =>
    request<{ cases: EvalCase[]; versions: TrainingVersion[]; runs: TrainingRun[] }>(
      `/api/training?agentId=${encodeURIComponent(agentId)}`,
    ),
  startTraining: (agentId: string) =>
    request<{ run: TrainingRun }>('/api/training', { method: 'POST', body: JSON.stringify({ agentId }) }),
  getTrainingRun: (id: string) => request<{ run: TrainingRun }>(`/api/training/${id}`),
  activateTraining: (id: string, candidateId: string) =>
    request<{ agent: Agent; version: TrainingVersion }>(`/api/training/${id}/activate`, {
      method: 'POST',
      body: JSON.stringify({ candidateId }),
    }),
  activateVersion: (versionId: string) =>
    request<{ agent: Agent; version: TrainingVersion }>(`/api/training/versions/${versionId}/activate`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  reportUrl: (id: string) => `/api/runs/${id}/report`,
}
