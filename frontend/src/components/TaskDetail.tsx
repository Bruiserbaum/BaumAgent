import { useState, useEffect, useRef } from 'react'
import { Task, api } from '../api/client'

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

const STATUS_TERMINAL = new Set(['complete', 'failed'])

export default function TaskDetail({ task }: Props) {
  const [log, setLog] = useState(task.log ?? '')
  const [copyLabel, setCopyLabel] = useState('Copy Script')
  const termRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)

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

    const connect = () => {
      const ws = new WebSocket(url)
      wsRef.current = ws
      let buffer = ''

      ws.onmessage = (e) => {
        buffer += e.data
        setLog(buffer)
      }

      ws.onclose = () => {
        // Reconnect if task still running
        if (!STATUS_TERMINAL.has(task.status)) {
          setTimeout(connect, 1500)
        }
      }
    }

    connect()

    return () => {
      wsRef.current?.close()
    }
  }, [task.id, task.status, task.log])

  const typeLabel = task.task_type === 'research' ? 'Research' : task.task_type === 'coding' ? 'Script' : 'Github'
  const typeBadgeStyle: React.CSSProperties = {
    backgroundColor: task.task_type === 'research' ? '#0d3340' : task.task_type === 'coding' ? '#0d2d1a' : '#1e1b3a',
    color: task.task_type === 'research' ? '#38bdf8' : task.task_type === 'coding' ? '#4ade80' : '#a78bfa',
    borderRadius: '4px',
    padding: '2px 8px',
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    border: `1px solid ${task.task_type === 'research' ? '#0369a1' : task.task_type === 'coding' ? '#166534' : '#5b21b6'}`,
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
          <span style={{ ...fieldValue, fontWeight: 700, color: task.status === 'complete' ? '#4ade80' : task.status === 'failed' ? '#f87171' : task.status === 'running' ? '#60a5fa' : '#9ca3af' }}>
            {task.status.toUpperCase()}
          </span>
        </div>
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
        {task.commit_sha && (
          <div style={fieldRow}>
            <span style={fieldLabel}>Commit</span>
            <span style={fieldValue}>{task.commit_sha.slice(0, 12)}</span>
          </div>
        )}
        {task.error_message && (
          <div style={fieldRow}>
            <span style={fieldLabel}>Error</span>
            <span style={{ ...fieldValue, color: '#f87171' }}>{task.error_message}</span>
          </div>
        )}

        {(task.status === 'failed' || task.status === 'complete') && (
          <div style={{ marginTop: '12px' }}>
            <button
              onClick={async () => { await api.retryTask(task.id) }}
              style={{
                backgroundColor: '#1e3a5f',
                color: '#60a5fa',
                border: '1px solid #2563eb',
                borderRadius: '6px',
                padding: '7px 20px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '14px',
              }}
            >
              {task.status === 'complete' ? '↻ Re-run Task' : '↻ Retry Task'}
            </button>
          </div>
        )}

        {task.pr_url && (
          <div style={{ marginTop: '16px', padding: '12px 16px', backgroundColor: '#0d2818', border: '1px solid #166534', borderRadius: '8px' }}>
            <span style={{ color: '#4ade80', fontWeight: 600, marginRight: '10px' }}>Pull Request Opened:</span>
            <a style={prLinkStyle} href={task.pr_url} target="_blank" rel="noopener noreferrer">
              PR #{task.pr_number} &rarr;
            </a>
          </div>
        )}

        {(task.task_type === 'research' && task.status === 'complete') && (
          <div style={{ marginTop: '16px', padding: '12px 16px', backgroundColor: '#0d2818', border: '1px solid #166534', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ color: '#4ade80', fontWeight: 600 }}>Research report ready</span>
            <button style={downloadBtn} onClick={() => api.downloadTask(task.id)}>
              &#x2B07; Download Report
            </button>
          </div>
        )}

        {(task.task_type === 'coding' && task.status === 'complete') && (
          <div style={{ marginTop: '16px', padding: '12px 16px', backgroundColor: '#091428', border: '1px solid #1e4d8c', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ color: '#7dd3fc', fontWeight: 600 }}>Script ready</span>
            <button style={copyBtn} onClick={handleCopyScript}>
              &#x2398; {copyLabel}
            </button>
            <button style={downloadBtn} onClick={() => api.downloadTask(task.id)}>
              &#x2B07; Download
            </button>
          </div>
        )}
      </div>

      <h3 style={{ color: '#7dd3fc', margin: '0 0 10px', fontSize: '15px' }}>Agent Log</h3>
      <div style={terminal} ref={termRef}>
        {log || '(waiting for output...)'}
      </div>
    </div>
  )
}
