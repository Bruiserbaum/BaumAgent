import { useState, useEffect, useCallback, useRef } from 'react'

declare const __APP_VERSION__: string
import { api, Task, User, Project, QueueStatus } from './api/client'
import KanbanBoard from './components/KanbanBoard'
import TaskDetail from './components/TaskDetail'
import TaskSubmitForm from './components/TaskSubmitForm'
import SettingsPanel from './components/SettingsPanel'
import DataCenterBackground from './components/DataCenterBackground'
import ChatPanel from './components/ChatPanel'
import UserAvatar from './components/UserAvatar'
import ProfilePanel from './components/ProfilePanel'

function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= breakpoint)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= breakpoint)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [breakpoint])
  return isMobile
}

const styles = {
  app: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column' as const,
    backgroundColor: 'transparent',
    color: '#e2e8f0',
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    margin: 0,
    padding: 0,
    position: 'relative' as const,
    zIndex: 1,
    overflow: 'hidden',
  } as React.CSSProperties,
  header: {
    backgroundColor: 'rgba(8,12,28,0.80)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderBottom: '1px solid rgba(20,50,110,0.7)',
    padding: '12px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
    zIndex: 10,
  } as React.CSSProperties,
  title: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 700,
    color: '#7dd3fc',
    letterSpacing: '-0.5px',
  } as React.CSSProperties,
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  } as React.CSSProperties,
  newTaskBtn: {
    backgroundColor: '#0f3460',
    color: '#7dd3fc',
    border: '1px solid #1e4d8c',
    borderRadius: '6px',
    padding: '7px 16px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
  } as React.CSSProperties,
  settingsBtn: {
    backgroundColor: '#0f2030',
    color: '#94a3b8',
    border: '1px solid #1e4d8c',
    borderRadius: '6px',
    padding: '7px 16px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
  } as React.CSSProperties,
  backBtn: {
    backgroundColor: 'transparent',
    color: '#94a3b8',
    border: '1px solid #334155',
    borderRadius: '6px',
    padding: '6px 14px',
    cursor: 'pointer',
    fontSize: '13px',
    marginBottom: '14px',
    display: 'inline-block',
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

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  images?: string[]
  documents?: { filename: string; content: string }[]
}

export default function App() {
  const isMobile = useIsMobile()
  const [tasks, setTasks] = useState<Task[]>([])
  const [queueStatus, setQueueStatus] = useState<QueueStatus>({ queued: [], running: [] })
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])

  const loadTasks = useCallback(async () => {
    try {
      const [t, q] = await Promise.all([api.getTasks(), api.getQueueStatus()])
      setTasks(t)
      setQueueStatus(q)
    } catch { /* ignore */ }
  }, [])

  const loadProjects = useCallback(async () => {
    try { setProjects(await api.getProjects()) } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    loadTasks()
    const interval = setInterval(loadTasks, 3000)
    return () => clearInterval(interval)
  }, [loadTasks])

  useEffect(() => {
    api.getMe().then(setCurrentUser).catch(() => {})
    loadProjects()
  }, [loadProjects])

  const handleDelete = async (id: string) => {
    await api.deleteTask(id)
    await loadTasks()
  }

  const selectedTask = tasks.find(t => t.id === selectedTaskId) ?? null

  const MOBILE_HEADER_H = 52 // px — matches the fixed mobile header height

  return (
    <div style={{
      ...styles.app,
      // On mobile let content scroll naturally; desktop keeps overflow:hidden
      overflow: isMobile ? 'visible' : 'hidden',
      height: isMobile ? 'auto' : '100vh',
      minHeight: isMobile ? '100dvh' : undefined,
    }}>
        <DataCenterBackground />

        {/* Header — fixed on mobile so it's always visible above browser chrome */}
        <header style={{
          ...styles.header,
          ...(isMobile ? {
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 200,
            padding: '8px 14px',
            height: `${MOBILE_HEADER_H}px`,
            boxSizing: 'border-box',
          } : {}),
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ ...styles.title, fontSize: isMobile ? '16px' : '20px', margin: 0 }}>BaumAgent</h1>
            {!isMobile && <span style={{ color: '#475569', fontSize: '11px' }}>v{__APP_VERSION__}</span>}
          </div>
          <div style={styles.headerActions}>
            {isMobile ? (
              <>
                <button
                  style={{ ...styles.settingsBtn, padding: '6px 10px' }}
                  onClick={() => setShowSettings(true)}
                  title="Settings"
                >⚙</button>
                <button
                  style={{ ...styles.newTaskBtn, padding: '6px 10px' }}
                  onClick={() => setShowForm(true)}
                  title="New Task"
                >+</button>
                <button
                  style={{ ...styles.settingsBtn, padding: '6px 10px', color: showChat ? '#7dd3fc' : '#94a3b8', border: showChat ? '1px solid #7dd3fc' : '1px solid #1e4d8c' }}
                  onClick={() => setShowChat(v => !v)}
                  title="AI Chat"
                >💬</button>
                <UserAvatar user={currentUser} onClick={currentUser ? () => setShowProfile(true) : undefined} />
              </>
            ) : (
              <>
                <button style={styles.settingsBtn} onClick={() => setShowSettings(true)}>⚙ Settings</button>
                <button style={styles.newTaskBtn} onClick={() => setShowForm(true)}>+ New Task</button>
                <UserAvatar user={currentUser} onClick={currentUser ? () => setShowProfile(true) : undefined} />
              </>
            )}
          </div>
        </header>

        {/* Body */}
        {isMobile ? (
          // Mobile: normal document flow, scrolls naturally, padded below fixed header
          <div style={{ paddingTop: `${MOBILE_HEADER_H}px`, position: 'relative', zIndex: 1, minHeight: `calc(100dvh - ${MOBILE_HEADER_H}px)` }}>
            {selectedTask ? (
              <div style={{ padding: '12px', overflowY: 'auto' }}>
                <button style={styles.backBtn} onClick={() => setSelectedTaskId(null)}>&larr; Back</button>
                <TaskDetail task={selectedTask} />
              </div>
            ) : (
              <KanbanBoard
                tasks={tasks}
                projects={projects}
                queueStatus={queueStatus}
                onSelect={setSelectedTaskId}
                onDelete={handleDelete}
                onTasksChange={loadTasks}
                onProjectsChange={loadProjects}
                isMobile={isMobile}
              />
            )}
          </div>
        ) : (
          // Desktop: flex side-by-side, fixed height
          <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden', position: 'relative', zIndex: 1 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
              {selectedTask ? (
                <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
                  <button style={styles.backBtn} onClick={() => setSelectedTaskId(null)}>&larr; Back to Tasks</button>
                  <TaskDetail task={selectedTask} />
                </div>
              ) : (
                <KanbanBoard
                  tasks={tasks}
                  projects={projects}
                  queueStatus={queueStatus}
                  onSelect={setSelectedTaskId}
                  onDelete={handleDelete}
                  onTasksChange={loadTasks}
                  onProjectsChange={loadProjects}
                  isMobile={false}
                />
              )}
            </div>
            <ChatPanel messages={chatMessages} setMessages={setChatMessages} />
          </div>
        )}

        {/* Mobile: chat as slide-up bottom drawer */}
        {isMobile && showChat && (
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 90, backgroundColor: 'rgba(0,0,0,0.5)' }}
            onClick={() => setShowChat(false)}
          >
            <div
              style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                height: '78vh',
                borderRadius: '16px 16px 0 0',
                overflow: 'hidden',
                display: 'flex', flexDirection: 'column',
              }}
              onClick={e => e.stopPropagation()}
            >
              <ChatPanel
                messages={chatMessages}
                setMessages={setChatMessages}
                isMobile
                onClose={() => setShowChat(false)}
              />
            </div>
          </div>
        )}

        {/* Modals */}
        {showForm && (
          <div style={styles.overlay} onClick={() => setShowForm(false)}>
            <div onClick={e => e.stopPropagation()}>
              <TaskSubmitForm
                onClose={() => setShowForm(false)}
                onCreated={async () => { setShowForm(false); await loadTasks() }}
                projects={projects}
              />
            </div>
          </div>
        )}

        {showSettings && (
          <div style={styles.overlay} onClick={() => setShowSettings(false)}>
            <div onClick={e => e.stopPropagation()}>
              <SettingsPanel onClose={() => setShowSettings(false)} />
            </div>
          </div>
        )}

        {showProfile && currentUser && (
          <div style={styles.overlay} onClick={() => setShowProfile(false)}>
            <div onClick={e => e.stopPropagation()}>
              <ProfilePanel
                user={currentUser}
                onClose={() => setShowProfile(false)}
                onUpdated={(updated) => { setCurrentUser(updated); setShowProfile(false) }}
              />
            </div>
          </div>
        )}
      </div>
  )
}
