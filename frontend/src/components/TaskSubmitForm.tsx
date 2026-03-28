import { useState, useEffect, useRef, FormEvent, DragEvent, ClipboardEvent } from 'react'
import { api, ModelsResponse, Project, GithubRepo, PortalSettings } from '../api/client'

interface Props {
  onClose: () => void
  onCreated: () => void
  projects?: Project[]
}

const card: React.CSSProperties = {
  backgroundColor: '#16213e',
  border: '1px solid #0f3460',
  borderRadius: '10px',
  padding: '28px',
  width: '560px',
  maxWidth: '95vw',
  boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
  maxHeight: '90vh',
  overflowY: 'auto',
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
  marginBottom: '0',
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

// Speech recognition type shim — use any-based constructor to avoid DOM lib variance
/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    SpeechRecognition: new () => any
    webkitSpeechRecognition: new () => any
  }
}

export default function TaskSubmitForm({ onClose, onCreated, projects }: Props) {
  const [taskType, setTaskType] = useState<'code' | 'research' | 'coding'>('code')
  const [description, setDescription] = useState('')
  const [repoUrl, setRepoUrl] = useState('')
  const [baseBranch, setBaseBranch] = useState('main')
  const [outputFormat, setOutputFormat] = useState<'pdf' | 'docx'>('pdf')
  const [backend, setBackend] = useState('anthropic')
  const [model, setModel] = useState('')
  const [models, setModels] = useState<ModelsResponse>({ anthropic: [], openai: [], ollama: [] })
  const [portalSettings, setPortalSettings] = useState<PortalSettings | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [projectId, setProjectId] = useState<string>('')

  // Repo dropdown state
  const [repos, setRepos] = useState<GithubRepo[]>([])
  const [repoSearch, setRepoSearch] = useState('')
  const [repoDropdownOpen, setRepoDropdownOpen] = useState(false)
  const [selectedRepo, setSelectedRepo] = useState<GithubRepo | null>(null)
  const repoDropdownRef = useRef<HTMLDivElement>(null)

  // Image state
  const [images, setImages] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const [isDragOver, setIsDragOver] = useState(false)

  // Speech recognition state
  const [isRecording, setIsRecording] = useState(false)
  const [speechSupported, setSpeechSupported] = useState(false)
  const recognitionRef = useRef<any>(null)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    api.getRepos().then(setRepos).catch(() => {})
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    setSpeechSupported(!!SR)

    Promise.all([api.getModels(), api.getSettings()]).then(([m, s]) => {
      setModels(m)
      setPortalSettings(s)
      // Apply code-task defaults from settings
      const b = s.code_backend || s.default_llm_backend || 'anthropic'
      const mdl = s.code_model || s.default_llm_model || ''
      setBackend(b)
      setModel(mdl || (m[b as keyof ModelsResponse]?.[0] ?? ''))
    }).catch(() => {})
  }, [])

  // Close repo dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (repoDropdownRef.current && !repoDropdownRef.current.contains(e.target as Node)) {
        setRepoDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filteredRepos = repos.filter(r =>
    r.full_name.toLowerCase().includes(repoSearch.toLowerCase()) ||
    r.description.toLowerCase().includes(repoSearch.toLowerCase())
  )

  const selectRepo = (repo: GithubRepo) => {
    setSelectedRepo(repo)
    setRepoUrl(repo.html_url)
    setBaseBranch(repo.default_branch)
    setRepoDropdownOpen(false)
    setRepoSearch('')
  }

  // When task type changes, switch to per-context defaults
  useEffect(() => {
    if (!portalSettings) return
    const s = portalSettings
    let b: string, mdl: string
    if (taskType === 'research') {
      b = s.research_backend || s.default_llm_backend || 'anthropic'
      mdl = s.research_model || s.default_llm_model || ''
    } else if (taskType === 'coding') {
      b = (s as any).coding_backend || s.code_backend || s.default_llm_backend || 'anthropic'
      mdl = (s as any).coding_model || s.code_model || s.default_llm_model || ''
    } else {
      b = s.code_backend || s.default_llm_backend || 'anthropic'
      mdl = s.code_model || s.default_llm_model || ''
    }
    setBackend(b)
    setModel(mdl || models[b as keyof ModelsResponse]?.[0] || '')
  }, [taskType, portalSettings]) // eslint-disable-line react-hooks/exhaustive-deps

  // When backend changes manually, default to first available model
  useEffect(() => {
    const list = models[backend as keyof ModelsResponse] ?? []
    if (list.length > 0 && !model) setModel(list[0])
  }, [backend, models]) // eslint-disable-line react-hooks/exhaustive-deps

  const modelOptions = models[backend as keyof ModelsResponse] ?? []

  // ------------------------------------------------------------------
  // Image helpers
  // ------------------------------------------------------------------

  const addFiles = (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (imageFiles.length === 0) return
    const newImages = [...images, ...imageFiles]
    setImages(newImages)
    // Generate previews
    imageFiles.forEach(file => {
      const reader = new FileReader()
      reader.onload = (e) => {
        setImagePreviews(prev => [...prev, e.target?.result as string])
      }
      reader.readAsDataURL(file)
    })
  }

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index))
    setImagePreviews(prev => prev.filter((_, i) => i !== index))
  }

  const handlePaste = (e: ClipboardEvent<HTMLFormElement>) => {
    const items = e.clipboardData?.items
    if (!items) return
    const imageItems: File[] = []
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile()
        if (file) imageItems.push(file)
      }
    }
    if (imageItems.length > 0) {
      e.preventDefault()
      addFiles(imageItems)
    }
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = () => setIsDragOver(false)

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(false)
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files)
  }

  // ------------------------------------------------------------------
  // Speech recognition
  // ------------------------------------------------------------------

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop()
      setIsRecording(false)
      return
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return

    const recognition = new SR()
    recognition.continuous = true
    recognition.interimResults = false
    recognition.lang = 'en-US'

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .slice(event.resultIndex)
        .map(r => r[0].transcript)
        .join(' ')
      setDescription(prev => prev ? prev + ' ' + transcript.trim() : transcript.trim())
    }

    recognition.onerror = () => {
      setIsRecording(false)
    }

    recognition.onend = () => {
      setIsRecording(false)
    }

    recognitionRef.current = recognition
    recognition.start()
    setIsRecording(true)
  }

  // ------------------------------------------------------------------
  // Submit
  // ------------------------------------------------------------------

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!description.trim()) { setError('Description is required.'); return }
    if (taskType === 'code' && !repoUrl.trim()) { setError('Repo URL is required for Github Coding tasks.'); return }
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('description', description.trim())
      formData.append('repo_url', taskType === 'code' ? repoUrl.trim() : '')
      formData.append('base_branch', baseBranch.trim() || 'main')
      formData.append('llm_backend', backend)
      formData.append('llm_model', model)
      formData.append('task_type', taskType)
      if (taskType === 'research') {
        formData.append('output_format', outputFormat)
      }
      if (projectId) formData.append('project_id', projectId)
      images.forEach(img => formData.append('images', img))

      await api.createTask(formData)
      onCreated()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create task.')
    } finally {
      setLoading(false)
    }
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  const tabActive: React.CSSProperties = {
    backgroundColor: '#0f3460',
    color: '#7dd3fc',
    border: '1px solid #1e4d8c',
    borderRadius: '6px',
    padding: '6px 18px',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: '13px',
  }

  const tabInactive: React.CSSProperties = {
    backgroundColor: 'transparent',
    color: '#64748b',
    border: '1px solid #334155',
    borderRadius: '6px',
    padding: '6px 18px',
    cursor: 'pointer',
    fontSize: '13px',
  }

  const micBtnStyle: React.CSSProperties = {
    flexShrink: 0,
    backgroundColor: isRecording ? '#7f1d1d' : '#1e293b',
    border: `1px solid ${isRecording ? '#ef4444' : '#334155'}`,
    borderRadius: '6px',
    color: isRecording ? '#fca5a5' : '#94a3b8',
    padding: '8px 10px',
    cursor: speechSupported ? 'pointer' : 'not-allowed',
    fontSize: '16px',
    animation: isRecording ? 'micPulse 1s infinite' : undefined,
  }

  const dropZoneStyle: React.CSSProperties = {
    border: `2px dashed ${isDragOver ? '#7dd3fc' : '#334155'}`,
    borderRadius: '6px',
    padding: '12px',
    marginBottom: '14px',
    backgroundColor: isDragOver ? '#0f2040' : '#0f172a',
    transition: 'all 0.15s',
    minHeight: '48px',
  }

  return (
    <div style={card}>
      <style>{`
        @keyframes micPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>
      <h2 style={{ margin: '0 0 20px', color: '#7dd3fc', fontSize: '18px' }}>New Agent Task</h2>

      {/* Task type toggle */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button type="button" style={taskType === 'code' ? tabActive : tabInactive} onClick={() => setTaskType('code')}>
          Github Coding
        </button>
        <button type="button" style={taskType === 'coding' ? tabActive : tabInactive} onClick={() => setTaskType('coding')}>
          Coding
        </button>
        <button type="button" style={taskType === 'research' ? tabActive : tabInactive} onClick={() => setTaskType('research')}>
          Research
        </button>
      </div>

      {error && <div style={errorStyle}>{error}</div>}

      <form ref={formRef} onSubmit={handleSubmit} onPaste={handlePaste}>
        {/* Description + mic */}
        <label style={label}>Description *</label>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', alignItems: 'flex-start' }}>
          <textarea
            style={{ ...textarea, flex: 1 }}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder={
              taskType === 'research' ? 'What would you like researched?' :
              taskType === 'coding' ? 'Describe the script or code to generate...' :
              'Describe what the agent should do in the repository...'
            }
          />
          <button
            type="button"
            style={micBtnStyle}
            onClick={toggleRecording}
            title={speechSupported
              ? (isRecording ? 'Stop recording' : 'Start voice input')
              : 'Speech recognition not supported in this browser'}
          >
            🎤
          </button>
        </div>

        {/* Image drop zone */}
        <label style={label}>Images (optional)</label>
        <div
          style={dropZoneStyle}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {imagePreviews.length === 0 ? (
            <div style={{ color: '#475569', fontSize: '13px', textAlign: 'center' }}>
              Paste or drag images here
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {imagePreviews.map((src, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  <img
                    src={src}
                    alt={`attachment ${i + 1}`}
                    style={{ width: '72px', height: '72px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #334155' }}
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    style={{
                      position: 'absolute',
                      top: '-6px',
                      right: '-6px',
                      backgroundColor: '#7f1d1d',
                      color: '#fca5a5',
                      border: 'none',
                      borderRadius: '50%',
                      width: '18px',
                      height: '18px',
                      fontSize: '11px',
                      cursor: 'pointer',
                      lineHeight: '18px',
                      textAlign: 'center',
                      padding: 0,
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Github Coding-only fields */}
        {taskType === 'code' && (
          <>
            <label style={label}>Repository *</label>
            {repos.length > 0 ? (
              <div ref={repoDropdownRef} style={{ position: 'relative', marginBottom: '14px' }}>
                {/* Trigger button */}
                <div
                  onClick={() => setRepoDropdownOpen(v => !v)}
                  style={{
                    ...input,
                    marginBottom: 0,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    userSelect: 'none',
                  }}
                >
                  <span style={{ color: selectedRepo ? '#e2e8f0' : '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedRepo ? selectedRepo.full_name : 'Select a repository…'}
                  </span>
                  <span style={{ color: '#475569', fontSize: '11px', flexShrink: 0, marginLeft: '8px' }}>▾</span>
                </div>

                {/* Dropdown panel */}
                {repoDropdownOpen && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                    backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px',
                    zIndex: 50, maxHeight: '220px', display: 'flex', flexDirection: 'column',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                  }}>
                    <input
                      autoFocus
                      value={repoSearch}
                      onChange={e => setRepoSearch(e.target.value)}
                      placeholder="Filter repositories…"
                      style={{
                        ...input,
                        margin: '6px', width: 'calc(100% - 12px)', boxSizing: 'border-box',
                        marginBottom: '0', borderRadius: '4px', fontSize: '13px',
                      }}
                    />
                    <div style={{ overflowY: 'auto', flex: 1 }}>
                      {filteredRepos.length === 0 ? (
                        <div style={{ color: '#475569', fontSize: '13px', padding: '10px 12px' }}>No matches</div>
                      ) : filteredRepos.map(r => (
                        <div
                          key={r.full_name}
                          onClick={() => selectRepo(r)}
                          style={{
                            padding: '8px 12px', cursor: 'pointer',
                            backgroundColor: selectedRepo?.full_name === r.full_name ? '#0f3460' : 'transparent',
                            borderBottom: '1px solid #1e293b',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#1e293b')}
                          onMouseLeave={e => (e.currentTarget.style.backgroundColor = selectedRepo?.full_name === r.full_name ? '#0f3460' : 'transparent')}
                        >
                          <div style={{ fontSize: '13px', color: '#e2e8f0', fontWeight: 600 }}>{r.full_name}</div>
                          {r.description && (
                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description}</div>
                          )}
                          <div style={{ fontSize: '10px', color: '#334155', marginTop: '2px' }}>
                            {r.private ? '🔒 private' : '🌐 public'} · {r.default_branch}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <input
                style={input}
                type="url"
                value={repoUrl}
                onChange={e => setRepoUrl(e.target.value)}
                placeholder="https://github.com/owner/repo"
              />
            )}

            {/* Manual URL override (shown when repo selected, or no repos loaded) */}
            {repos.length > 0 && (
              <>
                <label style={{ ...label, color: '#475569', fontSize: '11px' }}>Override URL (optional)</label>
                <input
                  style={{ ...input, fontSize: '12px', color: '#64748b' }}
                  type="url"
                  value={repoUrl}
                  onChange={e => { setRepoUrl(e.target.value); setSelectedRepo(null) }}
                  placeholder="Or paste a URL manually"
                />
              </>
            )}

            <label style={label}>Base Branch</label>
            <input
              style={input}
              value={baseBranch}
              onChange={e => setBaseBranch(e.target.value)}
              placeholder="main"
            />
          </>
        )}

        {/* Research-only fields */}
        {taskType === 'research' && (
          <>
            <label style={label}>Output Format</label>
            <select
              style={selectStyle}
              value={outputFormat}
              onChange={e => setOutputFormat(e.target.value as 'pdf' | 'docx')}
            >
              <option value="pdf">PDF</option>
              <option value="docx">Word (.docx)</option>
            </select>
          </>
        )}

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

        {/* Project selector */}
        {projects && projects.length > 0 && (
          <>
            <label style={label}>Project</label>
            <select
              style={selectStyle}
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
            >
              <option value="">No project</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </>
        )}

        <div style={btnRow}>
          <button type="button" style={btnSecondary} onClick={onClose}>Cancel</button>
          <button type="submit" style={btnPrimary} disabled={loading}>
            {loading ? 'Submitting...' :
            taskType === 'research' ? 'Run Research' :
            taskType === 'coding' ? 'Generate Script' :
            'Run Agent'}
          </button>
        </div>
      </form>
    </div>
  )
}
