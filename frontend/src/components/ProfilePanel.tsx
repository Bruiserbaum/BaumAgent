import { useState } from 'react'
import { User, api } from '../api/client'

interface Props {
  user: User
  onClose: () => void
  onUpdated: (user: User) => void
}

function colorFromEmail(email: string): string {
  let h = 0
  for (const c of email) h = ((h << 5) - h) + c.charCodeAt(0)
  const hue = Math.abs(h) % 360
  return `hsl(${hue}, 65%, 45%)`
}

export default function ProfilePanel({ user, onClose, onUpdated }: Props) {
  const [displayName, setDisplayName] = useState(user.display_name)
  const [avatarUrl, setAvatarUrl] = useState(user.avatar_url ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [imgError, setImgError] = useState(false)

  const initials = displayName
    .split(' ')
    .map(w => w.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase() || displayName.charAt(0).toUpperCase()
  const bg = colorFromEmail(user.email)
  const showImg = avatarUrl.trim() && !imgError

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      const updated = await api.updateProfile({
        display_name: displayName.trim() || undefined,
        avatar_url: avatarUrl,
      })
      onUpdated(updated)
      onClose()
    } catch {
      setError('Failed to save profile. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const cardStyle: React.CSSProperties = {
    backgroundColor: '#16213e',
    border: '1px solid #1e3a5f',
    borderRadius: '12px',
    padding: '28px',
    width: '400px',
    maxWidth: '95vw',
    boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    backgroundColor: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '6px',
    color: '#e2e8f0',
    padding: '8px 10px',
    fontSize: '14px',
    boxSizing: 'border-box',
    marginBottom: '16px',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    color: '#94a3b8',
    fontSize: '12px',
    fontWeight: 600,
    marginBottom: '5px',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <h2 style={{ margin: 0, color: '#7dd3fc', fontSize: '18px' }}>Profile</h2>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}
        >
          ✕
        </button>
      </div>

      {/* Avatar preview */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
        <div style={{
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          backgroundColor: showImg ? 'transparent' : bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '20px',
          fontWeight: 700,
          color: '#fff',
          border: '2px solid rgba(255,255,255,0.15)',
          overflow: 'hidden',
          flexShrink: 0,
        }}>
          {showImg ? (
            <img
              src={avatarUrl}
              alt="avatar"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={() => setImgError(true)}
            />
          ) : initials}
        </div>
        <div>
          <div style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '15px' }}>{displayName || user.email}</div>
          <div style={{ color: '#64748b', fontSize: '12px' }}>{user.email}</div>
          <div style={{ color: '#334155', fontSize: '11px', marginTop: '2px' }}>
            Member since {new Date(user.created_at).toLocaleDateString()}
          </div>
        </div>
      </div>

      {/* Display name */}
      <label style={labelStyle}>Display Name</label>
      <input
        style={inputStyle}
        value={displayName}
        onChange={e => setDisplayName(e.target.value)}
        placeholder="Your name"
      />

      {/* Avatar URL */}
      <label style={labelStyle}>Avatar URL</label>
      <input
        style={inputStyle}
        value={avatarUrl}
        onChange={e => { setAvatarUrl(e.target.value); setImgError(false) }}
        placeholder="https://… (leave blank for initials)"
      />
      <div style={{ color: '#475569', fontSize: '11px', marginTop: '-12px', marginBottom: '16px' }}>
        Paste any image URL. Your Authentik avatar URL works here too.
      </div>

      {/* Read-only info */}
      <div style={{
        backgroundColor: '#0f172a',
        border: '1px solid #1e3a5f',
        borderRadius: '6px',
        padding: '10px 12px',
        marginBottom: '20px',
        fontSize: '12px',
        color: '#475569',
      }}>
        <span style={{ color: '#334155' }}>Email: </span>
        <span style={{ color: '#64748b' }}>{user.email}</span>
        <span style={{ color: '#1e3a5f', margin: '0 8px' }}>·</span>
        <span style={{ color: '#334155' }}>ID: </span>
        <span style={{ color: '#64748b', fontFamily: 'monospace' }}>{user.id.slice(0, 8)}…</span>
      </div>

      {error && (
        <div style={{ color: '#f87171', fontSize: '13px', marginBottom: '12px' }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
        <button
          onClick={onClose}
          style={{
            backgroundColor: 'transparent',
            color: '#64748b',
            border: '1px solid #334155',
            borderRadius: '6px',
            padding: '8px 18px',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            backgroundColor: '#0f3460',
            color: '#7dd3fc',
            border: '1px solid #1e4d8c',
            borderRadius: '6px',
            padding: '8px 22px',
            cursor: saving ? 'not-allowed' : 'pointer',
            fontWeight: 600,
            fontSize: '14px',
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
