import { useState, useEffect } from 'react'
import { api, PortalSettings, DocFormatSettings, SMBSettings, ModelsResponse } from '../api/client'

interface Props {
  onClose: () => void
}

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
  summary_as_bullets: true,
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
}

const styles = {
  card: {
    backgroundColor: '#16213e',
    border: '1px solid #1e3a5f',
    borderRadius: '10px',
    padding: '28px 32px',
    width: '560px',
    maxWidth: '95vw',
    maxHeight: '85dvh',
    overflowY: 'auto' as const,
    boxSizing: 'border-box' as const,
    color: '#e2e8f0',
    fontFamily: "'Segoe UI', system-ui, sans-serif",
  } as React.CSSProperties,
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '24px',
  } as React.CSSProperties,
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 700,
    color: '#7dd3fc',
  } as React.CSSProperties,
  closeBtn: {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#94a3b8',
    fontSize: '20px',
    cursor: 'pointer',
    lineHeight: 1,
    padding: '2px 6px',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: '13px',
    fontWeight: 700,
    color: '#7dd3fc',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.07em',
    marginBottom: '14px',
    marginTop: '0',
    paddingBottom: '6px',
    borderBottom: '1px solid #1e3a5f',
  } as React.CSSProperties,
  sectionBlock: {
    marginBottom: '24px',
  } as React.CSSProperties,
  fieldRow: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '12px',
    gap: '12px',
  } as React.CSSProperties,
  label: {
    color: '#94a3b8',
    fontSize: '13px',
    minWidth: '175px',
    flexShrink: 0,
  } as React.CSSProperties,
  labelMuted: {
    color: '#475569',
    fontSize: '13px',
    minWidth: '175px',
    flexShrink: 0,
  } as React.CSSProperties,
  input: {
    backgroundColor: '#0f3460',
    border: '1px solid #1e4d8c',
    borderRadius: '5px',
    color: '#e2e8f0',
    padding: '6px 10px',
    fontSize: '13px',
    flex: 1,
    minWidth: 0,
  } as React.CSSProperties,
  numberInput: {
    backgroundColor: '#0f3460',
    border: '1px solid #1e4d8c',
    borderRadius: '5px',
    color: '#e2e8f0',
    padding: '6px 10px',
    fontSize: '13px',
    width: '80px',
  } as React.CSSProperties,
  select: {
    backgroundColor: '#0f3460',
    border: '1px solid #1e4d8c',
    borderRadius: '5px',
    color: '#e2e8f0',
    padding: '6px 10px',
    fontSize: '13px',
    flex: 1,
    minWidth: 0,
  } as React.CSSProperties,
  colorRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flex: 1,
  } as React.CSSProperties,
  colorPicker: {
    width: '38px',
    height: '32px',
    border: '1px solid #1e4d8c',
    borderRadius: '5px',
    padding: '2px',
    backgroundColor: '#0f3460',
    cursor: 'pointer',
    flexShrink: 0,
  } as React.CSSProperties,
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
  } as React.CSSProperties,
  checkboxRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '12px',
  } as React.CSSProperties,
  checkbox: {
    width: '16px',
    height: '16px',
    accentColor: '#7dd3fc',
    cursor: 'pointer',
    flexShrink: 0,
  } as React.CSSProperties,
  checkboxLabel: {
    color: '#94a3b8',
    fontSize: '13px',
    cursor: 'pointer',
  } as React.CSSProperties,
  checkboxLabelMuted: {
    color: '#475569',
    fontSize: '13px',
  } as React.CSSProperties,
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '8px',
  } as React.CSSProperties,
  saveBtn: {
    backgroundColor: '#0f3460',
    color: '#7dd3fc',
    border: '1px solid #1e4d8c',
    borderRadius: '6px',
    padding: '8px 22px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 600,
  } as React.CSSProperties,
  cancelBtn: {
    backgroundColor: 'transparent',
    color: '#94a3b8',
    border: '1px solid #334155',
    borderRadius: '6px',
    padding: '8px 16px',
    cursor: 'pointer',
    fontSize: '14px',
  } as React.CSSProperties,
  savedFlash: {
    color: '#4ade80',
    fontSize: '13px',
    fontWeight: 600,
  } as React.CSSProperties,
}

export default function SettingsPanel({ onClose }: Props) {
  const [settings, setSettings] = useState<PortalSettings>(DEFAULT_SETTINGS)
  const [models, setModels] = useState<ModelsResponse>({ anthropic: [], openai: [], ollama: [] })
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [smbTestResult, setSmbTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [smbTesting, setSmbTesting] = useState(false)

  useEffect(() => {
    Promise.all([api.getSettings(), api.getModels()])
      .then(([data, mods]) => {
        setSettings(data)
        setModels(mods)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const setTop = (key: keyof Omit<PortalSettings, 'doc_format' | 'smb'>, value: string) => {
    setSettings(s => ({ ...s, [key]: value }))
  }

  const setFmt = <K extends keyof DocFormatSettings>(key: K, value: DocFormatSettings[K]) => {
    setSettings(s => ({ ...s, doc_format: { ...s.doc_format, [key]: value } }))
  }

  const setSmb = <K extends keyof SMBSettings>(key: K, value: SMBSettings[K]) => {
    setSettings(s => ({ ...s, smb: { ...(s.smb ?? DEFAULT_SMB), [key]: value } }))
  }

  const handleTestSMB = async () => {
    setSmbTesting(true)
    setSmbTestResult(null)
    // Save first so the backend tests the current values
    await api.updateSettings(settings)
    const result = await api.testSMB()
    setSmbTestResult(result)
    setSmbTesting(false)
  }

  const handleSave = async () => {
    await api.updateSettings(settings)
    setSaved(true)
    setTimeout(() => {
      setSaved(false)
      onClose()
    }, 1500)
  }

  const fmt = settings.doc_format

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <h2 style={styles.title}>Settings</h2>
        <button style={styles.closeBtn} onClick={onClose} title="Close">&#x2715;</button>
      </div>

      {loading ? (
        <div style={{ color: '#64748b', fontSize: '14px', textAlign: 'center', padding: '32px 0' }}>
          Loading...
        </div>
      ) : (
        <>
          {/* LLM Defaults */}
          <div style={styles.sectionBlock}>
            <p style={styles.sectionTitle}>LLM Defaults</p>

            <div style={styles.fieldRow}>
              <span style={styles.label}>Default Backend</span>
              <select
                style={styles.select}
                value={settings.default_llm_backend}
                onChange={e => {
                  setTop('default_llm_backend', e.target.value)
                  // Pick first model in new backend's list, or clear
                  const firstModel = (models[e.target.value as keyof ModelsResponse] ?? [])[0] ?? ''
                  setTop('default_llm_model', firstModel)
                }}
              >
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
                <option value="ollama">Ollama</option>
              </select>
            </div>

            <div style={styles.fieldRow}>
              <span style={styles.label}>Default Model</span>
              {settings.default_llm_backend === 'ollama' && (models.ollama ?? []).length === 0 ? (
                <input
                  style={styles.input}
                  type="text"
                  value={settings.default_llm_model}
                  onChange={e => setTop('default_llm_model', e.target.value)}
                  placeholder="e.g. llama3.2, mistral, gemma3"
                />
              ) : (
                <select
                  style={styles.select}
                  value={settings.default_llm_model}
                  onChange={e => setTop('default_llm_model', e.target.value)}
                >
                  {(models[settings.default_llm_backend as keyof ModelsResponse] ?? []).map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Per-context model defaults */}
          <div style={styles.sectionBlock}>
            <p style={styles.sectionTitle}>Per-Context Defaults</p>
            <p style={{ color: '#475569', fontSize: '12px', marginBottom: '14px', marginTop: '-8px' }}>
              Override the default LLM per context. Leave blank to use the global default above.
            </p>

            {(['chat', 'research', 'code', 'coding'] as const).map(ctx => {
              const ctxBackend = (settings as any)[`${ctx}_backend`] as string
              const ctxModel = (settings as any)[`${ctx}_model`] as string
              // Resolve effective backend for model list: ctx override or global default
              const effectiveBackend = ctxBackend || settings.default_llm_backend
              const modelList: string[] = models[effectiveBackend as keyof ModelsResponse] ?? []
              const isOllamaFallback = effectiveBackend === 'ollama' && modelList.length === 0

              return (
                <div key={ctx} style={{ marginBottom: '16px' }}>
                  <div style={{ color: '#64748b', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                    {ctx === 'chat' ? 'AI Chat' : ctx === 'research' ? 'Research Tasks' : ctx === 'coding' ? 'Coding (Scripts)' : 'Github Coding'}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select
                      style={{ ...styles.select, flex: '0 0 130px' }}
                      value={ctxBackend}
                      onChange={e => {
                        setTop(`${ctx}_backend` as any, e.target.value)
                        // Reset model when backend changes so stale value is cleared
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
                        style={styles.input}
                        type="text"
                        placeholder="model name (blank = global default)"
                        value={ctxModel}
                        onChange={e => setTop(`${ctx}_model` as any, e.target.value)}
                      />
                    ) : (
                      <select
                        style={styles.select}
                        value={ctxModel}
                        onChange={e => setTop(`${ctx}_model` as any, e.target.value)}
                        disabled={modelList.length === 0}
                      >
                        <option value="">— global default —</option>
                        {modelList.map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Document Formatting */}
          <div style={styles.sectionBlock}>
            <p style={styles.sectionTitle}>Document Formatting</p>

            <div style={styles.fieldRow}>
              <span style={styles.label}>Title Font Size</span>
              <input
                style={styles.numberInput}
                type="number"
                min={12}
                max={40}
                value={fmt.title_font_size}
                onChange={e => setFmt('title_font_size', parseInt(e.target.value, 10))}
              />
            </div>

            <div style={styles.fieldRow}>
              <span style={styles.label}>Heading Font Size</span>
              <input
                style={styles.numberInput}
                type="number"
                min={10}
                max={28}
                value={fmt.heading_font_size}
                onChange={e => setFmt('heading_font_size', parseInt(e.target.value, 10))}
              />
            </div>

            <div style={styles.fieldRow}>
              <span style={styles.label}>Body Font Size</span>
              <input
                style={styles.numberInput}
                type="number"
                min={8}
                max={18}
                value={fmt.body_font_size}
                onChange={e => setFmt('body_font_size', parseInt(e.target.value, 10))}
              />
            </div>

            <div style={styles.fieldRow}>
              <span style={styles.label}>Header Color</span>
              <div style={styles.colorRow}>
                <input
                  style={styles.colorPicker}
                  type="color"
                  value={fmt.header_color}
                  onChange={e => setFmt('header_color', e.target.value)}
                />
                <input
                  style={styles.hexInput}
                  type="text"
                  value={fmt.header_color}
                  maxLength={7}
                  onChange={e => setFmt('header_color', e.target.value)}
                  placeholder="#2c3e50"
                />
              </div>
            </div>

            <div style={styles.fieldRow}>
              <span style={styles.label}>Accent Color</span>
              <div style={styles.colorRow}>
                <input
                  style={styles.colorPicker}
                  type="color"
                  value={fmt.accent_color}
                  onChange={e => setFmt('accent_color', e.target.value)}
                />
                <input
                  style={styles.hexInput}
                  type="text"
                  value={fmt.accent_color}
                  maxLength={7}
                  onChange={e => setFmt('accent_color', e.target.value)}
                  placeholder="#3498db"
                />
              </div>
            </div>

            <div style={styles.fieldRow}>
              <span style={styles.label}>Section Style</span>
              <select
                style={styles.select}
                value={fmt.section_style}
                onChange={e => setFmt('section_style', e.target.value as DocFormatSettings['section_style'])}
              >
                <option value="paragraphs">Paragraphs</option>
                <option value="bullets">Bullet List</option>
                <option value="mixed">Mixed</option>
              </select>
            </div>

            <div style={styles.fieldRow}>
              <span style={styles.label}>Page Size</span>
              <select
                style={styles.select}
                value={fmt.page_size}
                onChange={e => setFmt('page_size', e.target.value as DocFormatSettings['page_size'])}
              >
                <option value="letter">Letter</option>
                <option value="a4">A4</option>
              </select>
            </div>

            <div style={styles.checkboxRow}>
              <input
                style={styles.checkbox}
                type="checkbox"
                id="include_summary"
                checked={fmt.include_summary}
                onChange={e => setFmt('include_summary', e.target.checked)}
              />
              <label style={styles.checkboxLabel} htmlFor="include_summary">
                Include Summary Section
              </label>
            </div>

            {fmt.include_summary && (
              <div style={{ ...styles.checkboxRow, paddingLeft: '28px' }}>
                <input
                  style={styles.checkbox}
                  type="checkbox"
                  id="summary_as_bullets"
                  checked={fmt.summary_as_bullets}
                  onChange={e => setFmt('summary_as_bullets', e.target.checked)}
                />
                <label style={styles.checkboxLabel} htmlFor="summary_as_bullets">
                  Summary as Bullets
                </label>
              </div>
            )}

            <div style={styles.checkboxRow}>
              <input
                style={styles.checkbox}
                type="checkbox"
                id="include_links"
                checked={fmt.include_links}
                onChange={e => setFmt('include_links', e.target.checked)}
              />
              <label style={styles.checkboxLabel} htmlFor="include_links">
                Include Source Links
              </label>
            </div>

            <div style={styles.checkboxRow}>
              <input
                style={styles.checkbox}
                type="checkbox"
                id="include_images"
                checked={fmt.include_images}
                onChange={e => setFmt('include_images', e.target.checked)}
              />
              <label style={styles.checkboxLabel} htmlFor="include_images">
                Include Images
              </label>
            </div>
          </div>

          {/* SMB Settings */}
          <div style={styles.sectionBlock}>
            <p style={styles.sectionTitle}>SMB / Network Share</p>

            <div style={styles.checkboxRow}>
              <input
                style={styles.checkbox}
                type="checkbox"
                id="smb_enabled"
                checked={settings.smb?.enabled ?? false}
                onChange={e => setSmb('enabled', e.target.checked)}
              />
              <label style={styles.checkboxLabel} htmlFor="smb_enabled">
                Auto-save research reports to SMB share
              </label>
            </div>

            {settings.smb?.enabled && (
              <>
                <div style={styles.fieldRow}>
                  <span style={styles.label}>Host / IP</span>
                  <input style={styles.input} type="text" placeholder="192.168.1.10"
                    value={settings.smb.host} onChange={e => setSmb('host', e.target.value)} />
                </div>
                <div style={styles.fieldRow}>
                  <span style={styles.label}>Share Name</span>
                  <input style={styles.input} type="text" placeholder="Reports"
                    value={settings.smb.share} onChange={e => setSmb('share', e.target.value)} />
                </div>
                <div style={styles.fieldRow}>
                  <span style={styles.label}>Username</span>
                  <input style={styles.input} type="text" placeholder="Optional"
                    value={settings.smb.username} onChange={e => setSmb('username', e.target.value)} />
                </div>
                <div style={styles.fieldRow}>
                  <span style={styles.label}>Password</span>
                  <input style={styles.input} type="password" placeholder="Optional"
                    value={settings.smb.password} onChange={e => setSmb('password', e.target.value)} />
                </div>
                <div style={styles.fieldRow}>
                  <span style={styles.label}>Domain</span>
                  <input style={styles.input} type="text" placeholder="Optional (Windows domain)"
                    value={settings.smb.domain} onChange={e => setSmb('domain', e.target.value)} />
                </div>
                <div style={styles.fieldRow}>
                  <span style={styles.label}>Remote Path</span>
                  <input style={styles.input} type="text" placeholder="BaumAgent/Reports (optional)"
                    value={settings.smb.remote_path} onChange={e => setSmb('remote_path', e.target.value)} />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                  <button
                    onClick={handleTestSMB}
                    disabled={smbTesting}
                    style={{
                      backgroundColor: '#0f2030', color: '#94a3b8',
                      border: '1px solid #334155', borderRadius: '6px',
                      padding: '7px 16px', fontSize: '13px', cursor: 'pointer',
                    }}
                  >
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

          <div style={styles.footer}>
            {saved && <span style={styles.savedFlash}>Saved!</span>}
            <button style={styles.cancelBtn} onClick={onClose}>Cancel</button>
            <button style={styles.saveBtn} onClick={handleSave}>Save</button>
          </div>
        </>
      )}
    </div>
  )
}
