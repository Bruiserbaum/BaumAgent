import { useState, useEffect } from 'react'
import { api, PortalSettings, DocFormatSettings, SMBSettings, GitNexusSettings, GitNexusSyncResult, ModelsResponse } from '../api/client'
import { modelOptionLabel } from '../api/modelMeta'

interface Props {
  onClose: () => void
}

type Tab = 'general' | 'docformat' | 'network' | 'gitnexus'

const DEFAULT_DOC_FORMAT: DocFormatSettings = {
  title_font_size: 24,
  heading_font_size: 14,
  body_font_size: 11,
  header_color: '#2c3e50',
  accent_color: '#3498db',
  include_summary: true,
  include_links: true,
  include_images: false,
  section_style: 'paragraphs',
  page_size: 'letter',
  summary_as_bullets: false,
}

const DEFAULT_SMB: SMBSettings = {
  enabled: false,
  host: '',
  share: '',
  username: '',
  password: '',
  domain: '',
  remote_path: '',
}

const DEFAULT_GITNEXUS: GitNexusSettings = {
  enabled: false,
  url: 'http://gitnexus:4747',
  auto_sync: false,
}

const DEFAULT_SETTINGS: PortalSettings = {
  default_llm_backend: 'anthropic',
  default_llm_model: 'claude-sonnet-4-6',
  chat_backend: '',
  chat_model: '',
  research_backend: '',
  research_model: '',
  code_backend: '',
  code_model: '',
  coding_backend: '',
  coding_model: '',
  doc_format: DEFAULT_DOC_FORMAT,
  smb: DEFAULT_SMB,
  gitnexus: DEFAULT_GITNEXUS,
}

const s = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  card: {
    backgroundColor: '#16213e',
    border: '1px solid #1e3a5f',
    borderRadius: '12px',
    width: '760px',
    maxWidth: '97vw',
    maxHeight: '88dvh',
    display: 'flex',
    flexDirection: 'column' as const,
    color: '#e2e8f0',
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 28px 0',
    flexShrink: 0,
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 700,
    color: '#7dd3fc',
  },
  closeBtn: {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#94a3b8',
    fontSize: '20px',
    cursor: 'pointer',
    lineHeight: 1,
    padding: '2px 6px',
  },
  tabBar: {
    display: 'flex',
    gap: '4px',
    padding: '14px 28px 0',
    borderBottom: '1px solid #1e3a5f',
    flexShrink: 0,
  },
  tab: (active: boolean) => ({
    backgroundColor: active ? '#0f3460' : 'transparent',
    border: active ? '1px solid #1e4d8c' : '1px solid transparent',
    borderBottom: active ? '1px solid #0f3460' : '1px solid transparent',
    borderRadius: '6px 6px 0 0',
    color: active ? '#7dd3fc' : '#64748b',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: active ? 700 : 400,
    padding: '7px 18px',
    marginBottom: '-1px',
    whiteSpace: 'nowrap' as const,
  }),
  body: {
    padding: '24px 28px',
    overflowY: 'auto' as const,
    flex: 1,
  },
  sectionTitle: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#7dd3fc',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.07em',
    marginBottom: '14px',
    marginTop: '0',
    paddingBottom: '6px',
    borderBottom: '1px solid #1e3a5f',
  },
  sectionBlock: {
    marginBottom: '24px',
  },
  fieldRow: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '12px',
    gap: '12px',
  },
  label: {
    color: '#94a3b8',
    fontSize: '13px',
    minWidth: '180px',
    flexShrink: 0,
  },
  input: {
    backgroundColor: '#0f3460',
    border: '1px solid #1e4d8c',
    borderRadius: '5px',
    color: '#e2e8f0',
    padding: '6px 10px',
    fontSize: '13px',
    flex: 1,
    minWidth: 0,
  },
  numberInput: {
    backgroundColor: '#0f3460',
    border: '1px solid #1e4d8c',
    borderRadius: '5px',
    color: '#e2e8f0',
    padding: '6px 10px',
    fontSize: '13px',
    width: '80px',
  },
  select: {
    backgroundColor: '#0f3460',
    border: '1px solid #1e4d8c',
    borderRadius: '5px',
    color: '#e2e8f0',
    padding: '6px 10px',
    fontSize: '13px',
    flex: 1,
    minWidth: 0,
  },
  colorRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flex: 1,
  },
  colorPicker: {
    width: '38px',
    height: '32px',
    border: '1px solid #1e4d8c',
    borderRadius: '5px',
    padding: '2px',
    backgroundColor: '#0f3460',
    cursor: 'pointer',
    flexShrink: 0,
  },
  hexInput: {
    backgroundColor: '#0f3460',
    border: '1px solid #1e4d8c',
    borderRadius: '5px',
    color: '#e2e8f0',
    padding: '6px 10px',
    fontSize: '13px',
    flex: 1,
    minWidth: 0,
    fontFamily: 'monospace',
  },
  checkboxRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '12px',
  },
  checkbox: {
    width: '16px',
    height: '16px',
    accentColor: '#7dd3fc',
    cursor: 'pointer',
    flexShrink: 0,
  },
  checkboxLabel: {
    color: '#94a3b8',
    fontSize: '13px',
    cursor: 'pointer',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '12px',
    padding: '14px 28px',
    borderTop: '1px solid #1e3a5f',
    flexShrink: 0,
  },
  saveBtn: {
    backgroundColor: '#0f3460',
    color: '#7dd3fc',
    border: '1px solid #1e4d8c',
    borderRadius: '6px',
    padding: '8px 22px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 600,
  },
  cancelBtn: {
    backgroundColor: 'transparent',
    color: '#94a3b8',
    border: '1px solid #334155',
    borderRadius: '6px',
    padding: '8px 16px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  savedFlash: {
    color: '#4ade80',
    fontSize: '13px',
    fontWeight: 600,
  },
  mutedNote: {
    color: '#475569',
    fontSize: '12px',
    marginBottom: '14px',
    marginTop: '-8px',
  },
  actionBtn: {
    backgroundColor: '#0f2030',
    color: '#94a3b8',
    border: '1px solid #334155',
    borderRadius: '6px',
    padding: '7px 16px',
    fontSize: '13px',
    cursor: 'pointer',
  },
}

export default function SettingsPanel({ onClose }: Props) {
  const [tab, setTab] = useState<Tab>('general')
  const [settings, setSettings] = useState<PortalSettings>(DEFAULT_SETTINGS)
  const [models, setModels] = useState<ModelsResponse>({ anthropic: [], openai: [], ollama: [] })
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)

  const [smbTestResult, setSmbTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [smbTesting, setSmbTesting] = useState(false)

  const [gnStatus, setGnStatus] = useState<{ connected: boolean; enabled: boolean } | null>(null)
  const [gnChecking, setGnChecking] = useState(false)
  const [gnSyncing, setGnSyncing] = useState(false)
  const [gnSyncResult, setGnSyncResult] = useState<GitNexusSyncResult | null>(null)

  useEffect(() => {
    Promise.all([api.getSettings(), api.getModels()])
      .then(([data, mods]) => {
        setSettings(data)
        setModels(mods)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const setTop = (key: keyof Omit<PortalSettings, 'doc_format' | 'smb' | 'gitnexus'>, value: string) => {
    setSettings(ss => ({ ...ss, [key]: value }))
  }

  const setFmt = <K extends keyof DocFormatSettings>(key: K, value: DocFormatSettings[K]) => {
    setSettings(ss => ({ ...ss, doc_format: { ...ss.doc_format, [key]: value } }))
  }

  const setSmb = <K extends keyof SMBSettings>(key: K, value: SMBSettings[K]) => {
    setSettings(ss => ({ ...ss, smb: { ...(ss.smb ?? DEFAULT_SMB), [key]: value } }))
  }

  const setGn = <K extends keyof GitNexusSettings>(key: K, value: GitNexusSettings[K]) => {
    setSettings(ss => ({ ...ss, gitnexus: { ...(ss.gitnexus ?? DEFAULT_GITNEXUS), [key]: value } }))
  }

  const handleTestSMB = async () => {
    setSmbTesting(true)
    setSmbTestResult(null)
    await api.updateSettings(settings)
    const result = await api.testSMB()
    setSmbTestResult(result)
    setSmbTesting(false)
  }

  const handleCheckGnStatus = async () => {
    setGnChecking(true)
    setGnStatus(null)
    try {
      const status = await api.gitnexusStatus()
      setGnStatus(status)
    } catch {
      setGnStatus({ connected: false, enabled: true })
    } finally {
      setGnChecking(false)
    }
  }

  const handleGnSync = async () => {
    setGnSyncing(true)
    setGnSyncResult(null)
    try {
      await api.updateSettings(settings)
      const result = await api.gitnexusSyncProjects()
      setGnSyncResult(result)
    } catch (err: any) {
      setGnSyncResult({ indexed: 0, errors: 1, results: [{ repo_url: '', error: err.message }] })
    } finally {
      setGnSyncing(false)
    }
  }

  const handleSave = async () => {
    await api.updateSettings(settings)
    setSaved(true)
    setTimeout(() => {
      setSaved(false)
      onClose()
    }, 1200)
  }

  const fmt = settings.doc_format

  const TABS: { id: Tab; label: string }[] = [
    { id: 'general', label: 'General' },
    { id: 'docformat', label: 'Document Formatting' },
    { id: 'network', label: 'Network Share' },
    { id: 'gitnexus', label: 'GitNexus' },
  ]

  return (
    <div style={s.card}>
      {/* Header */}
      <div style={s.header}>
        <h2 style={s.title}>Settings</h2>
        <button style={s.closeBtn} onClick={onClose} title="Close">&#x2715;</button>
      </div>

      {/* Tab bar */}
      <div style={s.tabBar}>
        {TABS.map(t => (
          <button key={t.id} style={s.tab(tab === t.id)} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div style={s.body}>
        {loading ? (
          <div style={{ color: '#64748b', fontSize: '14px', textAlign: 'center', padding: '40px 0' }}>
            Loading…
          </div>
        ) : (
          <>
            {/* ── General ── */}
            {tab === 'general' && (
              <>
                <div style={s.sectionBlock}>
                  <p style={s.sectionTitle}>LLM Defaults</p>

                  <div style={s.fieldRow}>
                    <span style={s.label}>Default Backend</span>
                    <select
                      style={s.select}
                      value={settings.default_llm_backend}
                      onChange={e => {
                        setTop('default_llm_backend', e.target.value)
                        const firstModel = (models[e.target.value as keyof ModelsResponse] ?? [])[0] ?? ''
                        setTop('default_llm_model', firstModel)
                      }}
                    >
                      <option value="anthropic">Anthropic</option>
                      <option value="openai">OpenAI</option>
                      <option value="ollama">Ollama</option>
                    </select>
                  </div>

                  <div style={s.fieldRow}>
                    <span style={s.label}>Default Model</span>
                    {settings.default_llm_backend === 'ollama' && (models.ollama ?? []).length === 0 ? (
                      <input
                        style={s.input}
                        type="text"
                        value={settings.default_llm_model}
                        onChange={e => setTop('default_llm_model', e.target.value)}
                        placeholder="e.g. llama3.2, mistral, gemma3"
                      />
                    ) : (
                      <select
                        style={s.select}
                        value={settings.default_llm_model}
                        onChange={e => setTop('default_llm_model', e.target.value)}
                      >
                        {(models[settings.default_llm_backend as keyof ModelsResponse] ?? []).map(m => (
                          <option key={m} value={m}>{modelOptionLabel(m, settings.default_llm_backend)}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                <div style={s.sectionBlock}>
                  <p style={s.sectionTitle}>Per-Context Defaults</p>
                  <p style={s.mutedNote}>Override the global default per context. Leave blank to use the global default.</p>

                  {(['chat', 'research', 'code', 'coding'] as const).map(ctx => {
                    const ctxBackend = (settings as any)[`${ctx}_backend`] as string
                    const ctxModel = (settings as any)[`${ctx}_model`] as string
                    const effectiveBackend = ctxBackend || settings.default_llm_backend
                    const modelList: string[] = models[effectiveBackend as keyof ModelsResponse] ?? []
                    const isOllamaFallback = effectiveBackend === 'ollama' && modelList.length === 0

                    return (
                      <div key={ctx} style={{ marginBottom: '16px' }}>
                        <div style={{ color: '#64748b', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                          {ctx === 'chat' ? 'AI Chat' : ctx === 'research' ? 'Research Tasks' : ctx === 'coding' ? 'Coding (Scripts)' : 'GitHub Coding'}
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <select
                            style={{ ...s.select, flex: '0 0 140px' }}
                            value={ctxBackend}
                            onChange={e => {
                              setTop(`${ctx}_backend` as any, e.target.value)
                              setTop(`${ctx}_model` as any, '')
                            }}
                          >
                            <option value="">— global default —</option>
                            <option value="anthropic">Anthropic</option>
                            <option value="openai">OpenAI</option>
                            <option value="ollama">Ollama</option>
                          </select>

                          {isOllamaFallback ? (
                            <input
                              style={s.input}
                              type="text"
                              placeholder="model name (blank = global default)"
                              value={ctxModel}
                              onChange={e => setTop(`${ctx}_model` as any, e.target.value)}
                            />
                          ) : (
                            <select
                              style={s.select}
                              value={ctxModel}
                              onChange={e => setTop(`${ctx}_model` as any, e.target.value)}
                              disabled={modelList.length === 0}
                            >
                              <option value="">— global default —</option>
                              {modelList.map(m => (
                                <option key={m} value={m}>{modelOptionLabel(m, effectiveBackend)}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {/* ── Document Formatting ── */}
            {tab === 'docformat' && (
              <div style={s.sectionBlock}>
                <p style={s.sectionTitle}>Document Formatting</p>

                <div style={s.fieldRow}>
                  <span style={s.label}>Title Font Size</span>
                  <input style={s.numberInput} type="number" min={12} max={40}
                    value={fmt.title_font_size} onChange={e => setFmt('title_font_size', parseInt(e.target.value, 10))} />
                </div>

                <div style={s.fieldRow}>
                  <span style={s.label}>Heading Font Size</span>
                  <input style={s.numberInput} type="number" min={10} max={28}
                    value={fmt.heading_font_size} onChange={e => setFmt('heading_font_size', parseInt(e.target.value, 10))} />
                </div>

                <div style={s.fieldRow}>
                  <span style={s.label}>Body Font Size</span>
                  <input style={s.numberInput} type="number" min={8} max={18}
                    value={fmt.body_font_size} onChange={e => setFmt('body_font_size', parseInt(e.target.value, 10))} />
                </div>

                <div style={s.fieldRow}>
                  <span style={s.label}>Header Color</span>
                  <div style={s.colorRow}>
                    <input style={s.colorPicker} type="color" value={fmt.header_color}
                      onChange={e => setFmt('header_color', e.target.value)} />
                    <input style={s.hexInput} type="text" value={fmt.header_color} maxLength={7}
                      onChange={e => setFmt('header_color', e.target.value)} placeholder="#2c3e50" />
                  </div>
                </div>

                <div style={s.fieldRow}>
                  <span style={s.label}>Accent Color</span>
                  <div style={s.colorRow}>
                    <input style={s.colorPicker} type="color" value={fmt.accent_color}
                      onChange={e => setFmt('accent_color', e.target.value)} />
                    <input style={s.hexInput} type="text" value={fmt.accent_color} maxLength={7}
                      onChange={e => setFmt('accent_color', e.target.value)} placeholder="#3498db" />
                  </div>
                </div>

                <div style={s.fieldRow}>
                  <span style={s.label}>Section Style</span>
                  <select style={s.select} value={fmt.section_style}
                    onChange={e => setFmt('section_style', e.target.value as DocFormatSettings['section_style'])}>
                    <option value="paragraphs">Paragraphs</option>
                    <option value="bullets">Bullet List</option>
                    <option value="mixed">Mixed</option>
                  </select>
                </div>

                <div style={s.fieldRow}>
                  <span style={s.label}>Page Size</span>
                  <select style={s.select} value={fmt.page_size}
                    onChange={e => setFmt('page_size', e.target.value as DocFormatSettings['page_size'])}>
                    <option value="letter">Letter</option>
                    <option value="a4">A4</option>
                  </select>
                </div>

                <div style={s.checkboxRow}>
                  <input style={s.checkbox} type="checkbox" id="include_summary"
                    checked={fmt.include_summary} onChange={e => setFmt('include_summary', e.target.checked)} />
                  <label style={s.checkboxLabel} htmlFor="include_summary">Include Summary Section</label>
                </div>

                {fmt.include_summary && (
                  <div style={{ ...s.checkboxRow, paddingLeft: '26px' }}>
                    <input style={s.checkbox} type="checkbox" id="summary_as_bullets"
                      checked={fmt.summary_as_bullets} onChange={e => setFmt('summary_as_bullets', e.target.checked)} />
                    <label style={s.checkboxLabel} htmlFor="summary_as_bullets">Summary as Bullets</label>
                  </div>
                )}

                <div style={s.checkboxRow}>
                  <input style={s.checkbox} type="checkbox" id="include_links"
                    checked={fmt.include_links} onChange={e => setFmt('include_links', e.target.checked)} />
                  <label style={s.checkboxLabel} htmlFor="include_links">Include Source Links</label>
                </div>

                <div style={s.checkboxRow}>
                  <input style={s.checkbox} type="checkbox" id="include_images"
                    checked={fmt.include_images} onChange={e => setFmt('include_images', e.target.checked)} />
                  <label style={s.checkboxLabel} htmlFor="include_images">Include Images</label>
                </div>
              </div>
            )}

            {/* ── Network Share ── */}
            {tab === 'network' && (
              <div style={s.sectionBlock}>
                <p style={s.sectionTitle}>SMB / Network Share</p>

                <div style={s.checkboxRow}>
                  <input style={s.checkbox} type="checkbox" id="smb_enabled"
                    checked={settings.smb?.enabled ?? false} onChange={e => setSmb('enabled', e.target.checked)} />
                  <label style={s.checkboxLabel} htmlFor="smb_enabled">
                    Auto-save research reports to SMB share
                  </label>
                </div>

                {settings.smb?.enabled && (
                  <>
                    <div style={s.fieldRow}>
                      <span style={s.label}>Host / IP</span>
                      <input style={s.input} type="text" placeholder="192.168.1.10"
                        value={settings.smb.host} onChange={e => setSmb('host', e.target.value)} />
                    </div>
                    <div style={s.fieldRow}>
                      <span style={s.label}>Share Name</span>
                      <input style={s.input} type="text" placeholder="Reports"
                        value={settings.smb.share} onChange={e => setSmb('share', e.target.value)} />
                    </div>
                    <div style={s.fieldRow}>
                      <span style={s.label}>Username</span>
                      <input style={s.input} type="text" placeholder="Optional"
                        value={settings.smb.username} onChange={e => setSmb('username', e.target.value)} />
                    </div>
                    <div style={s.fieldRow}>
                      <span style={s.label}>Password</span>
                      <input style={s.input} type="password" placeholder="Optional"
                        value={settings.smb.password} onChange={e => setSmb('password', e.target.value)} />
                    </div>
                    <div style={s.fieldRow}>
                      <span style={s.label}>Domain</span>
                      <input style={s.input} type="text" placeholder="Optional (Windows domain)"
                        value={settings.smb.domain} onChange={e => setSmb('domain', e.target.value)} />
                    </div>
                    <div style={s.fieldRow}>
                      <span style={s.label}>Remote Path</span>
                      <input style={s.input} type="text" placeholder="BaumAgent/Reports (optional)"
                        value={settings.smb.remote_path} onChange={e => setSmb('remote_path', e.target.value)} />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px' }}>
                      <button onClick={handleTestSMB} disabled={smbTesting} style={s.actionBtn}>
                        {smbTesting ? 'Testing…' : 'Test Connection'}
                      </button>
                      {smbTestResult && (
                        <span style={{ fontSize: '13px', color: smbTestResult.ok ? '#4ade80' : '#f87171' }}>
                          {smbTestResult.message}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── GitNexus ── */}
            {tab === 'gitnexus' && (
              <div style={s.sectionBlock}>
                <p style={s.sectionTitle}>GitNexus Code Intelligence</p>
                <p style={s.mutedNote}>
                  Powered by{' '}
                  <a href="https://github.com/abhigyanpatwari/GitNexus" target="_blank" rel="noreferrer"
                    style={{ color: '#7dd3fc', textDecoration: 'none' }}>
                    GitNexus
                  </a>
                  {' '}by Abhigyan Patwari. Indexes your GitHub repos and injects semantically relevant
                  code snippets as context into every GitHub coding task.
                </p>

                <div style={s.checkboxRow}>
                  <input style={s.checkbox} type="checkbox" id="gn_enabled"
                    checked={settings.gitnexus?.enabled ?? false}
                    onChange={e => setGn('enabled', e.target.checked)} />
                  <label style={s.checkboxLabel} htmlFor="gn_enabled">
                    Enable GitNexus code intelligence for GitHub coding tasks
                  </label>
                </div>

                <div style={s.fieldRow}>
                  <span style={s.label}>GitNexus URL</span>
                  <input
                    style={s.input}
                    type="text"
                    placeholder="http://gitnexus:4747"
                    value={settings.gitnexus?.url ?? ''}
                    onChange={e => setGn('url', e.target.value)}
                  />
                </div>

                <div style={s.checkboxRow}>
                  <input style={s.checkbox} type="checkbox" id="gn_auto_sync"
                    checked={settings.gitnexus?.auto_sync ?? false}
                    onChange={e => setGn('auto_sync', e.target.checked)} />
                  <label style={s.checkboxLabel} htmlFor="gn_auto_sync">
                    Auto-sync repos when creating a new coding task
                  </label>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px', flexWrap: 'wrap' }}>
                  <button onClick={handleCheckGnStatus} disabled={gnChecking} style={s.actionBtn}>
                    {gnChecking ? 'Checking…' : 'Check Connection'}
                  </button>
                  <button
                    onClick={handleGnSync}
                    disabled={gnSyncing || !(settings.gitnexus?.enabled)}
                    style={{ ...s.actionBtn, opacity: settings.gitnexus?.enabled ? 1 : 0.45 }}
                  >
                    {gnSyncing ? 'Syncing…' : 'Sync All Repos'}
                  </button>
                  {gnStatus && (
                    <span style={{ fontSize: '13px', color: gnStatus.connected ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                      {gnStatus.connected ? '● Connected' : '● Not reachable'}
                    </span>
                  )}
                </div>

                {gnSyncResult && (
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '10px', lineHeight: 1.6 }}>
                    Queued <strong style={{ color: '#e2e8f0' }}>{gnSyncResult.indexed}</strong> repo(s) for indexing
                    {gnSyncResult.errors > 0 && (
                      <span style={{ color: '#f87171' }}> · {gnSyncResult.errors} error(s)</span>
                    )}
                    {gnSyncResult.results.filter(r => r.error).map((r, i) => (
                      <div key={i} style={{ color: '#f87171', marginTop: '4px' }}>{r.repo_url || 'Error'}: {r.error}</div>
                    ))}
                  </div>
                )}

                <div style={{ marginTop: '28px', padding: '16px', backgroundColor: '#0d1f3c', borderRadius: '8px', border: '1px solid #1e3a5f' }}>
                  <p style={{ margin: '0 0 8px', fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Setup
                  </p>
                  <p style={{ margin: '0 0 6px', fontSize: '12px', color: '#64748b', lineHeight: 1.6 }}>
                    Deploy GitNexus alongside BaumAgent by adding <code style={{ color: '#7dd3fc', fontSize: '11px' }}>COMPOSE_PROFILES=gitnexus</code> to
                    your Portainer environment variables and redeploying. The service will be
                    reachable at <code style={{ color: '#7dd3fc', fontSize: '11px' }}>http://gitnexus:4747</code> from BaumAgent containers.
                  </p>
                  <p style={{ margin: 0, fontSize: '12px', color: '#64748b', lineHeight: 1.6 }}>
                    Or point the URL to an externally hosted GitNexus instance.
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div style={s.footer}>
        {saved && <span style={s.savedFlash}>Saved!</span>}
        <button style={s.cancelBtn} onClick={onClose}>Cancel</button>
        <button style={s.saveBtn} onClick={handleSave}>Save</button>
      </div>
    </div>
  )
}
