import { useState, useEffect } from 'react'
import { api, PortalSettings, DocFormatSettings } from '../api/client'

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

const DEFAULT_SETTINGS: PortalSettings = {
  default_llm_backend: 'anthropic',
  default_llm_model: 'claude-sonnet-4-6',
  doc_format: DEFAULT_DOC_FORMAT,
}

const styles = {
  card: {
    backgroundColor: '#16213e',
    border: '1px solid #1e3a5f',
    borderRadius: '10px',
    padding: '28px 32px',
    width: '560px',
    maxHeight: '90vh',
    overflowY: 'auto' as const,
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
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api.getSettings()
      .then(data => {
        setSettings(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const setTop = (key: keyof Omit<PortalSettings, 'doc_format'>, value: string) => {
    setSettings(s => ({ ...s, [key]: value }))
  }

  const setFmt = <K extends keyof DocFormatSettings>(key: K, value: DocFormatSettings[K]) => {
    setSettings(s => ({ ...s, doc_format: { ...s.doc_format, [key]: value } }))
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
                onChange={e => setTop('default_llm_backend', e.target.value)}
              >
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
                <option value="ollama">Ollama</option>
              </select>
            </div>

            <div style={styles.fieldRow}>
              <span style={styles.label}>Default Model</span>
              <input
                style={styles.input}
                type="text"
                value={settings.default_llm_model}
                onChange={e => setTop('default_llm_model', e.target.value)}
                placeholder="e.g. claude-sonnet-4-6"
              />
            </div>
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
                style={{ ...styles.checkbox, opacity: 0.4, cursor: 'not-allowed' }}
                type="checkbox"
                id="include_images"
                checked={fmt.include_images}
                disabled
                onChange={e => setFmt('include_images', e.target.checked)}
              />
              <label style={styles.checkboxLabelMuted} htmlFor="include_images">
                Include Images <span style={{ fontSize: '11px', color: '#334155' }}>(coming soon)</span>
              </label>
            </div>
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
