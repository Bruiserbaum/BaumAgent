const BASE = '/api'

export type TaskStatus = 'queued' | 'running' | 'complete' | 'failed'

export interface Task {
  id: string
  created_at: string
  description: string
  repo_url: string
  base_branch: string
  llm_backend: string
  llm_model: string
  status: TaskStatus
  branch_name: string | null
  pr_url: string | null
  pr_number: number | null
  commit_sha: string | null
  error_message: string | null
  log: string
}

export interface TaskCreate {
  description: string
  repo_url: string
  base_branch?: string
  llm_backend?: string
  llm_model?: string
}

export interface ModelsResponse {
  anthropic: string[]
  openai: string[]
  ollama: string[]
}

export const api = {
  createTask: (data: TaskCreate): Promise<Task> =>
    fetch(`${BASE}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  getTasks: (): Promise<Task[]> =>
    fetch(`${BASE}/tasks`).then(r => r.json()),

  getTask: (id: string): Promise<Task> =>
    fetch(`${BASE}/tasks/${id}`).then(r => r.json()),

  deleteTask: (id: string): Promise<void> =>
    fetch(`${BASE}/tasks/${id}`, { method: 'DELETE' }).then(() => {}),

  getModels: (): Promise<ModelsResponse> =>
    fetch(`${BASE}/models`).then(r => r.json()),
}
