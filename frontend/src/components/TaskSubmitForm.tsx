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
  const [taskType, setTaskType] = useState<'code' | 'research' | 'coding' | 'structured_document'>('code')
  const [description, setDescription] = useState('')
  const [repoUrl, setRepoUrl] = useState('')
  const [baseBranch, setBaseBranch] = useState('main')
  const [outputFormat, setOutputFormat] = useState<'pdf' | 'docx'>('pdf')
  // Structured document options
  const [documentMode, setDocumentMode] = useState<'plan' | 'proposal' | 'proposal_with_plan'>('plan')
  const [docTitle, setDocTitle] = useState('')
  const [docAudience, setDocAudience] = useState('')
  const [docPurpose, setDocPurpose] = useState('')
  const [docBackground, setDocBackground] = useState('')
  const [docConstraints, setDocConstraints] = useState('')
  const [docTimeline, setDocTimeline] = useState('')
  const [docBudget, setDocBudget] = useState('')
  const [docStakeholders, setDocStakeholders] = useState('')
  const [docRequiredSections, setDocRequiredSections] = useState('')
  const [docTone, setDocTone] = useState<'formal' | 'leadership' | 'operational' | 'persuasive'>('formal')
  const [docDetailLevel, setDocDetailLevel] = useState<'brief' | 'standard' | 'extensive'>('standard')
  const [docDecisionNeeded, setDocDecisionNeeded] = useState('')
  const [docRisksConcerns, setDocRisksConcerns] = useState('')
  const [docAlternatives, setDocAlternatives] = useState('')
  const [docAssumptions, setDocAssumptions] = useState('')
  const [docSuccessMeasures, setDocSuccessMeasures] = useState('')
  const [docIncludeExecSummary, setDocIncludeExecSummary] = useState(true)
  const [docIncludeBudget, setDocIncludeBudget] = useState(true)
  const [docIncludeTimeline, setDocIncludeTimeline] = useState(true)
  const [docIncludeRisks, setDocIncludeRisks] = useState(true)
  const [docIncludeAppendix, setDocIncludeAppendix] = useState(false)
  const [showDocOptional, setShowDocOptional] = useState(false)
  // Fallback
  const [fallbackToAnthropic, setFallbackToAnthropic] = useState(false)
  const [fallbackAnthropicModel, setFallbackAnthropicModel] = useState('claude-sonnet-4-6')
  // Github Coding options
  const [deliveryMode, setDeliveryMode] = useState<'pr_mode' | 'direct_commit' | 'plan_only'>('pr_mode')
  const [buildAfterChange, setBuildAfterChange] = useState(true)
  const [createReleaseArtifacts, setCreateReleaseArtifacts] = useState(false)
  const [publishRelease, setPublishRelease] = useState(true)
  const [updateDocs, setUpdateDocs] = useState<'always' | 'if_needed' | 'never'>('if_needed')
  const [updateChangelog, setUpdateChangelog] = useState(true)
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
  const prevTaskTypeRef = useRef<string>(taskType)

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

  // When the user switches tabs, apply per-context defaults.
  // Intentionally skipped on initial portalSettings load to avoid overwriting
  // a model the user has already selected while settings were fetching.
  useEffect(() => {
    if (!portalSettings) return
    if (prevTaskTypeRef.current === taskType) return  // portalSettings changed, tab didn't — skip
    prevTaskTypeRef.current = taskType

    const s = portalSettings
    let b: string, mdl: string
    if (taskType === 'research' || taskType === 'structured_document') {
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
      if (taskType === 'research' || taskType === 'structured_document') {
        formData.append('output_format', outputFormat)
      }
      if (taskType === 'structured_document') {
        formData.append('document_mode', documentMode)
        formData.append('doc_title', docTitle)
        formData.append('doc_audience', docAudience)
        formData.append('doc_purpose', docPurpose)
        formData.append('doc_background', docBackground)
        formData.append('doc_constraints', docConstraints)
        formData.append('doc_timeline', docTimeline)
        formData.append('doc_budget', docBudget)
        formData.append('doc_stakeholders', docStakeholders)
        formData.append('doc_required_sections', docRequiredSections)
        formData.append('doc_tone', docTone)
        formData.append('doc_detail_level', docDetailLevel)
        formData.append('doc_decision_needed', docDecisionNeeded)
        formData.append('doc_risks_concerns', docRisksConcerns)
        formData.append('doc_alternatives', docAlternatives)
        formData.append('doc_assumptions', docAssumptions)
        formData.append('doc_success_measures', docSuccessMeasures)
        formData.append('doc_include_exec_summary', String(docIncludeExecSummary))
        formData.append('doc_include_budget_section', String(docIncludeBudget))
        formData.append('doc_include_timeline_section', String(docIncludeTimeline))
        formData.append('doc_include_risks_section', String(docIncludeRisks))
        formData.append('doc_include_appendix', String(docIncludeAppendix))
      }
      if (taskType === 'code') {
        formData.append('delivery_mode', deliveryMode)
        formData.append('build_after_change', String(buildAfterChange))
        formData.append('create_release_artifacts', String(createReleaseArtifacts))
        formData.append('publish_release', String(publishRelease))
        formData.append('update_docs', updateDocs)
        formData.append('update_changelog', String(updateChangelog))
      }
      formData.append('fallback_to_anthropic', String(fallbackToAnthropic))
      formData.append('fallback_anthropic_model', fallbackAnthropicModel)
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
        <button type="button" style={taskType === 'structured_document' ? tabActive : tabInactive} onClick={() => setTaskType('structured_document')}>
          Plan / Proposal
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
              taskType === 'structured_document' ? 'Summarize what this document should cover, what the request is, and any key context...' :
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

            {/* Delivery & post-completion options */}
            <label style={label}>Delivery Mode</label>
            <select style={selectStyle} value={deliveryMode} onChange={e => setDeliveryMode(e.target.value as typeof deliveryMode)}>
              <option value="pr_mode">PR (create pull request)</option>
              <option value="direct_commit">Direct Commit (push to base branch)</option>
              <option value="plan_only">Plan Only (no changes committed)</option>
            </select>

            <label style={{ ...label, marginBottom: '8px' }}>Post-Completion Options</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', marginBottom: '14px', backgroundColor: '#0f172a', border: '1px solid #1e3a5f', borderRadius: '6px', padding: '12px' }}>
              {([
                ['Build & validate after change', buildAfterChange, setBuildAfterChange],
                ['Update changelog', updateChangelog, setUpdateChangelog],
                ['Create release artifacts', createReleaseArtifacts, setCreateReleaseArtifacts],
                ['Publish release', publishRelease, setPublishRelease],
              ] as [string, boolean, (v: boolean) => void][]).map(([lbl, val, setter]) => (
                <label key={lbl} style={{ display: 'flex', alignItems: 'center', gap: '7px', cursor: 'pointer', fontSize: '13px', color: '#94a3b8', userSelect: 'none' }}>
                  <input
                    type="checkbox"
                    checked={val}
                    onChange={e => setter(e.target.checked)}
                    style={{ accentColor: '#7dd3fc', width: '14px', height: '14px', cursor: 'pointer' }}
                  />
                  {lbl}
                </label>
              ))}
              <label style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '13px', color: '#94a3b8', gridColumn: '1 / -1' }}>
                <span style={{ flexShrink: 0 }}>Update docs:</span>
                <select
                  value={updateDocs}
                  onChange={e => setUpdateDocs(e.target.value as typeof updateDocs)}
                  style={{ backgroundColor: '#16213e', border: '1px solid #334155', borderRadius: '4px', color: '#e2e8f0', padding: '3px 6px', fontSize: '12px', flex: 1 }}
                >
                  <option value="always">Always</option>
                  <option value="if_needed">If needed</option>
                  <option value="never">Never</option>
                </select>
              </label>
            </div>
          </>
        )}

        {/* Research-only fields */}
        {taskType === 'research' && (
          <>
            <label style={label}>Output Format</label>
            <select style={selectStyle} value={outputFormat} onChange={e => setOutputFormat(e.target.value as 'pdf' | 'docx')}>
              <option value="pdf">PDF</option>
              <option value="docx">Word (.docx)</option>
            </select>
          </>
        )}

        {/* Structured Document fields */}
        {taskType === 'structured_document' && (() => {
          const secLabel: React.CSSProperties = { ...label, color: '#7dd3fc', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px', marginTop: '4px' }
          const halfGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }
          const checkRow = (lbl: string, val: boolean, set: (v: boolean) => void) => (
            <label key={lbl} style={{ display: 'flex', alignItems: 'center', gap: '7px', cursor: 'pointer', fontSize: '13px', color: '#94a3b8', userSelect: 'none' }}>
              <input type="checkbox" checked={val} onChange={e => set(e.target.checked)} style={{ accentColor: '#f59e0b', width: '14px', height: '14px', cursor: 'pointer' }} />
              {lbl}
            </label>
          )
          return (
            <>
              {/* Core */}
              <div style={secLabel}>Document Setup</div>
              <label style={label}>Document Mode</label>
              <select style={selectStyle} value={documentMode} onChange={e => setDocumentMode(e.target.value as typeof documentMode)}>
                <option value="plan">Plan (how we will do it)</option>
                <option value="proposal">Proposal (why we should do it)</option>
                <option value="proposal_with_plan">Proposal + Plan (why and how)</option>
              </select>

              <label style={label}>Working Title (optional)</label>
              <input style={input} value={docTitle} onChange={e => setDocTitle(e.target.value)} placeholder="e.g. Q3 Infrastructure Upgrade Plan" />

              <div style={halfGrid}>
                <div>
                  <label style={label}>Target Audience</label>
                  <input style={input} value={docAudience} onChange={e => setDocAudience(e.target.value)} placeholder="e.g. Leadership, Finance team" />
                </div>
                <div>
                  <label style={label}>Tone</label>
                  <select style={selectStyle} value={docTone} onChange={e => setDocTone(e.target.value as typeof docTone)}>
                    <option value="formal">Formal / Professional</option>
                    <option value="leadership">Leadership / Executive</option>
                    <option value="operational">Operational / Practical</option>
                    <option value="persuasive">Persuasive / Business Case</option>
                  </select>
                </div>
              </div>

              <div style={halfGrid}>
                <div>
                  <label style={label}>Detail Level</label>
                  <select style={selectStyle} value={docDetailLevel} onChange={e => setDocDetailLevel(e.target.value as typeof docDetailLevel)}>
                    <option value="brief">Brief</option>
                    <option value="standard">Standard</option>
                    <option value="extensive">Extensive</option>
                  </select>
                </div>
                <div>
                  <label style={label}>Output Format</label>
                  <select style={selectStyle} value={outputFormat} onChange={e => setOutputFormat(e.target.value as 'pdf' | 'docx')}>
                    <option value="pdf">PDF</option>
                    <option value="docx">Word (.docx)</option>
                  </select>
                </div>
              </div>

              {/* Context */}
              <div style={secLabel}>Context</div>
              <label style={label}>Objective / Purpose</label>
              <textarea style={{ ...textarea, marginBottom: '14px' }} value={docPurpose} onChange={e => setDocPurpose(e.target.value)} placeholder="What is the goal of this document? What decision or outcome is needed?" rows={2} />

              <label style={label}>Background / Current State</label>
              <textarea style={{ ...textarea, marginBottom: '14px' }} value={docBackground} onChange={e => setDocBackground(e.target.value)} placeholder="What is the current situation? What led to this request?" rows={3} />

              <div style={halfGrid}>
                <div>
                  <label style={label}>Timeline / Target Dates</label>
                  <input style={input} value={docTimeline} onChange={e => setDocTimeline(e.target.value)} placeholder="e.g. Go-live by Q4, deadline Oct 1" />
                </div>
                <div>
                  <label style={label}>Stakeholders</label>
                  <input style={input} value={docStakeholders} onChange={e => setDocStakeholders(e.target.value)} placeholder="e.g. IT, Finance, HR, Vendor" />
                </div>
              </div>

              <label style={label}>Budget / Cost Information</label>
              <textarea style={{ ...textarea, marginBottom: '14px' }} value={docBudget} onChange={e => setDocBudget(e.target.value)} placeholder="Known costs, budget limits, funding sources, cost estimates..." rows={2} />

              <label style={label}>Constraints</label>
              <textarea style={{ ...textarea, marginBottom: '14px' }} value={docConstraints} onChange={e => setDocConstraints(e.target.value)} placeholder="Technical, resource, policy, time, or scope constraints..." rows={2} />

              {/* Optional fields — collapsed by default */}
              <button type="button" onClick={() => setShowDocOptional(v => !v)} style={{ background: 'none', border: 'none', color: '#475569', fontSize: '12px', cursor: 'pointer', padding: '0 0 10px', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '10px' }}>{showDocOptional ? '▼' : '▶'}</span>
                {showDocOptional ? 'Hide' : 'Show'} optional fields (decision needed, risks, alternatives, assumptions, success measures, required sections)
              </button>

              {showDocOptional && (
                <>
                  <label style={label}>Decision Needed</label>
                  <input style={input} value={docDecisionNeeded} onChange={e => setDocDecisionNeeded(e.target.value)} placeholder="What is the specific ask or decision required?" />

                  <label style={label}>Known Risks / Concerns</label>
                  <textarea style={{ ...textarea, marginBottom: '14px' }} value={docRisksConcerns} onChange={e => setDocRisksConcerns(e.target.value)} placeholder="Any known risks, concerns, or blockers to address..." rows={2} />

                  <label style={label}>Alternatives Considered</label>
                  <textarea style={{ ...textarea, marginBottom: '14px' }} value={docAlternatives} onChange={e => setDocAlternatives(e.target.value)} placeholder="Other options that were considered and why this was selected..." rows={2} />

                  <label style={label}>Assumptions</label>
                  <textarea style={{ ...textarea, marginBottom: '14px' }} value={docAssumptions} onChange={e => setDocAssumptions(e.target.value)} placeholder="Known assumptions this document is based on..." rows={2} />

                  <label style={label}>Success Measures</label>
                  <input style={input} value={docSuccessMeasures} onChange={e => setDocSuccessMeasures(e.target.value)} placeholder="How will success be measured? KPIs, milestones, outcomes..." />

                  <label style={label}>Required Sections (override)</label>
                  <input style={input} value={docRequiredSections} onChange={e => setDocRequiredSections(e.target.value)} placeholder="Optional: list specific sections you want included" />
                </>
              )}

              {/* Section toggles */}
              <div style={secLabel}>Section Toggles</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', marginBottom: '14px', backgroundColor: '#0f172a', border: '1px solid #1e3a5f', borderRadius: '6px', padding: '12px' }}>
                {checkRow('Executive Summary', docIncludeExecSummary, setDocIncludeExecSummary)}
                {checkRow('Budget / Cost Section', docIncludeBudget, setDocIncludeBudget)}
                {checkRow('Timeline / Phases', docIncludeTimeline, setDocIncludeTimeline)}
                {checkRow('Risks & Mitigation', docIncludeRisks, setDocIncludeRisks)}
                {checkRow('Appendix', docIncludeAppendix, setDocIncludeAppendix)}
              </div>
            </>
          )
        })()}

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

        {/* Anthropic fallback — only visible when primary backend is not Anthropic */}
        {backend !== 'anthropic' && (
          <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e3a5f', borderRadius: '6px', padding: '10px 12px', marginBottom: '14px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={fallbackToAnthropic}
                onChange={e => setFallbackToAnthropic(e.target.checked)}
                style={{ accentColor: '#f59e0b', width: '14px', height: '14px', cursor: 'pointer', flexShrink: 0 }}
              />
              <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 600 }}>
                Fallback to Anthropic if model gets stuck
              </span>
            </label>
            {fallbackToAnthropic && (
              <div style={{ marginTop: '8px', paddingLeft: '22px' }}>
                <label style={{ ...label, marginBottom: '4px', color: '#64748b', fontSize: '11px' }}>Fallback Model</label>
                <select
                  style={{ ...selectStyle, marginBottom: 0, fontSize: '12px' }}
                  value={fallbackAnthropicModel}
                  onChange={e => setFallbackAnthropicModel(e.target.value)}
                >
                  <option value="claude-sonnet-4-6">claude-sonnet-4-6 (recommended)</option>
                  <option value="claude-opus-4-6">claude-opus-4-6 (most capable)</option>
                  <option value="claude-haiku-4-5-20251001">claude-haiku-4-5 (fastest)</option>
                </select>
                <div style={{ fontSize: '11px', color: '#475569', marginTop: '5px' }}>
                  Triggers if the primary model raises an error or fails to produce output after the full agent loop.
                </div>
              </div>
            )}
          </div>
        )}

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
            taskType === 'structured_document' ? 'Generate Document' :
            'Run Agent'}
          </button>
        </div>
      </form>
    </div>
  )
}
