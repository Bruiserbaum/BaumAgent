import { useState } from 'react'
import { api, Task, Project } from '../api/client'

const PRESET_COLORS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#06b6d4', '#6366f1', '#84cc16', '#64748b',
]

interface Props {
  tasks: Task[]
  projects: Project[]
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onTasksChange: () => void
  onProjectsChange: () => void
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
  onRetry,
}: {
  task: Task
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onRetry: (id: string) => void
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
        <span style={{
          backgroundColor: colors.bg, color: colors.color,
          borderRadius: '4px', padding: '1px 6px',
          fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
          animation: task.status === 'running' ? 'pulse 1.5s infinite' : undefined, flexShrink: 0,
        }}>
          {task.status}
        </span>
        <span style={{
          backgroundColor: isResearch ? '#0d3340' : '#1e293b',
          color: isResearch ? '#38bdf8' : '#64748b',
          borderRadius: '4px', padding: '1px 6px', fontSize: '10px', fontWeight: 700,
          textTransform: 'uppercase', border: `1px solid ${isResearch ? '#0369a1' : '#334155'}`, flexShrink: 0,
        }}>
          {isResearch ? 'Research' : 'Code'}
        </span>
      </div>

      <div style={{
        fontSize: '13px', fontWeight: 600, color: '#e2e8f0', marginBottom: '4px',
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {task.description}
      </div>

      <div style={{ fontSize: '11px', color: '#475569' }}>
        {timeAgo(task.created_at)} · {task.llm_backend}/{task.llm_model}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
        {task.pr_url && (
          <a href={task.pr_url} target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{ color: '#34d399', fontSize: '11px', textDecoration: 'none', flexShrink: 0 }}>
            PR #{task.pr_number}
          </a>
        )}
        <div style={{ flex: 1 }} />
        {task.status === 'failed' && (
          <button
            onClick={e => { e.stopPropagation(); onRetry(task.id) }}
            style={{
              backgroundColor: '#1e3a5f', border: '1px solid #2563eb',
              color: '#60a5fa', borderRadius: '4px', padding: '2px 8px',
              fontSize: '11px', cursor: 'pointer', flexShrink: 0,
            }}
          >
            Retry
          </button>
        )}
        {(task.status === 'queued' || task.status === 'failed') && (
          <button
            onClick={e => { e.stopPropagation(); onDelete(task.id) }}
            style={{
              backgroundColor: 'transparent', border: '1px solid #4b1f1f',
              color: '#f87171', borderRadius: '4px', padding: '2px 8px',
              fontSize: '11px', cursor: 'pointer', flexShrink: 0,
            }}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  )
}

export default function KanbanBoard({ tasks, projects, onSelect, onDelete, onTasksChange, onProjectsChange }: Props) {
  const [dragOverColId, setDragOverColId] = useState<string | null>(null)
  const [showAddProject, setShowAddProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectColor, setNewProjectColor] = useState('#3b82f6')
  const [addingProject, setAddingProject] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)

  const handleDrop = async (e: React.DragEvent, projectId: string | null) => {
    e.preventDefault()
    setDragOverColId(null)
    const taskId = e.dataTransfer.getData('taskId')
    if (!taskId) return
    const task = tasks.find(t => t.id === taskId)
    if (!task || task.project_id === projectId) return
    await api.assignProject(taskId, projectId)
    onTasksChange()
  }

  const handleRetry = async (taskId: string) => {
    await api.retryTask(taskId)
    onTasksChange()
  }

  const handleAddProject = async () => {
    if (!newProjectName.trim()) return
    setAddingProject(true)
    try {
      await api.createProject({ name: newProjectName.trim(), color: newProjectColor })
      setNewProjectName('')
      setNewProjectColor('#3b82f6')
      setShowAddProject(false)
      onProjectsChange()
    } catch { /* ignore */ }
    finally { setAddingProject(false) }
  }

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

  const colCount = columns.length + 1 // +1 for add-project column

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${colCount}, 1fr)`,
      height: '100%',
      minHeight: 0,
      overflow: 'hidden',
    }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>

      {columns.map((col, idx) => {
        const colKey = col.id ?? 'unassigned'
        const colTasks = tasksByColumn[colKey] ?? []
        const isDragTarget = dragOverColId === colKey

        return (
          <div
            key={colKey}
            onDragOver={e => { e.preventDefault(); setDragOverColId(colKey) }}
            onDragLeave={() => setDragOverColId(null)}
            onDrop={e => handleDrop(e, col.id)}
            style={{
              display: 'flex', flexDirection: 'column',
              borderRight: '1px solid rgba(20,50,110,0.7)',
              backgroundColor: isDragTarget ? 'rgba(20,50,110,0.15)' : 'transparent',
              transition: 'background 0.15s',
              minHeight: 0, overflow: 'hidden',
            }}
          >
            <div style={{
              padding: '14px 14px 10px',
              borderBottom: '1px solid rgba(20,50,110,0.6)',
              display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0,
            }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: col.color, flexShrink: 0 }} />
              <span style={{
                fontSize: '14px', fontWeight: 700, color: col.color,
                flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                textTransform: 'uppercase', letterSpacing: '0.06em',
              }}>
                {col.label}
              </span>
              <span style={{
                fontSize: '12px', color: '#475569',
                backgroundColor: 'rgba(15,23,42,0.6)', borderRadius: '10px', padding: '1px 8px', flexShrink: 0,
              }}>
                {colTasks.length}
              </span>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
              {colTasks.length === 0 ? (
                <div style={{
                  textAlign: 'center', color: '#334155', fontSize: '12px',
                  padding: '24px 8px', borderRadius: '6px',
                  border: '1px dashed #1e3a5f', marginTop: '4px',
                }}>
                  Drop tasks here
                </div>
              ) : (
                colTasks.map(task => (
                  <TaskCard key={task.id} task={task}
                    onSelect={onSelect} onDelete={onDelete} onRetry={handleRetry} />
                ))
              )}
            </div>
          </div>
        )
      })}

      {/* Add project column */}
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        <div style={{
          padding: '14px 14px 10px',
          borderBottom: '1px solid rgba(20,50,110,0.6)',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Projects
          </span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
          {!showAddProject ? (
            <button
              onClick={() => setShowAddProject(true)}
              style={{
                width: '100%', background: 'none',
                border: '2px dashed rgba(30,58,95,0.8)', borderRadius: '7px',
                color: '#334155', fontSize: '13px', padding: '16px 0',
                cursor: 'pointer', display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: '6px',
              }}
            >
              + New Project
            </button>
          ) : (
            <div style={{
              backgroundColor: '#16213e', border: '1px solid #1e3a5f',
              borderRadius: '7px', padding: '12px',
            }}>
              <input
                autoFocus
                value={newProjectName}
                onChange={e => setNewProjectName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleAddProject()
                  if (e.key === 'Escape') { setShowAddProject(false); setNewProjectName('') }
                }}
                placeholder="Project name"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  backgroundColor: '#0f172a', border: '1px solid #334155',
                  borderRadius: '5px', color: '#e2e8f0',
                  padding: '6px 8px', fontSize: '13px', marginBottom: '8px', outline: 'none',
                }}
              />

              {/* Color swatch */}
              <div style={{ marginBottom: '8px' }}>
                <div
                  onClick={() => setShowColorPicker(v => !v)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
                  }}
                >
                  <div style={{ width: '18px', height: '18px', borderRadius: '50%', backgroundColor: newProjectColor, border: '2px solid rgba(255,255,255,0.2)', flexShrink: 0 }} />
                  <span style={{ fontSize: '12px', color: '#64748b' }}>Color</span>
                </div>
                {showColorPicker && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
                    {PRESET_COLORS.map(c => (
                      <div key={c} onClick={() => { setNewProjectColor(c); setShowColorPicker(false) }}
                        style={{
                          width: '18px', height: '18px', borderRadius: '50%', backgroundColor: c,
                          cursor: 'pointer', border: newProjectColor === c ? '2px solid #e2e8f0' : '2px solid transparent',
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  onClick={handleAddProject}
                  disabled={addingProject || !newProjectName.trim()}
                  style={{
                    flex: 1, backgroundColor: '#0f3460', color: '#7dd3fc',
                    border: '1px solid #1e4d8c', borderRadius: '5px',
                    padding: '5px 0', fontSize: '12px', cursor: 'pointer', fontWeight: 600,
                  }}
                >
                  {addingProject ? '...' : 'Save'}
                </button>
                <button
                  onClick={() => { setShowAddProject(false); setNewProjectName('') }}
                  style={{
                    flex: 1, background: 'none', border: '1px solid #334155',
                    color: '#64748b', borderRadius: '5px', padding: '5px 0',
                    fontSize: '12px', cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Existing project list for delete/rename */}
          {projects.map(p => (
            <ProjectRow key={p.id} project={p} onProjectsChange={onProjectsChange} />
          ))}
        </div>
      </div>
    </div>
  )
}

function ProjectRow({ project, onProjectsChange }: { project: Project; onProjectsChange: () => void }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(project.name)

  const save = async () => {
    if (name.trim() && name.trim() !== project.name) {
      await api.updateProject(project.id, { name: name.trim() })
      onProjectsChange()
    } else {
      setName(project.name)
    }
    setEditing(false)
  }

  const handleDelete = async () => {
    await api.deleteProject(project.id)
    onProjectsChange()
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '6px',
      padding: '5px 6px', borderRadius: '5px', marginTop: '6px',
      backgroundColor: 'rgba(15,23,42,0.4)',
    }}>
      <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: project.color, flexShrink: 0 }} />
      {editing ? (
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setName(project.name); setEditing(false) } }}
          style={{
            flex: 1, backgroundColor: '#0f172a', border: '1px solid #334155',
            borderRadius: '4px', color: '#e2e8f0', padding: '2px 6px', fontSize: '12px', outline: 'none',
          }}
        />
      ) : (
        <span
          onDoubleClick={() => setEditing(true)}
          style={{ flex: 1, fontSize: '12px', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'default' }}
          title="Double-click to rename"
        >
          {project.name}
        </span>
      )}
      <button
        onClick={handleDelete}
        style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '14px', padding: '0 2px', flexShrink: 0 }}
        title="Delete project"
      >
        ×
      </button>
    </div>
  )
}
