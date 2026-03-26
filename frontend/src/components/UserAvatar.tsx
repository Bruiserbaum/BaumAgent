import { useState } from 'react'
import { User } from '../api/client'

interface Props {
  user: User | null
}

function colorFromEmail(email: string): string {
  let h = 0
  for (const c of email) h = ((h << 5) - h) + c.charCodeAt(0)
  const hue = Math.abs(h) % 360
  return `hsl(${hue}, 65%, 45%)`
}

export default function UserAvatar({ user }: Props) {
  const [showTooltip, setShowTooltip] = useState(false)

  if (!user) {
    return (
      <div
        style={{
          width: '28px',
          height: '28px',
          borderRadius: '50%',
          backgroundColor: '#1e3a5f',
          border: '1px solid #334155',
          flexShrink: 0,
        }}
      />
    )
  }

  const letter = user.display_name.charAt(0).toUpperCase()
  const bg = colorFromEmail(user.email)

  return (
    <div
      style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div
        style={{
          width: '28px',
          height: '28px',
          borderRadius: '50%',
          backgroundColor: bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '13px',
          fontWeight: 700,
          color: '#fff',
          cursor: 'default',
          userSelect: 'none',
          border: '1px solid rgba(255,255,255,0.15)',
          flexShrink: 0,
        }}
      >
        {letter}
      </div>
      {showTooltip && (
        <div
          style={{
            position: 'absolute',
            top: '34px',
            right: 0,
            backgroundColor: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '6px',
            padding: '6px 10px',
            fontSize: '12px',
            color: '#94a3b8',
            whiteSpace: 'nowrap',
            zIndex: 200,
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}
        >
          <div style={{ color: '#e2e8f0', fontWeight: 600, marginBottom: '2px' }}>
            {user.display_name}
          </div>
          <div>{user.email}</div>
        </div>
      )}
    </div>
  )
}
