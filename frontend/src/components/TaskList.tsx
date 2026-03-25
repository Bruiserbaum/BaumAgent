import { Task, TaskStatus } from '../api/client'

interface Props {
  tasks: Task[]
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return `${Math.floor(diff)}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

const STATUS_COLORS: Record<TaskStatus, { bg: string; color: string }> = {
  queued: { bg: '#374151', color: '#9ca3af' },
  running: { bg: '#1e3a5f', color: '#60a5fa' },
  complete: { bg: '#14532d', color: '#4ade80' },
  failed: { bg: '#450a0a', color: '#f87171' },
}

function StatusBadge({ status }: { status: TaskStatus }) {
  const colors = STATUS_COLORS[status] ?? STATUS_COLORS.queued
  return (
    <span
      style={{
        backgroundColor: colors.bg,
        color: colors.color,
        borderRadius: '4px',
        padding: '2px 8px',
        fontSize: '12px',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        animation: status === 'running' ? 'pulse 1.5s infinite' : undefined,
      }}
    >
      {status}
    </span>
  )
}

function TypeBadge({ taskType }: { taskType: string }) {
  const isResearch = taskType === 'research'
  return (
    <span
      style={{
        backgroundColor: isResearch ? '#0d3340' : '#1e293b',
        color: isResearch ? '#38bdf8' : '#64748b',
        borderRadius: '4px',
        padding: '2px 7px',
        fontSize: '11px',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        border: `1px solid ${isResearch ? '#0369a1' : '#334155'}`,
        flexShrink: 0,
      }}
    >
      {isResearch ? 'Research' : 'Code'}
    </span>
  )
}

const row: React.CSSProperties = {
  backgroundColor: '#16213e',
  border: '1px solid #1e3a5f',
  borderRadius: '8px',
  padding: '14px 18px',
  marginBottom: '10px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '14px',
  transition: 'border-color 0.15s',
}

const descStyle: React.CSSProperties = {
  flex: 1,
  overflow: 'hidden',
}

const descText: React.CSSProperties = {
  fontSize: '15px',
  fontWeight: 600,
  color: '#e2e8f0',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  marginBottom: '3px',
}

const meta: React.CSSProperties = {
  fontSize: '12px',
  color: '#64748b',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const deleteBtn: React.CSSProperties = {
  backgroundColor: 'transparent',
  border: '1px solid #4b1f1f',
  color: '#f87171',
  borderRadius: '5px',
  padding: '4px 10px',
  fontSize: '12px',
  cursor: 'pointer',
  flexShrink: 0,
}

const prLink: React.CSSProperties = {
  color: '#34d399',
  fontSize: '12px',
  textDecoration: 'none',
  flexShrink: 0,
}

const emptyStyle: React.CSSProperties = {
  textAlign: 'center',
  color: '#475569',
  padding: '60px 0',
  fontSize: '16px',
}

export default function TaskList({ tasks, onSelect, onDelete }: Props) {
  if (tasks.length === 0) {
    return (
      <div style={emptyStyle}>
        No tasks yet. Click <strong>+ New Task</strong> to get started.
      </div>
    )
  }

  return (
    <div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>
      {tasks.map(task => (
        <div
          key={task.id}
          style={row}
          onClick={() => onSelect(task.id)}
        >
          <StatusBadge status={task.status} />
          <TypeBadge taskType={task.task_type ?? 'code'} />

          <div style={descStyle}>
            <div style={descText}>{task.description}</div>
            <div style={meta}>
              {task.repo_url ? task.repo_url : 'Research task'}
              &nbsp;&bull;&nbsp; {timeAgo(task.created_at)}
              &nbsp;&bull;&nbsp; {task.llm_backend}/{task.llm_model}
            </div>
          </div>

          {task.pr_url && (
            <a
              style={prLink}
              href={task.pr_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
            >
              PR #{task.pr_number}
            </a>
          )}

          {(task.status === 'queued' || task.status === 'failed') && (
            <button
              style={deleteBtn}
              onClick={e => { e.stopPropagation(); onDelete(task.id) }}
            >
              Delete
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
