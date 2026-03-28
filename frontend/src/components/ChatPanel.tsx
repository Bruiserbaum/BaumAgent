import { useState, useEffect, useRef } from 'react'
import { api, ModelsResponse, DocumentAttachment } from '../api/client'

interface Message {
  role: 'user' | 'assistant'
  content: string
  images?: string[]   // base64 data URLs (user messages only)
  documents?: { filename: string; content: string }[]  // attached documents (user messages only)
}

interface Props {
  messages: Message[]
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
}

declare global {
  interface Window {
    SpeechRecognition: new () => any
    webkitSpeechRecognition: new () => any
  }
}

const DOC_ACCEPT = '.pdf,.docx,.xlsx,.xls,.csv'

export default function ChatPanel({ messages, setMessages }: Props) {
  const [input, setInput] = useState('')
  const [attachedImages, setAttachedImages] = useState<string[]>([])
  const [attachedDocs, setAttachedDocs] = useState<DocumentAttachment[]>([])
  const [backend, setBackend] = useState('anthropic')
  const [model, setModel] = useState('claude-opus-4-6')
  const [models, setModels] = useState<ModelsResponse>({ anthropic: [], openai: [], ollama: [] })
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [speechSupported, setSpeechSupported] = useState(false)
  const recognitionRef = useRef<any>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.getModels().then(setModels).catch(() => {})
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    setSpeechSupported(!!SR)
    // Load chat-specific defaults from settings
    api.getSettings().then(s => {
      const b = s.chat_backend || s.default_llm_backend || 'anthropic'
      const m = s.chat_model || s.default_llm_model || 'claude-opus-4-6'
      setBackend(b)
      setModel(m)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    const list = models[backend as keyof ModelsResponse] ?? []
    if (list.length > 0 && !list.includes(model)) setModel(list[0])
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

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items)
    const imageItems = items.filter(item => item.type.startsWith('image/'))
    if (imageItems.length === 0) return
    e.preventDefault()
    imageItems.forEach(item => {
      const file = item.getAsFile()
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        setAttachedImages(prev => [...prev, dataUrl])
      }
      reader.readAsDataURL(file)
    })
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setUploading(true)
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        try {
          const doc = await api.uploadDocument(file)
          setAttachedDocs(prev => [...prev, doc])
        } catch (err: any) {
          // Show a brief error for this file
          const errorMsg = err.message || 'Upload failed'
          alert(`Failed to process "${file.name}": ${errorMsg}`)
        }
      }
    } finally {
      setUploading(false)
      // Reset the input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const removeDoc = (index: number) => {
    setAttachedDocs(prev => prev.filter((_, i) => i !== index))
  }

  const sendMessage = async () => {
    const text = input.trim()
    if ((!text && attachedImages.length === 0 && attachedDocs.length === 0) || loading) return
    const userMsg: Message = {
      role: 'user',
      content: text,
      images: attachedImages.length > 0 ? [...attachedImages] : undefined,
      documents: attachedDocs.length > 0 ? attachedDocs.map(d => ({ filename: d.filename, content: d.content })) : undefined,
    }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    const imgs = [...attachedImages]
    const docs = [...attachedDocs]
    setAttachedImages([])
    setAttachedDocs([])
    setLoading(true)
    try {
      // Build API-safe messages (strip images/docs from history, only last msg uses them)
      const apiMessages = newMessages.map(m => ({ role: m.role, content: m.content }))
      const docPayload = docs.length > 0 ? docs.map(d => ({ filename: d.filename, content: d.content })) : undefined
      const { message } = await api.chat(apiMessages, backend, model, imgs.length > 0 ? imgs : undefined, docPayload)
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

  const docIconForExt = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase() || ''
    switch (ext) {
      case 'pdf': return '📕'
      case 'docx': return '📘'
      case 'xlsx': case 'xls': return '📗'
      case 'csv': return '📊'
      default: return '📄'
    }
  }

  return (
    <div
      style={{
        width: 'clamp(320px, 25vw, 520px)',
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
              {/* Attached images */}
              {msg.images && msg.images.length > 0 && (
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: msg.content ? '6px' : 0 }}>
                  {msg.images.map((img, idx) => (
                    <img
                      key={idx}
                      src={img}
                      alt="attached"
                      style={{ maxWidth: '120px', maxHeight: '80px', borderRadius: '4px', border: '1px solid #334155' }}
                    />
                  ))}
                </div>
              )}
              {/* Attached documents */}
              {msg.documents && msg.documents.length > 0 && (
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: msg.content ? '6px' : 0 }}>
                  {msg.documents.map((doc, idx) => (
                    <span
                      key={idx}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        backgroundColor: 'rgba(125,211,252,0.1)',
                        border: '1px solid rgba(125,211,252,0.2)',
                        fontSize: '11px',
                        color: '#7dd3fc',
                      }}
                    >
                      {docIconForExt(doc.filename)} {doc.filename}
                    </span>
                  ))}
                </div>
              )}
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '10px' }}>
            <div
              style={{
                maxWidth: '90%',
                padding: '8px 12px',
                borderRadius: '12px 12px 12px 2px',
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                color: '#94a3b8',
                fontSize: '13px',
              }}
            >
              Thinking…
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div
        style={{
          borderTop: '1px solid rgba(20,50,110,0.6)',
          padding: '10px 12px',
          flexShrink: 0,
        }}
      >
        {/* Attached image previews */}
        {attachedImages.length > 0 && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
            {attachedImages.map((img, idx) => (
              <div key={idx} style={{ position: 'relative' }}>
                <img
                  src={img}
                  alt="preview"
                  style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #334155' }}
                />
                <button
                  onClick={() => setAttachedImages(prev => prev.filter((_, i) => i !== idx))}
                  style={{
                    position: 'absolute',
                    top: '-6px',
                    right: '-6px',
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    border: 'none',
                    backgroundColor: '#ef4444',
                    color: '#fff',
                    fontSize: '10px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Attached document badges */}
        {attachedDocs.length > 0 && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
            {attachedDocs.map((doc, idx) => (
              <div
                key={idx}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(125,211,252,0.1)',
                  border: '1px solid rgba(125,211,252,0.25)',
                  fontSize: '11px',
                  color: '#7dd3fc',
                }}
              >
                {docIconForExt(doc.filename)}
                <span style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {doc.filename}
                </span>
                <span style={{ color: '#475569', fontSize: '10px' }}>
                  ({Math.round(doc.char_count / 1000)}k chars)
                </span>
                <button
                  onClick={() => removeDoc(idx)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#ef4444',
                    cursor: 'pointer',
                    fontSize: '12px',
                    padding: '0 0 0 2px',
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Uploading indicator */}
        {uploading && (
          <div style={{ fontSize: '11px', color: '#7dd3fc', marginBottom: '6px' }}>
            📎 Processing document…
          </div>
        )}

        <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end' }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Type a message… (paste images, attach files)"
            rows={2}
            style={{
              flex: 1,
              backgroundColor: '#0f172a',
              border: '1px solid #1e3a5f',
              borderRadius: '6px',
              color: '#e2e8f0',
              padding: '8px 10px',
              fontSize: '13px',
              resize: 'none',
              fontFamily: 'inherit',
              outline: 'none',
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {/* Attach document button */}
            <input
              ref={fileInputRef}
              type="file"
              accept={DOC_ACCEPT}
              multiple
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={loading || uploading}
              title="Attach document (PDF, Word, Excel, CSV)"
              style={{
                width: '34px',
                height: '30px',
                borderRadius: '6px',
                border: '1px solid #1e3a5f',
                backgroundColor: uploading ? '#1e4d8c' : '#0f172a',
                color: uploading ? '#7dd3fc' : '#7dd3fc',
                cursor: loading || uploading ? 'not-allowed' : 'pointer',
                fontSize: '15px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: loading || uploading ? 0.5 : 1,
              }}
            >
              📎
            </button>
            {/* Voice recording button */}
            {speechSupported && (
              <button
                onClick={toggleRecording}
                disabled={loading}
                title={isRecording ? 'Stop recording' : 'Voice input'}
                style={{
                  width: '34px',
                  height: '30px',
                  borderRadius: '6px',
                  border: `1px solid ${isRecording ? '#ef4444' : '#1e3a5f'}`,
                  backgroundColor: isRecording ? '#7f1d1d' : '#0f172a',
                  color: isRecording ? '#fca5a5' : '#94a3b8',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                🎤
              </button>
            )}
            {/* Send button */}
            <button
              onClick={sendMessage}
              disabled={loading || uploading}
              style={{
                width: '34px',
                height: '30px',
                borderRadius: '6px',
                border: '1px solid #1e4d8c',
                backgroundColor: '#0f3460',
                color: '#7dd3fc',
                cursor: loading || uploading ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: loading || uploading ? 0.5 : 1,
              }}
            >
              ▶
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
