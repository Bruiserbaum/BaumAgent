import { useState } from 'react'
import { api, Task, Project } from '../api/client'

interface Props {
  tasks: Task[]
  projects: Project[]
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onTasksChange: () => void
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return `${Math.floor(diff)}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  queued:   { bg: '#374151', color: '#9ca3af' },
  running:  { bg: '#1e3a5f', color: '#60a5fa' },
  complete: { bg: '#14532d', color: '#4ade80' },
  failed:   { bg: '#450a0a', color: '#f87171' },
}

function TaskCard({
  task,
  onSelect,
  onDelete,
}: {
  task: Task
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}) {
  const colors = STATUS_COLORS[task.status] ?? STATUS_COLORS.queued
  const isResearch = task.task_type === 'research'

  return (
    <div
      draggable
      onDragStart={e => e.dataTransfer.setData('taskId', task.id)}
      onClick={() => onSelect(task.id)}
      style={{
        backgroundColor: '#16213e',
        border: '1px solid #1e3a5f',
        borderRadius: '7px',
        padding: '10px 12px',
        marginBottom: '8px',
        cursor: 'pointer',
        transition: 'border-color 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', flexWrap: 'wrap' }}>
        <span
          style={{
            backgroundColor: colors.bg,
            color: colors.color,
            borderRadius: '4px',
            padding: '1px 6px',
            fontSize: '10px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            animation: task.status === 'running' ? 'pulse 1.5s infinite' : undefined,
            flexShrink: 0,
          }}
        >
          {task.status}
        </span>
        <span
          style={{
            backgroundColor: isResearch ? '#0d3340' : '#1e293b',
            color: isResearch ? '#38bdf8' : '#64748b',
            borderRadius: '4px',
            padding: '1px 6px',
            fontSize: '10px',
            fontWeight: 700,
            textTransform: 'uppercase',
            border: `1px solid ${isResearch ? '#0369a1' : '#334155'}`,
            flexShrink: 0,
          }}
        >
          {isResearch ? 'Research' : 'Code'}
        </span>
      </div>

      <div
        style={{
          fontSize: '13px',
          fontWeight: 600,
          color: '#e2e8f0',
          marginBottom: '4px',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {task.description}
      </div>

      <div style={{ fontSize: '11px', color: '#475569' }}>
        {timeAgo(task.created_at)} · {task.llm_backend}/{task.llm_model}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
        {task.pr_url && (
          <a
            href={task.pr_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{ color: '#34d399', fontSize: '11px', textDecoration: 'none', flexShrink: 0 }}
          >
            PR #{task.pr_number}
          </a>
        )}
        {(task.status === 'queued' || task.status === 'failed') && (
          <button
            onClick={e => { e.stopPropagation(); onDelete(task.id) }}
            style={{
              marginLeft: 'auto',
              backgroundColor: 'transparent',
              border: '1px solid #4b1f1f',
              color: '#f87171',
              borderRadius: '4px',
              padding: '2px 8px',
              fontSize: '11px',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  )
}

export default function KanbanBoard({ tasks, projects, onSelect, onDelete, onTasksChange }: Props) {
  const [dragOverColId, setDragOverColId] = useState<string | null>(null)

  const handleDrop = async (e: React.DragEvent, projectId: string | null) => {
    e.preventDefault()
    setDragOverColId(null)
    const taskId = e.dataTransfer.getData('taskId')
    if (!taskId) return
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    // Only call API if project actually changed
    if (task.project_id !== projectId) {
      await api.assignProject(taskId, projectId)
      onTasksChange()
    }
  }

  // Build columns: Unassigned + each project in order
  const columns: Array<{ id: string | null; label: string; color: string }> = [
    { id: null, label: 'Unassigned', color: '#475569' },
    ...projects.map(p => ({ id: p.id, label: p.name, color: p.color })),
  ]

  const tasksByColumn: Record<string, Task[]> = { unassigned: [] }
  for (const p of projects) tasksByColumn[p.id] = []
  for (const task of tasks) {
    const key = task.project_id ?? 'unassigned'
    if (!tasksByColumn[key]) tasksByColumn[key] = []
    tasksByColumn[key].push(task)
  }

  const colCount = columns.length

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${colCount}, 1fr)`,
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>

      {columns.map((col, idx) => {
        const colKey = col.id ?? 'unassigned'
        const colTasks = tasksByColumn[colKey] ?? []
        const isDragTarget = dragOverColId === colKey
        const isLast = idx === colCount - 1

        return (
          <div
            key={colKey}
            onDragOver={e => { e.preventDefault(); setDragOverColId(colKey) }}
            onDragLeave={() => setDragOverColId(null)}
            onDrop={e => handleDrop(e, col.id)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              borderRight: isLast ? 'none' : '1px solid rgba(20,50,110,0.7)',
              backgroundColor: isDragTarget ? 'rgba(20,50,110,0.15)' : 'transparent',
              transition: 'background 0.15s',
              minHeight: 0,
              overflow: 'hidden',
            }}
          >
            {/* Column header */}
            <div
              style={{
                padding: '14px 14px 10px',
                borderBottom: '1px solid rgba(20,50,110,0.6)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  backgroundColor: col.color,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  color: col.color,
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                {col.label}
              </span>
              <span
                style={{
                  fontSize: '12px',
                  color: '#475569',
                  backgroundColor: 'rgba(15,23,42,0.6)',
                  borderRadius: '10px',
                  padding: '1px 8px',
                  flexShrink: 0,
                }}
              >
                {colTasks.length}
              </span>
            </div>

            {/* Task cards */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '10px 10px',
              }}
            >
              {colTasks.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    color: '#334155',
                    fontSize: '12px',
                    padding: '24px 8px',
                    borderRadius: '6px',
                    border: '1px dashed #1e3a5f',
                    marginTop: '4px',
                  }}
                >
                  Drop tasks here
                </div>
              ) : (
                colTasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onSelect={onSelect}
                    onDelete={onDelete}
                  />
                ))
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
