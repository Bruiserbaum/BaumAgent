import { useState, useEffect, useRef, useMemo } from 'react'
import { Task, api } from '../api/client'
import { sanitizeLog } from '../utils/sanitizeLog'

const copyBtn: React.CSSProperties = {
  backgroundColor: '#0d2040',
  color: '#7dd3fc',
  border: '1px solid #1e4d8c',
  borderRadius: '6px',
  padding: '8px 18px',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: '14px',
}

interface Props {
  task: Task
}

const card: React.CSSProperties = {
  backgroundColor: '#16213e',
  border: '1px solid #1e3a5f',
  borderRadius: '10px',
  padding: '24px',
  marginBottom: '20px',
}

const fieldRow: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  marginBottom: '8px',
  flexWrap: 'wrap',
}

const fieldLabel: React.CSSProperties = {
  color: '#64748b',
  fontSize: '13px',
  fontWeight: 600,
  minWidth: '110px',
}

const fieldValue: React.CSSProperties = {
  color: '#e2e8f0',
  fontSize: '13px',
  wordBreak: 'break-all',
}

const prLinkStyle: React.CSSProperties = {
  color: '#34d399',
  fontWeight: 700,
  textDecoration: 'none',
  fontSize: '15px',
}

const terminal: React.CSSProperties = {
  backgroundColor: '#0f172a',
  border: '1px solid #1e3a5f',
  borderRadius: '8px',
  padding: '16px',
  fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
  fontSize: '12px',
  color: '#a3e635',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
  maxHeight: '480px',
  overflowY: 'auto',
  lineHeight: 1.6,
}

const downloadBtn: React.CSSProperties = {
  backgroundColor: '#0d3320',
  color: '#4ade80',
  border: '1px solid #166534',
  borderRadius: '6px',
  padding: '8px 18px',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: '14px',
}

const STATUS_TERMINAL = new Set(['complete', 'failed', 'cancelled'])

const isHealthScan = (t: Task) => t.description.startsWith('[Health Scan]')

export default function TaskDetail({ task }: Props) {
  const [log, setLog] = useState(task.log ?? '')
  const [liveStatus, setLiveStatus] = useState<string>(task.status)
  const [progress, setProgress] = useState<number | null>(task.progress_percent ?? null)
  const [copyLabel, setCopyLabel] = useState('Copy Script')
  const [fixLoading, setFixLoading] = useState(false)
  const [fixTaskId, setFixTaskId] = useState<string | null>(null)
  const [fixError, setFixError] = useState('')
  const termRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)

  // Sanitize log text: detect embedded HTML and convert to readable plain text
  const displayLog = useMemo(() => sanitizeLog(log), [log])

  const handleFixIssues = async () => {
    setFixLoading(true)
    setFixError('')
    setFixTaskId(null)
    try {
      const result = await api.gitnexusFixIssues(task.id)
      setFixTaskId(result.task_id)
    } catch (err: any) {
      setFixError(err.message || 'Failed to create fix task')
    } finally {
      setFixLoading(false)
    }
  }

  const handleCopyScript = async () => {
    try {
      const text = await api.getTaskOutputText(task.id)
      await navigator.clipboard.writeText(text)
      setCopyLabel('Copied!')
      setTimeout(() => setCopyLabel('Copy Script'), 2000)
    } catch {
      setCopyLabel('Failed')
      setTimeout(() => setCopyLabel('Copy Script'), 2000)
    }
  }

  // Auto-scroll to bottom when log updates
  useEffect(() => {
    const el = termRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [log])

  useEffect(() => {
    // If already terminal status, just show existing log
    if (STATUS_TERMINAL.has(task.status)) {
      setLog(task.log ?? '')
      return
    }

    // Connect WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const host = window.location.host
    const url = `${protocol}://${host}/ws/tasks/${task.id}/logs`

    let isDone = false

    const connect = () => {
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onmessage = (e) => {
        try {
          const frame = JSON.parse(e.data) as { type: string; data: unknown }
          if (frame.type === 'log') {
            setLog(prev => prev + (frame.data as string))
          } else if (frame.type === 'status') {
            setLiveStatus(frame.data as string)
          } else if (frame.type === 'progress') {
            setProgress(frame.data as number)
          } else if (frame.type === 'done') {
            isDone = true
          }
        } catch {
          // Fallback: treat as raw text (shouldn't happen with updated server)
          setLog(prev => prev + e.data)
        }
      }

      ws.onclose = () => {
        if (!isDone && !STATUS_TERMINAL.has(liveStatus)) {
          setTimeout(connect, 1500)
        }
      }
    }

    connect()

    return () => {
      wsRef.current?.close()
    }
  }, [task.id, task.status, task.log])

  const typeLabel = task.task_type === 'research' ? 'Research'
    : task.task_type === 'coding' ? 'Script'
    : task.task_type === 'structured_document' ? 'Plan/Proposal'
    : task.task_type === 'instructions' ? 'Instructions'
    : 'Github'
  const typeBadgeStyle: React.CSSProperties = {
    backgroundColor: task.task_type === 'research' ? '#0d3340'
      : task.task_type === 'coding' ? '#0d2d1a'
      : task.task_type === 'structured_document' ? '#2d1f00'
      : task.task_type === 'instructions' ? '#0d1f33'
      : '#1e1b3a',
    color: task.task_type === 'research' ? '#38bdf8'
      : task.task_type === 'coding' ? '#4ade80'
      : task.task_type === 'structured_document' ? '#f59e0b'
      : task.task_type === 'instructions' ? '#7dd3fc'
      : '#a78bfa',
    borderRadius: '4px',
    padding: '2px 8px',
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    border: `1px solid ${task.task_type === 'research' ? '#0369a1'
      : task.task_type === 'coding' ? '#166534'
      : task.task_type === 'structured_document' ? '#92400e'
      : task.task_type === 'instructions' ? '#1e4d8c'
      : '#5b21b6'}`,
  }

  return (
    <div>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, color: '#7dd3fc', fontSize: '18px', flex: 1 }}>
            {task.description}
          </h2>
          <span style={typeBadgeStyle}>{typeLabel}</span>
        </div>

        <div style={fieldRow}>
          <span style={fieldLabel}>Status</span>
          <span style={{
            ...fieldValue, fontWeight: 700,
            color: liveStatus === 'complete' ? '#4ade80'
              : liveStatus === 'failed' ? '#f87171'
              : liveStatus === 'cancelled' ? '#f59e0b'
              : liveStatus === 'running' ? '#60a5fa'
              : '#9ca3af',
          }}>
            {liveStatus.toUpperCase()}
          </span>
        </div>
        {liveStatus === 'running' && progress !== null && (
          <div style={fieldRow}>
            <span style={fieldLabel}>Progress</span>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ flex: 1, height: '6px', backgroundColor: '#1e3a5f', borderRadius: '3px' }}>
                <div style={{ width: `${progress}%`, height: '100%', backgroundColor: '#60a5fa', borderRadius: '3px', transition: 'width 0.3s' }} />
              </div>
              <span style={{ color: '#60a5fa', fontSize: '12px', fontWeight: 600 }}>{progress}%</span>
            </div>
          </div>
        )}
        {task.repo_url && (
          <div style={fieldRow}>
            <span style={fieldLabel}>Repo</span>
            <span style={fieldValue}>{task.repo_url}</span>
          </div>
        )}
        <div style={fieldRow}>
          <span style={fieldLabel}>Branch</span>
          <span style={fieldValue}>{task.base_branch}</span>
        </div>
        <div style={fieldRow}>
          <span style={fieldLabel}>LLM</span>
          <span style={fieldValue}>{task.llm_backend} / {task.llm_model}</span>
        </div>
        {task.branch_name && (
          <div style={fieldRow}>
            <span style={fieldLabel}>Agent Branch</span>
            <span style={fieldValue}>{task.branch_name}</span>
          </div>
        )}
        {task.pr_url && (
          <div style={fieldRow}>
            <span style={fieldLabel}>Pull Request</span>
            <a href={task.pr_url} target="_blank" rel="noreferrer" style={prLinkStyle}>
              {task.pr_url}
            </a>
          </div>
        )}
        {task.commit_sha && (
          <div style={fieldRow}>
            <span style={fieldLabel}>Commit</span>
            <span style={fieldValue}>{task.commit_sha}</span>
          </div>
        )}
        {task.error_message && (
          <div style={fieldRow}>
            <span style={fieldLabel}>Error</span>
            <span style={{ ...fieldValue, color: '#f87171' }}>{task.error_message}</span>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {task.output_file && (
          <button style={downloadBtn} onClick={() => api.downloadTask(task.id)}>
            ⬇ Download Export
          </button>
        )}
        {task.task_type === 'coding' && task.output_file && (
          <button style={copyBtn} onClick={handleCopyScript}>{copyLabel}</button>
        )}
        {liveStatus === 'running' && (
          <button
            style={{ ...copyBtn, color: '#f59e0b', borderColor: '#92400e' }}
            onClick={() => api.cancelTask(task.id)}
          >
            ✕ Cancel
          </button>
        )}
        {liveStatus === 'failed' && (
          <button
            style={{ ...copyBtn, color: '#60a5fa', borderColor: '#1e4d8c' }}
            onClick={() => api.retryTask(task.id)}
          >
            ↻ Retry
          </button>
        )}
      </div>

      {/* Health scan fix button */}
      {isHealthScan(task) && liveStatus === 'complete' && (
        <div style={{ marginBottom: '16px' }}>
          <button
            style={{ ...downloadBtn, backgroundColor: '#1e1b3a', color: '#a78bfa', borderColor: '#5b21b6' }}
            onClick={handleFixIssues}
            disabled={fixLoading}
          >
            {fixLoading ? 'Creating fix task…' : '🔧 Auto-Fix Issues'}
          </button>
          {fixTaskId && (
            <span style={{ marginLeft: '12px', color: '#4ade80', fontSize: '13px' }}>
              Fix task created: {fixTaskId}
            </span>
          )}
          {fixError && (
            <span style={{ marginLeft: '12px', color: '#f87171', fontSize: '13px' }}>
              {fixError}
            </span>
          )}
        </div>
      )}

      {/* Agent Log */}
      <h3 style={{ color: '#a3e635', fontSize: '15px', marginBottom: '8px' }}>Agent Log</h3>
      <div ref={termRef} style={terminal}>
        {displayLog || (liveStatus === 'queued' ? 'Waiting in queue…' : 'Waiting for log output…')}
      </div>
    </div>
  )
}
