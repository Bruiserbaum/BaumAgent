import { useState, useRef } from 'react'
import { api, Project } from '../api/client'

const PRESET_COLORS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#06b6d4', '#6366f1', '#84cc16', '#64748b',
]

interface Props {
  projects: Project[]
  selectedProjectId: string | null   // null = "All Tasks"
  onSelectProject: (id: string | null) => void
  onProjectsChange: () => void        // refetch after create/delete
  taskCounts: Record<string, number>  // taskCounts[projectId] = count, taskCounts['unassigned'] = unassigned count
}

function ColorPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (c: string) => void
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
      {PRESET_COLORS.map(c => (
        <div
          key={c}
          onClick={() => onChange(c)}
          style={{
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            backgroundColor: c,
            cursor: 'pointer',
            border: value === c ? '2px solid #e2e8f0' : '2px solid transparent',
            flexShrink: 0,
          }}
        />
      ))}
    </div>
  )
}

export default function Sidebar({
  projects,
  selectedProjectId,
  onSelectProject,
  onProjectsChange,
  taskCounts,
}: Props) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#3b82f6')
  const [addLoading, setAddLoading] = useState(false)

  const [colorPickerOpenId, setColorPickerOpenId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  // Inline editing
  const editRef = useRef<HTMLDivElement>(null)

  const totalCount = taskCounts['all'] ?? 0
  const unassignedCount = taskCounts['unassigned'] ?? 0

  const handleAddProject = async () => {
    if (!newName.trim()) return
    setAddLoading(true)
    try {
      await api.createProject({ name: newName.trim(), color: newColor })
      setNewName('')
      setNewColor('#3b82f6')
      setShowAddForm(false)
      onProjectsChange()
    } catch {
      // ignore
    } finally {
      setAddLoading(false)
    }
  }

  const handleDeleteProject = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    await api.deleteProject(id)
    if (selectedProjectId === id) onSelectProject(null)
    onProjectsChange()
  }

  const handleRename = async (project: Project, el: HTMLDivElement) => {
    const newNameVal = el.innerText.trim()
    if (newNameVal && newNameVal !== project.name) {
      await api.updateProject(project.id, { name: newNameVal })
      onProjectsChange()
    } else {
      el.innerText = project.name
    }
  }

  const handleColorChange = async (project: Project, color: string) => {
    setColorPickerOpenId(null)
    await api.updateProject(project.id, { color })
    onProjectsChange()
  }

  const handleDragOver = (e: React.DragEvent, targetId: string | 'unassigned') => {
    e.preventDefault()
    setDragOverId(targetId)
  }

  const handleDragLeave = () => setDragOverId(null)

  const handleDrop = async (e: React.DragEvent, projectId: string | null) => {
    e.preventDefault()
    setDragOverId(null)
    const taskId = e.dataTransfer.getData('taskId')
    if (!taskId) return
    await api.assignProject(taskId, projectId)
    onProjectsChange()
  }

  const sidebarStyle: React.CSSProperties = {
    width: '220px',
    flexShrink: 0,
    backgroundColor: 'rgba(8,12,28,0.7)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    borderRight: '1px solid rgba(30,70,140,0.4)',
    display: 'flex',
    flexDirection: 'column',
    padding: '16px 0',
    overflowY: 'auto',
    minHeight: 0,
  }

  const sectionHeader: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 14px',
    marginBottom: '8px',
  }

  const sectionLabel: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: 700,
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  }

  const addBtn: React.CSSProperties = {
    backgroundColor: 'transparent',
    border: '1px solid #334155',
    borderRadius: '4px',
    color: '#64748b',
    fontSize: '14px',
    width: '20px',
    height: '20px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    lineHeight: 1,
  }

  const getItemStyle = (isSelected: boolean, isDragTarget: boolean, accentColor?: string): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '7px 14px',
    cursor: 'pointer',
    borderLeft: isSelected ? `3px solid ${accentColor ?? '#7dd3fc'}` : '3px solid transparent',
    backgroundColor: isDragTarget
      ? 'rgba(125,211,252,0.08)'
      : isSelected
        ? 'rgba(125,211,252,0.07)'
        : 'transparent',
    transition: 'background 0.12s, border-color 0.12s',
    position: 'relative',
  })

  const itemLabel: React.CSSProperties = {
    flex: 1,
    fontSize: '13px',
    color: '#cbd5e1',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }

  const countBadge = (n: number): React.CSSProperties => ({
    fontSize: '11px',
    color: '#475569',
    backgroundColor: '#1e293b',
    borderRadius: '10px',
    padding: '1px 6px',
    flexShrink: 0,
    minWidth: '18px',
    textAlign: 'center',
  })

  const dotStyle = (color: string): React.CSSProperties => ({
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: color,
    flexShrink: 0,
  })

  const xBtn: React.CSSProperties = {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#475569',
    cursor: 'pointer',
    fontSize: '14px',
    padding: '0 2px',
    lineHeight: 1,
    flexShrink: 0,
    display: 'none',
  }

  return (
    <div style={sidebarStyle}>
      <div style={sectionHeader}>
        <span style={sectionLabel}>Projects</span>
        <button
          style={addBtn}
          onClick={() => setShowAddForm(v => !v)}
          title="Add project"
        >
          +
        </button>
      </div>

      {/* All Tasks */}
      <div
        style={getItemStyle(selectedProjectId === null, dragOverId === 'all')}
        onClick={() => onSelectProject(null)}
        onDragOver={e => { e.preventDefault(); setDragOverId('all') }}
        onDragLeave={handleDragLeave}
        onDrop={e => { e.preventDefault(); setDragOverId(null) }}
      >
        <span style={{ ...itemLabel, color: selectedProjectId === null ? '#e2e8f0' : '#94a3b8' }}>
          All Tasks
        </span>
        <span style={countBadge(totalCount)}>{totalCount}</span>
      </div>

      {/* Unassigned */}
      <div
        style={getItemStyle(selectedProjectId === 'unassigned', dragOverId === 'unassigned')}
        onClick={() => onSelectProject('unassigned')}
        onDragOver={e => handleDragOver(e, 'unassigned')}
        onDragLeave={handleDragLeave}
        onDrop={e => handleDrop(e, null)}
      >
        <span style={{ ...itemLabel, color: selectedProjectId === 'unassigned' ? '#e2e8f0' : '#64748b' }}>
          Unassigned
        </span>
        <span style={countBadge(unassignedCount)}>{unassignedCount}</span>
      </div>

      {/* Divider */}
      {projects.length > 0 && (
        <div style={{ borderTop: '1px solid rgba(51,65,85,0.5)', margin: '6px 0' }} />
      )}

      {/* Project list */}
      {projects.map(project => (
        <div key={project.id} style={{ position: 'relative' }}>
          <div
            className="sidebar-project-row"
            style={getItemStyle(
              selectedProjectId === project.id,
              dragOverId === project.id,
              project.color,
            )}
            onClick={() => onSelectProject(project.id)}
            onDragOver={e => handleDragOver(e, project.id)}
            onDragLeave={handleDragLeave}
            onDrop={e => handleDrop(e, project.id)}
          >
            <div style={dotStyle(project.color)} />

            {/* Editable name */}
            <div
              ref={editRef}
              contentEditable
              suppressContentEditableWarning
              onDoubleClick={e => e.stopPropagation()}
              onClick={e => e.stopPropagation()}
              onBlur={e => handleRename(project, e.currentTarget)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  e.currentTarget.blur()
                }
                if (e.key === 'Escape') {
                  e.currentTarget.innerText = project.name
                  e.currentTarget.blur()
                }
              }}
              style={{
                ...itemLabel,
                outline: 'none',
                color: selectedProjectId === project.id ? '#e2e8f0' : '#cbd5e1',
              }}
            >
              {project.name}
            </div>

            <span style={countBadge(taskCounts[project.id] ?? 0)}>
              {taskCounts[project.id] ?? 0}
            </span>

            {/* Color swatch */}
            <div
              onClick={e => {
                e.stopPropagation()
                setColorPickerOpenId(colorPickerOpenId === project.id ? null : project.id)
              }}
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                backgroundColor: project.color,
                cursor: 'pointer',
                flexShrink: 0,
                border: '1px solid rgba(255,255,255,0.2)',
              }}
              title="Change color"
            />

            {/* Delete button */}
            <button
              className="proj-delete"
              style={xBtn}
              onClick={e => handleDeleteProject(e, project.id)}
              title="Delete project"
            >
              ×
            </button>
          </div>

          {/* Inline color picker */}
          {colorPickerOpenId === project.id && (
            <div
              style={{
                padding: '8px 14px 10px',
                backgroundColor: '#0f172a',
                borderBottom: '1px solid #1e293b',
              }}
              onClick={e => e.stopPropagation()}
            >
              <ColorPicker
                value={project.color}
                onChange={color => handleColorChange(project, color)}
              />
            </div>
          )}
        </div>
      ))}

      {/* Add project form */}
      {showAddForm && (
        <div
          style={{
            padding: '10px 14px',
            borderTop: '1px solid rgba(51,65,85,0.5)',
            marginTop: '4px',
          }}
        >
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleAddProject()
              if (e.key === 'Escape') { setShowAddForm(false); setNewName('') }
            }}
            placeholder="Project name"
            style={{
              width: '100%',
              backgroundColor: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '5px',
              color: '#e2e8f0',
              padding: '5px 8px',
              fontSize: '13px',
              boxSizing: 'border-box',
              marginBottom: '6px',
            }}
          />
          <ColorPicker value={newColor} onChange={setNewColor} />
          <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
            <button
              onClick={handleAddProject}
              disabled={addLoading || !newName.trim()}
              style={{
                flex: 1,
                backgroundColor: '#0f3460',
                color: '#7dd3fc',
                border: '1px solid #1e4d8c',
                borderRadius: '5px',
                padding: '5px 0',
                fontSize: '12px',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              {addLoading ? '...' : 'Save'}
            </button>
            <button
              onClick={() => { setShowAddForm(false); setNewName('') }}
              style={{
                flex: 1,
                backgroundColor: 'transparent',
                color: '#64748b',
                border: '1px solid #334155',
                borderRadius: '5px',
                padding: '5px 0',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <style>{`
        .sidebar-project-row:hover .proj-delete {
          display: inline-flex !important;
          align-items: center;
          justify-content: center;
        }
      `}</style>
    </div>
  )
}
