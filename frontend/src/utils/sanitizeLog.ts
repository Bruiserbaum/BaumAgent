/**
 * Detects HTML fragments inside agent log text and converts them to readable
 * plain text so the Agent Log terminal stays clean.
 *
 * Strategy:
 *  1. Walk the log string looking for regions that look like HTML (sequences of
 *     tags such as `<!DOCTYPE`, `<html`, `<head`, `<body`, `<div`, `<p`, etc.).
 *  2. When an HTML region is found, pass it through a lightweight tag stripper
 *     that extracts meaningful text content, collapses whitespace, and inserts
 *     line breaks where block-level elements appear.
 *  3. Non-HTML portions of the log are returned unchanged.
 *
 * This runs entirely in the browser — no extra dependencies required.
 */

/** Tags that should produce a line break when encountered. */
const BLOCK_TAGS = new Set([
  'p', 'div', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'li', 'tr', 'dt', 'dd', 'blockquote', 'pre', 'section', 'article',
  'header', 'footer', 'nav', 'main', 'aside', 'table', 'thead', 'tbody',
  'tfoot', 'ul', 'ol', 'dl', 'figcaption', 'figure', 'details', 'summary',
])

/**
 * Heuristic: does this chunk of text look like it contains HTML markup?
 * We look for a DOCTYPE declaration, or multiple HTML-style tags.
 */
function looksLikeHtml(text: string): boolean {
  // Quick check: contains DOCTYPE or <html
  if (/<!doctype\s+html/i.test(text)) return true
  if (/<html[\s>]/i.test(text)) return true

  // Count HTML-like opening tags — if we see several, treat as HTML
  const tagMatches = text.match(/<[a-z][a-z0-9]*[\s>/]/gi)
  return (tagMatches?.length ?? 0) >= 3
}

/**
 * Convert an HTML string into readable plain text.
 * Uses the browser's DOMParser for accurate parsing.
 */
function htmlToPlainText(html: string): string {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')

    // Remove script and style elements entirely
    doc.querySelectorAll('script, style, link, meta, noscript').forEach(el => el.remove())

    // Recursive walker
    const lines: string[] = []

    function walk(node: Node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = (node.textContent ?? '').replace(/[ \t]+/g, ' ')
        if (t.trim()) lines.push(t.trim())
        return
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return
      const el = node as Element
      const tag = el.tagName.toLowerCase()

      // Skip hidden elements
      if (tag === 'script' || tag === 'style') return

      // Add a line break before block-level elements
      if (BLOCK_TAGS.has(tag)) {
        lines.push('\n')
      }

      // Special handling for list items
      if (tag === 'li') {
        lines.push('  • ')
      }

      // Table cells get a tab separator
      if (tag === 'td' || tag === 'th') {
        lines.push('\t')
      }

      for (const child of Array.from(node.childNodes)) {
        walk(child)
      }

      // Line break after block elements
      if (BLOCK_TAGS.has(tag)) {
        lines.push('\n')
      }
    }

    walk(doc.body)

    // Collapse multiple newlines and trim
    return lines
      .join('')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+\n/g, '\n')
      .trim()
  } catch {
    // If DOMParser fails for any reason, fall back to regex-based stripping
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?(p|div|h[1-6]|li|tr|hr|blockquote|pre|section)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }
}

/**
 * Split the log into HTML and non-HTML regions, converting HTML regions to
 * readable plain text. Non-HTML text passes through unchanged.
 *
 * We identify HTML regions by looking for patterns like:
 *   - A DOCTYPE declaration through to `</html>`
 *   - An `<html` opening through to `</html>`
 *   - Large blocks of dense tags (fallback)
 */
export function sanitizeLog(rawLog: string): string {
  if (!rawLog) return rawLog

  // Fast path — no angle brackets means no HTML
  if (!rawLog.includes('<')) return rawLog

  // Try to find full HTML documents embedded in the log
  // Pattern: match from <!DOCTYPE or <html to </html>
  const htmlDocPattern = /(<!doctype\s+html[\s\S]*?<\/html\s*>)/gi
  const htmlTagPattern = /(<html[\s\S]*?<\/html\s*>)/gi

  let result = rawLog

  // Replace full HTML document blocks
  result = result.replace(htmlDocPattern, (match) => {
    const converted = htmlToPlainText(match)
    return `\n--- [HTML content converted to text] ---\n${converted}\n--- [end of converted HTML] ---\n`
  })

  // Replace <html>...</html> blocks that didn't have DOCTYPE
  result = result.replace(htmlTagPattern, (match) => {
    const converted = htmlToPlainText(match)
    return `\n--- [HTML content converted to text] ---\n${converted}\n--- [end of converted HTML] ---\n`
  })

  // If no full document was found but there are still dense HTML fragments,
  // try to detect and convert them. We look for sections that have many tags
  // within a relatively short span.
  if (result === rawLog && looksLikeHtml(rawLog)) {
    // The entire log looks like HTML — convert the whole thing
    const converted = htmlToPlainText(rawLog)
    return `--- [HTML content converted to text] ---\n${converted}\n--- [end of converted HTML] ---`
  }

  return result
}

export default sanitizeLog
