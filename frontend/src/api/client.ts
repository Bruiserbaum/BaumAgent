const BASE = '/api'

export type TaskStatus = 'queued' | 'running' | 'complete' | 'failed'

export interface User {
  id: string
  email: string
  display_name: string
  created_at: string
}

export interface Project {
  id: string
  user_id: string
  name: string
  color: string
  position: number
  created_at: string
}

export interface ProjectCreate {
  name: string
  color?: string
}

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
  user_id?: string | null
  project_id?: string | null
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

export interface DocFormatSettings {
  title_font_size: number
  heading_font_size: number
  body_font_size: number
  header_color: string
  accent_color: string
  include_summary: boolean
  include_links: boolean
  include_images: boolean
  section_style: 'paragraphs' | 'bullets' | 'mixed'
  page_size: 'letter' | 'a4'
  summary_as_bullets: boolean
}

export interface PortalSettings {
  default_llm_backend: string
  default_llm_model: string
  doc_format: DocFormatSettings
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

  getSettings: (): Promise<PortalSettings> =>
    fetch(`${BASE}/settings`).then(r => r.json()),

  updateSettings: (data: PortalSettings): Promise<PortalSettings> =>
    fetch(`${BASE}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  getMe: (): Promise<User> =>
    fetch(`${BASE}/me`).then(r => r.json()),

  getProjects: (): Promise<Project[]> =>
    fetch(`${BASE}/projects`).then(r => r.json()),

  createProject: (data: ProjectCreate): Promise<Project> =>
    fetch(`${BASE}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  updateProject: (id: string, data: Partial<ProjectCreate>): Promise<Project> =>
    fetch(`${BASE}/projects/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  deleteProject: (id: string): Promise<void> =>
    fetch(`${BASE}/projects/${id}`, { method: 'DELETE' }).then(() => {}),

  assignProject: (taskId: string, projectId: string | null): Promise<Task> =>
    fetch(`${BASE}/tasks/${taskId}/project`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId }),
    }).then(r => r.json()),
}
