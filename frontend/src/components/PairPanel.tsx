import { useState, useEffect, useRef } from 'react'
import QRCode from 'react-qr-code'
import { api } from '../api/client'

interface Props {
  onClose: () => void
}

export default function PairPanel({ onClose }: Props) {
  const [pairCode, setPairCode] = useState<string | null>(null)
  const [pairUrl, setPairUrl] = useState<string>('')
  const [pairExpiry, setPairExpiry] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const generate = async () => {
    if (timerRef.current) clearInterval(timerRef.current)
    setLoading(true)
    setError(null)
    setPairCode(null)
    try {
      const res = await api.pairInitiate()
      setPairCode(res.code)
      setPairUrl(res.pair_url)
      setPairExpiry(res.expires_in)
      timerRef.current = setInterval(() => {
        setPairExpiry(e => {
          if (e <= 1) {
            clearInterval(timerRef.current!)
            setPairCode(null)
            return 0
          }
          return e - 1
        })
      }, 1000)
    } catch (err: any) {
      setError(err.message ?? 'Failed to generate code')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    generate()
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  const handleCopy = () => {
    if (!pairCode) return
    navigator.clipboard.writeText(pairCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const mins = Math.floor(pairExpiry / 60)
  const secs = String(pairExpiry % 60).padStart(2, '0')
  const expiringSoon = pairExpiry > 0 && pairExpiry < 60

  return (
    <div style={{
      backgroundColor: '#16213e',
      border: '1px solid #1e3a5f',
      borderRadius: '12px',
      padding: '32px 36px',
      width: '420px',
      maxWidth: '95vw',
      color: '#e2e8f0',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      boxSizing: 'border-box',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#7dd3fc' }}>Pair New Device</h2>
        <button
          onClick={onClose}
          style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '20px', cursor: 'pointer', lineHeight: 1, padding: '2px 6px' }}
        >&#x2715;</button>
      </div>
      <p style={{ color: '#475569', fontSize: '13px', marginTop: 0, marginBottom: '24px' }}>
        Scan the QR code or paste the code into the BaumAgent Windows, Android, or macOS client.
        Expires in 5 minutes.
      </p>

      {loading && (
        <div style={{ textAlign: 'center', color: '#64748b', padding: '40px 0', fontSize: '14px' }}>
          Generating…
        </div>
      )}

      {error && (
        <div style={{ color: '#f87171', fontSize: '13px', marginBottom: '16px', textAlign: 'center' }}>
          {error}
        </div>
      )}

      {pairCode && (
        <>
          {/* QR Code */}
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '10px',
            padding: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '20px',
          }}>
            <QRCode
              value={pairUrl || pairCode}
              size={220}
              bgColor="#ffffff"
              fgColor="#0f172a"
              level="M"
            />
          </div>

          {/* Code + copy */}
          <div style={{
            backgroundColor: '#0a1628',
            border: '1px solid #1e3a5f',
            borderRadius: '8px',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '14px',
            gap: '12px',
          }}>
            <span style={{
              fontFamily: 'monospace',
              fontSize: '22px',
              fontWeight: 700,
              letterSpacing: '0.2em',
              color: '#7dd3fc',
              wordBreak: 'break-all',
            }}>
              {pairCode}
            </span>
            <button
              onClick={handleCopy}
              style={{
                flexShrink: 0,
                backgroundColor: copied ? '#14532d' : '#0f3460',
                color: copied ? '#4ade80' : '#94a3b8',
                border: '1px solid #1e4d8c',
                borderRadius: '5px',
                padding: '6px 14px',
                fontSize: '13px',
                cursor: 'pointer',
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>

          {/* Expiry + regenerate */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: expiringSoon ? '#f87171' : '#64748b', fontSize: '13px', fontWeight: expiringSoon ? 600 : 400 }}>
              {pairExpiry === 0 ? 'Code expired' : `Expires in ${mins}:${secs}`}
            </span>
            <button
              onClick={generate}
              style={{
                background: 'transparent',
                color: '#475569',
                border: 'none',
                fontSize: '13px',
                cursor: 'pointer',
                padding: 0,
                textDecoration: 'underline',
              }}
            >
              Regenerate
            </button>
          </div>
        </>
      )}

      {!loading && !pairCode && !error && (
        <div style={{ textAlign: 'center', paddingBottom: '8px' }}>
          <button
            onClick={generate}
            style={{
              backgroundColor: '#0f3460', color: '#7dd3fc',
              border: '1px solid #1e4d8c', borderRadius: '6px',
              padding: '10px 22px', fontSize: '14px', cursor: 'pointer', fontWeight: 600,
            }}
          >
            Generate Pairing Code
          </button>
        </div>
      )}
    </div>
  )
}
