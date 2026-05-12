import { useMemo, forwardRef } from 'react'
import { sanitizeLog } from '../utils/sanitizeLog'

interface LogTerminalProps {
  log: string
  fallbackMessage?: string
  style?: React.CSSProperties
}

/**
 * LogTerminal renders agent log text in a terminal-style container.
 * Any embedded HTML (e.g. from server error responses returning HTML
 * pages instead of JSON) is automatically detected and converted to
 * clean readable plain text.
 */
const LogTerminal = forwardRef<HTMLDivElement, LogTerminalProps>(
  ({ log, fallbackMessage, style }, ref) => {
    const displayLog = useMemo(() => sanitizeLog(log), [log])

    return (
      <div ref={ref} style={style}>
        {displayLog || fallbackMessage || 'Waiting for log output…'}
      </div>
    )
  }
)

LogTerminal.displayName = 'LogTerminal'

export default LogTerminal
