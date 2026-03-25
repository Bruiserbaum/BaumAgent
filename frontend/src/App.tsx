import { useState, useEffect, useCallback } from 'react'

declare const __APP_VERSION__: string
import { api, Task } from './api/client'
import TaskList from './components/TaskList'
import TaskDetail from './components/TaskDetail'
import TaskSubmitForm from './components/TaskSubmitForm'

const styles = {
  app: {
    minHeight: '100vh',
    backgroundColor: '#1a1a2e',
    color: '#e2e8f0',
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    margin: 0,
    padding: 0,
  } as React.CSSProperties,
  header: {
    backgroundColor: '#16213e',
    borderBottom: '1px solid #0f3460',
    padding: '16px 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  } as React.CSSProperties,
  title: {
    margin: 0,
    fontSize: '22px',
    fontWeight: 700,
    color: '#7dd3fc',
    letterSpacing: '-0.5px',
  } as React.CSSProperties,
  newTaskBtn: {
    backgroundColor: '#0f3460',
    color: '#7dd3fc',
    border: '1px solid #1e4d8c',
    borderRadius: '6px',
    padding: '8px 18px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 600,
    transition: 'background 0.15s',
  } as React.CSSProperties,
  content: {
    maxWidth: '1100px',
    margin: '0 auto',
    padding: '24px 16px',
  } as React.CSSProperties,
  backBtn: {
    backgroundColor: 'transparent',
    color: '#94a3b8',
    border: '1px solid #334155',
    borderRadius: '6px',
    padding: '6px 14px',
    cursor: 'pointer',
    fontSize: '13px',
    marginBottom: '18px',
  } as React.CSSProperties,
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  } as React.CSSProperties,
}

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  const loadTasks = useCallback(async () => {
    try {
      const data = await api.getTasks()
      setTasks(data)
    } catch {
      // silently ignore on poll
    }
  }, [])

  useEffect(() => {
    loadTasks()
    const interval = setInterval(loadTasks, 3000)
    return () => clearInterval(interval)
  }, [loadTasks])

  const handleDelete = async (id: string) => {
    await api.deleteTask(id)
    await loadTasks()
  }

  const selectedTask = tasks.find(t => t.id === selectedTaskId) ?? null

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
          <h1 style={styles.title}>BaumAgent</h1>
          <span style={{ color: '#475569', fontSize: '12px', fontWeight: 400 }}>v{__APP_VERSION__}</span>
        </div>
        <button style={styles.newTaskBtn} onClick={() => setShowForm(true)}>
          + New Task
        </button>
      </header>

      <main style={styles.content}>
        {selectedTask ? (
          <>
            <button style={styles.backBtn} onClick={() => setSelectedTaskId(null)}>
              &larr; Back to Tasks
            </button>
            <TaskDetail task={selectedTask} />
          </>
        ) : (
          <TaskList
            tasks={tasks}
            onSelect={setSelectedTaskId}
            onDelete={handleDelete}
          />
        )}
      </main>

      {showForm && (
        <div style={styles.overlay} onClick={() => setShowForm(false)}>
          <div onClick={e => e.stopPropagation()}>
            <TaskSubmitForm
              onClose={() => setShowForm(false)}
              onCreated={async () => {
                setShowForm(false)
                await loadTasks()
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
