import { useState, useEffect, useRef } from 'react'
import { api, ModelsResponse } from '../api/client'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

declare global {
  interface Window {
    SpeechRecognition: new () => any
    webkitSpeechRecognition: new () => any
  }
}

export default function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [backend, setBackend] = useState('anthropic')
  const [model, setModel] = useState('claude-opus-4-6')
  const [models, setModels] = useState<ModelsResponse>({ anthropic: [], openai: [], ollama: [] })
  const [loading, setLoading] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [speechSupported, setSpeechSupported] = useState(false)
  const recognitionRef = useRef<any>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.getModels().then(setModels).catch(() => {})
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    setSpeechSupported(!!SR)
  }, [])

  useEffect(() => {
    const list = models[backend as keyof ModelsResponse] ?? []
    if (list.length > 0) setModel(list[0])
  }, [backend, models])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const modelOptions = models[backend as keyof ModelsResponse] ?? []

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop()
      setIsRecording(false)
      return
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    const recognition = new SR()
    recognition.continuous = true
    recognition.interimResults = false
    recognition.lang = 'en-US'
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .slice(event.resultIndex)
        .map((r: any) => r[0].transcript)
        .join(' ')
      setInput(prev => prev ? prev + ' ' + transcript.trim() : transcript.trim())
    }
    recognition.onerror = () => setIsRecording(false)
    recognition.onend = () => setIsRecording(false)
    recognitionRef.current = recognition
    recognition.start()
    setIsRecording(true)
  }

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || loading) return
    const userMsg: Message = { role: 'user', content: text }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    try {
      const { message } = await api.chat(newMessages, backend, model)
      setMessages(prev => [...prev, { role: 'assistant', content: message }])
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const selectStyle: React.CSSProperties = {
    backgroundColor: '#0f172a',
    border: '1px solid #1e3a5f',
    borderRadius: '5px',
    color: '#e2e8f0',
    padding: '5px 8px',
    fontSize: '12px',
    width: '100%',
    marginBottom: '6px',
  }

  return (
    <div
      style={{
        width: '360px',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        borderLeft: '1px solid rgba(20,50,110,0.7)',
        backgroundColor: 'rgba(8,12,28,0.7)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 14px 10px',
          borderBottom: '1px solid rgba(20,50,110,0.6)',
          flexShrink: 0,
        }}
      >
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#7dd3fc', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          AI Chat
        </div>
        <select style={selectStyle} value={backend} onChange={e => setBackend(e.target.value)}>
          <option value="anthropic">Anthropic</option>
          <option value="openai">OpenAI</option>
          <option value="ollama">Ollama</option>
        </select>
        {backend === 'ollama' && modelOptions.length === 0 ? (
          <input
            style={{ ...selectStyle, marginBottom: 0 }}
            value={model}
            onChange={e => setModel(e.target.value)}
            placeholder="e.g. llama3.2, mistral, gemma3"
          />
        ) : (
          <select
            style={{ ...selectStyle, marginBottom: 0 }}
            value={model}
            onChange={e => setModel(e.target.value)}
            disabled={modelOptions.length === 0}
          >
            {modelOptions.length === 0 && <option value="">No models available</option>}
            {modelOptions.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px' }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#334155', fontSize: '12px', padding: '24px 8px' }}>
            Ask anything — plan projects, research ideas, draft tasks…
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              marginBottom: '10px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <div
              style={{
                maxWidth: '90%',
                padding: '8px 12px',
                borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                backgroundColor: msg.role === 'user' ? '#0f3460' : '#1e293b',
                border: `1px solid ${msg.role === 'user' ? '#1e4d8c' : '#334155'}`,
                color: msg.role === 'user' ? '#7dd3fc' : '#e2e8f0',
                fontSize: '13px',
                lineHeight: '1.5',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {msg.content}
            </div>
            <div style={{ fontSize: '10px', color: '#334155', marginTop: '2px' }}>
              {msg.role === 'user' ? 'You' : model}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '10px' }}>
            <div
              style={{
                padding: '8px 14px',
                borderRadius: '12px 12px 12px 2px',
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                color: '#475569',
                fontSize: '13px',
              }}
            >
              <span style={{ animation: 'pulse 1.2s infinite' }}>Thinking…</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div
        style={{
          padding: '10px 12px',
          borderTop: '1px solid rgba(20,50,110,0.6)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end' }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question… (Enter to send, Shift+Enter for newline)"
            rows={3}
            style={{
              flex: 1,
              backgroundColor: '#0f172a',
              border: '1px solid #1e3a5f',
              borderRadius: '6px',
              color: '#e2e8f0',
              padding: '7px 10px',
              fontSize: '13px',
              resize: 'none',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <button
              onClick={toggleRecording}
              title={speechSupported ? (isRecording ? 'Stop recording' : 'Voice input') : 'Not supported'}
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '6px',
                border: `1px solid ${isRecording ? '#ef4444' : '#334155'}`,
                backgroundColor: isRecording ? '#7f1d1d' : '#1e293b',
                color: isRecording ? '#fca5a5' : '#64748b',
                cursor: speechSupported ? 'pointer' : 'not-allowed',
                fontSize: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                animation: isRecording ? 'micPulse 1s infinite' : undefined,
                flexShrink: 0,
              }}
            >
              🎤
            </button>
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '6px',
                border: '1px solid #1e4d8c',
                backgroundColor: input.trim() && !loading ? '#0f3460' : '#0a1a30',
                color: input.trim() && !loading ? '#7dd3fc' : '#1e3a5f',
                cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
                fontSize: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              ↑
            </button>
            <button
              onClick={() => setMessages([])}
              title="Clear chat"
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '6px',
                border: '1px solid #334155',
                backgroundColor: 'transparent',
                color: '#475569',
                cursor: 'pointer',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              ✕
            </button>
          </div>
        </div>
      </div>
      <style>{`@keyframes micPulse { 0%,100%{opacity:1} 50%{opacity:0.4} } @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>
    </div>
  )
}
