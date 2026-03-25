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
  task_type: string
  output_file: string | null
  output_format: string | null
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
  createTask: (data: FormData): Promise<Task> =>
    fetch(`${BASE}/tasks`, { method: 'POST', body: data }).then(r => r.json()),

  getTasks: (): Promise<Task[]> =>
    fetch(`${BASE}/tasks`).then(r => r.json()),

  getTask: (id: string): Promise<Task> =>
    fetch(`${BASE}/tasks/${id}`).then(r => r.json()),

  deleteTask: (id: string): Promise<void> =>
    fetch(`${BASE}/tasks/${id}`, { method: 'DELETE' }).then(() => {}),

  getModels: (): Promise<ModelsResponse> =>
    fetch(`${BASE}/models`).then(r => r.json()),

  downloadTask: (id: string): void => {
    window.open(`${BASE}/tasks/${id}/download`, '_blank')
  },
}
