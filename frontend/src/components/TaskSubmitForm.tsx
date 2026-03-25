import { useState, useEffect, FormEvent } from 'react'
import { api, ModelsResponse } from '../api/client'

interface Props {
  onClose: () => void
  onCreated: () => void
}

const card: React.CSSProperties = {
  backgroundColor: '#16213e',
  border: '1px solid #0f3460',
  borderRadius: '10px',
  padding: '28px',
  width: '520px',
  maxWidth: '95vw',
  boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
}

const label: React.CSSProperties = {
  display: 'block',
  color: '#94a3b8',
  fontSize: '13px',
  marginBottom: '5px',
  fontWeight: 600,
}

const input: React.CSSProperties = {
  width: '100%',
  backgroundColor: '#0f172a',
  border: '1px solid #334155',
  borderRadius: '6px',
  color: '#e2e8f0',
  padding: '8px 10px',
  fontSize: '14px',
  boxSizing: 'border-box',
  marginBottom: '14px',
}

const textarea: React.CSSProperties = {
  ...input,
  minHeight: '80px',
  resize: 'vertical',
}

const selectStyle: React.CSSProperties = {
  ...input,
}

const btnRow: React.CSSProperties = {
  display: 'flex',
  gap: '10px',
  justifyContent: 'flex-end',
  marginTop: '6px',
}

const btnPrimary: React.CSSProperties = {
  backgroundColor: '#0f3460',
  color: '#7dd3fc',
  border: '1px solid #1e4d8c',
  borderRadius: '6px',
  padding: '8px 22px',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: '14px',
}

const btnSecondary: React.CSSProperties = {
  backgroundColor: 'transparent',
  color: '#64748b',
  border: '1px solid #334155',
  borderRadius: '6px',
  padding: '8px 18px',
  cursor: 'pointer',
  fontSize: '14px',
}

const errorStyle: React.CSSProperties = {
  color: '#f87171',
  fontSize: '13px',
  marginBottom: '12px',
}

export default function TaskSubmitForm({ onClose, onCreated }: Props) {
  const [description, setDescription] = useState('')
  const [repoUrl, setRepoUrl] = useState('')
  const [baseBranch, setBaseBranch] = useState('main')
  const [backend, setBackend] = useState('anthropic')
  const [model, setModel] = useState('claude-opus-4-6')
  const [models, setModels] = useState<ModelsResponse>({ anthropic: [], openai: [], ollama: [] })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getModels().then(setModels).catch(() => {})
  }, [])

  // When backend changes, default to first available model
  useEffect(() => {
    const list = models[backend as keyof ModelsResponse] ?? []
    if (list.length > 0) setModel(list[0])
  }, [backend, models])

  const modelOptions = models[backend as keyof ModelsResponse] ?? []

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!description.trim()) { setError('Description is required.'); return }
    if (!repoUrl.trim()) { setError('Repo URL is required.'); return }
    setLoading(true)
    try {
      await api.createTask({
        description: description.trim(),
        repo_url: repoUrl.trim(),
        base_branch: baseBranch.trim() || 'main',
        llm_backend: backend,
        llm_model: model,
      })
      onCreated()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create task.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={card}>
      <h2 style={{ margin: '0 0 20px', color: '#7dd3fc', fontSize: '18px' }}>New Agent Task</h2>
      {error && <div style={errorStyle}>{error}</div>}
      <form onSubmit={handleSubmit}>
        <label style={label}>Description *</label>
        <textarea
          style={textarea}
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Describe what the agent should do..."
        />

        <label style={label}>Repository URL *</label>
        <input
          style={input}
          type="url"
          value={repoUrl}
          onChange={e => setRepoUrl(e.target.value)}
          placeholder="https://github.com/owner/repo"
        />

        <label style={label}>Base Branch</label>
        <input
          style={input}
          value={baseBranch}
          onChange={e => setBaseBranch(e.target.value)}
          placeholder="main"
        />

        <label style={label}>LLM Backend</label>
        <select style={selectStyle} value={backend} onChange={e => setBackend(e.target.value)}>
          <option value="anthropic">Anthropic</option>
          <option value="openai">OpenAI</option>
          <option value="ollama">Ollama</option>
        </select>

        <label style={label}>Model</label>
        <select
          style={selectStyle}
          value={model}
          onChange={e => setModel(e.target.value)}
          disabled={modelOptions.length === 0}
        >
          {modelOptions.length === 0 && (
            <option value="">No models available</option>
          )}
          {modelOptions.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        <div style={btnRow}>
          <button type="button" style={btnSecondary} onClick={onClose}>Cancel</button>
          <button type="submit" style={btnPrimary} disabled={loading}>
            {loading ? 'Submitting...' : 'Run Agent'}
          </button>
        </div>
      </form>
    </div>
  )
}
