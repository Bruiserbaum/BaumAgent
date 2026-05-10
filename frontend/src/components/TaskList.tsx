import { Task, TaskStatus, Project } from '../api/client'

interface Props {
  tasks: Task[]
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onDragStart?: (taskId: string) => void
  projects?: Project[]
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
  const bgMap: Record<string, string> = {
    research: '#0d3340', deep_research: '#0d3340',
    coding: '#0d2d1a',
    structured_document: '#2d1f00',
    instructions: '#0d1f33',
  }
  const colorMap: Record<string, string> = {
    research: '#38bdf8', deep_research: '#38bdf8',
    coding: '#4ade80',
    structured_document: '#f59e0b',
    instructions: '#7dd3fc',
  }
  const borderMap: Record<string, string> = {
    research: '#0369a1', deep_research: '#0369a1',
    coding: '#166534',
    structured_document: '#92400e',
    instructions: '#1e4d8c',
  }
  const labelMap: Record<string, string> = {
    research: 'Research', deep_research: 'Deep Research',
    coding: 'Script',
    structured_document: 'Plan/Proposal',
    instructions: 'Instructions',
  }
  return (
    <span
      style={{
        backgroundColor: bgMap[taskType] ?? '#1e293b',
        color: colorMap[taskType] ?? '#64748b',
        borderRadius: '4px',
        padding: '2px 7px',
        fontSize: '11px',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        border: `1px solid ${borderMap[taskType] ?? '#334155'}`,
        flexShrink: 0,
      }}
    >
      {labelMap[taskType] ?? 'Code'}
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

export default function TaskList({ tasks, onSelect, onDelete, onDragStart, projects }: Props) {
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
      {tasks.map(task => {
        const project = projects?.find(p => p.id === task.project_id) ?? null
        return (
          <div
            key={task.id}
            style={row}
            draggable={true}
            onDragStart={e => {
              e.dataTransfer.setData('taskId', task.id)
              onDragStart?.(task.id)
            }}
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

            {project && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    backgroundColor: project.color,
                  }}
                />
                <span style={{ fontSize: '11px', color: '#64748b' }}>{project.name}</span>
              </div>
            )}

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
        )
      })}
    </div>
  )
}
