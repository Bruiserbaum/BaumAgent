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
  onProjectsChange: () => void
  taskCounts: Record<string, number>
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', padding: '10px' }}>
      {PRESET_COLORS.map(c => (
        <div
          key={c}
          onClick={e => { e.stopPropagation(); onChange(c) }}
          style={{
            width: '20px', height: '20px', borderRadius: '50%',
            backgroundColor: c, cursor: 'pointer',
            border: value === c ? '2px solid #e2e8f0' : '2px solid transparent',
            flexShrink: 0,
          }}
        />
      ))}
    </div>
  )
}

export default function Sidebar({
  projects, selectedProjectId, onSelectProject, onProjectsChange, taskCounts,
}: Props) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#3b82f6')
  const [addLoading, setAddLoading] = useState(false)
  const [colorPickerOpenId, setColorPickerOpenId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const addInputRef = useRef<HTMLInputElement>(null)

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
    } catch { /* ignore */ }
    finally { setAddLoading(false) }
  }

  const handleDeleteProject = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    await api.deleteProject(id)
    if (selectedProjectId === id) onSelectProject(null)
    onProjectsChange()
  }

  const handleRename = async (project: Project, el: HTMLSpanElement) => {
    const val = el.innerText.trim()
    if (val && val !== project.name) {
      await api.updateProject(project.id, { name: val })
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

  const handleDrop = async (e: React.DragEvent, projectId: string | null) => {
    e.preventDefault()
    setDragOverId(null)
    const taskId = e.dataTransfer.getData('taskId')
    if (!taskId) return
    await api.assignProject(taskId, projectId)
    onProjectsChange()
  }

  const barStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '10px 20px',
    backgroundColor: 'rgba(8,12,28,0.65)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    borderBottom: '1px solid rgba(30,70,140,0.35)',
    overflowX: 'auto',
    flexShrink: 0,
    flexWrap: 'wrap',
    rowGap: '8px',
  }

  const pillBase = (isSelected: boolean, isDragTarget: boolean, accentColor?: string): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '7px',
    padding: '6px 16px',
    borderRadius: '20px',
    cursor: 'pointer',
    fontSize: '24px',
    fontWeight: isSelected ? 700 : 500,
    userSelect: 'none',
    transition: 'all 0.15s',
    border: isSelected
      ? `2px solid ${accentColor ?? '#7dd3fc'}`
      : isDragTarget
        ? '2px solid rgba(125,211,252,0.5)'
        : '2px solid rgba(51,65,85,0.6)',
    backgroundColor: isDragTarget
      ? 'rgba(125,211,252,0.1)'
      : isSelected
        ? 'rgba(125,211,252,0.08)'
        : 'rgba(15,23,42,0.5)',
    color: isSelected ? (accentColor ?? '#7dd3fc') : '#94a3b8',
    flexShrink: 0,
    position: 'relative',
  })

  const countBadgeStyle: React.CSSProperties = {
    fontSize: '15px',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: '10px',
    padding: '1px 8px',
    color: '#64748b',
  }

  const dotStyle = (color: string): React.CSSProperties => ({
    width: '12px', height: '12px', borderRadius: '50%',
    backgroundColor: color, flexShrink: 0,
  })

  const dividerStyle: React.CSSProperties = {
    width: '1px', height: '28px',
    backgroundColor: 'rgba(51,65,85,0.7)',
    flexShrink: 0, margin: '0 4px',
  }

  return (
    <div style={barStyle}>
      {/* All Tasks */}
      <div
        style={pillBase(selectedProjectId === null, dragOverId === 'all')}
        onClick={() => onSelectProject(null)}
        onDragOver={e => { e.preventDefault(); setDragOverId('all') }}
        onDragLeave={() => setDragOverId(null)}
        onDrop={e => { e.preventDefault(); setDragOverId(null) }}
      >
        All Tasks
        <span style={countBadgeStyle}>{totalCount}</span>
      </div>

      {/* Unassigned */}
      <div
        style={pillBase(selectedProjectId === 'unassigned', dragOverId === 'unassigned')}
        onClick={() => onSelectProject('unassigned')}
        onDragOver={e => { e.preventDefault(); setDragOverId('unassigned') }}
        onDragLeave={() => setDragOverId(null)}
        onDrop={e => handleDrop(e, null)}
      >
        Unassigned
        <span style={countBadgeStyle}>{unassignedCount}</span>
      </div>

      {projects.length > 0 && <div style={dividerStyle} />}

      {/* Project pills */}
      {projects.map(project => (
        <div key={project.id} style={{ position: 'relative', flexShrink: 0 }}>
          <div
            className="proj-pill"
            style={pillBase(selectedProjectId === project.id, dragOverId === project.id, project.color)}
            onClick={() => { onSelectProject(project.id); setColorPickerOpenId(null) }}
            onDragOver={e => { e.preventDefault(); setDragOverId(project.id) }}
            onDragLeave={() => setDragOverId(null)}
            onDrop={e => handleDrop(e, project.id)}
          >
            {/* Color dot — click to open color picker */}
            <div
              style={{ ...dotStyle(project.color), cursor: 'pointer', border: '1px solid rgba(255,255,255,0.2)' }}
              onClick={e => {
                e.stopPropagation()
                setColorPickerOpenId(colorPickerOpenId === project.id ? null : project.id)
              }}
              title="Change color"
            />

            {/* Editable name */}
            <span
              contentEditable
              suppressContentEditableWarning
              onDoubleClick={e => e.stopPropagation()}
              onClick={e => e.stopPropagation()}
              onBlur={e => handleRename(project, e.currentTarget)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() }
                if (e.key === 'Escape') { e.currentTarget.innerText = project.name; e.currentTarget.blur() }
              }}
              style={{ outline: 'none', minWidth: '20px' }}
            >
              {project.name}
            </span>

            <span style={countBadgeStyle}>{taskCounts[project.id] ?? 0}</span>

            {/* Delete × */}
            <button
              className="proj-del"
              onClick={e => handleDeleteProject(e, project.id)}
              style={{
                display: 'none',
                background: 'none', border: 'none',
                color: '#ef4444', cursor: 'pointer',
                fontSize: '18px', padding: '0 2px',
                lineHeight: 1, flexShrink: 0,
              }}
              title="Delete project"
            >
              ×
            </button>
          </div>

          {/* Color picker dropdown */}
          {colorPickerOpenId === project.id && (
            <div
              style={{
                position: 'absolute', top: 'calc(100% + 6px)', left: 0,
                backgroundColor: '#0f172a', border: '1px solid #334155',
                borderRadius: '8px', zIndex: 50,
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
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

      {/* Add project button */}
      {!showAddForm ? (
        <button
          onClick={() => { setShowAddForm(true); setTimeout(() => addInputRef.current?.focus(), 50) }}
          style={{
            background: 'none',
            border: '2px dashed rgba(51,65,85,0.8)',
            borderRadius: '20px',
            color: '#475569',
            fontSize: '22px',
            padding: '5px 14px',
            cursor: 'pointer',
            flexShrink: 0,
          }}
          title="Add project"
        >
          + Project
        </button>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <div
            style={{
              width: '14px', height: '14px', borderRadius: '50%',
              backgroundColor: newColor, flexShrink: 0, cursor: 'pointer',
              border: '2px solid rgba(255,255,255,0.2)',
            }}
            onClick={() => setColorPickerOpenId(colorPickerOpenId === '__new__' ? null : '__new__')}
            title="Pick color"
          />
          {colorPickerOpenId === '__new__' && (
            <div
              style={{
                position: 'absolute', zIndex: 50,
                backgroundColor: '#0f172a', border: '1px solid #334155',
                borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                marginTop: '40px',
              }}
            >
              <ColorPicker value={newColor} onChange={c => { setNewColor(c); setColorPickerOpenId(null) }} />
            </div>
          )}
          <input
            ref={addInputRef}
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleAddProject()
              if (e.key === 'Escape') { setShowAddForm(false); setNewName('') }
            }}
            placeholder="Project name"
            style={{
              backgroundColor: '#0f172a', border: '1px solid #334155',
              borderRadius: '16px', color: '#e2e8f0',
              padding: '5px 14px', fontSize: '20px',
              outline: 'none', width: '180px',
            }}
          />
          <button
            onClick={handleAddProject}
            disabled={addLoading || !newName.trim()}
            style={{
              backgroundColor: '#0f3460', color: '#7dd3fc',
              border: '1px solid #1e4d8c', borderRadius: '16px',
              padding: '5px 14px', fontSize: '18px',
              cursor: 'pointer', fontWeight: 600,
            }}
          >
            {addLoading ? '...' : 'Save'}
          </button>
          <button
            onClick={() => { setShowAddForm(false); setNewName('') }}
            style={{
              background: 'none', border: '1px solid #334155',
              borderRadius: '16px', color: '#64748b',
              padding: '5px 12px', fontSize: '18px', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      )}

      <style>{`
        .proj-pill:hover .proj-del { display: inline-flex !important; align-items: center; justify-content: center; }
      `}</style>
    </div>
  )
}
