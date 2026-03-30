// Lightweight markdown-to-JSX renderer for Journal chat
// No external dependencies — handles: **bold**, *italic*, `code`, bullet lists, numbered lists

export function renderMarkdown(text) {
  if (!text) return ''
  
  // Split into paragraphs
  const blocks = text.split('\n\n')
  
  return blocks.map((block, bi) => {
    const trimmed = block.trim()
    if (!trimmed) return null
    
    // Check if this block is a list
    const lines = trimmed.split('\n')
    const isBulletList = lines.every(l => /^\s*[-*]\s/.test(l.trim()) || l.trim() === '')
    const isNumberedList = lines.every(l => /^\s*\d+[.)]\s/.test(l.trim()) || l.trim() === '')
    
    if (isBulletList) {
      return { type: 'ul', key: bi, items: lines.filter(l => l.trim()).map(l => l.trim().replace(/^[-*]\s+/, '')) }
    }
    
    if (isNumberedList) {
      return { type: 'ol', key: bi, items: lines.filter(l => l.trim()).map(l => l.trim().replace(/^\d+[.)]\s+/, '')) }
    }
    
    // Regular paragraph — handle inline formatting
    return { type: 'p', key: bi, text: trimmed.replace(/\n/g, ' ') }
  }).filter(Boolean)
}

// Render inline markdown: **bold**, *italic*, `code`
export function renderInline(text) {
  if (!text) return text
  const parts = []
  let remaining = text
  let key = 0
  
  while (remaining.length > 0) {
    // Find the earliest match
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/)
    const italicMatch = remaining.match(/(?<!\*)\*([^*]+?)\*(?!\*)/)
    const codeMatch = remaining.match(/`([^`]+?)`/)
    
    let earliest = null
    let earliestIndex = remaining.length
    let type = null
    
    if (boldMatch && boldMatch.index < earliestIndex) {
      earliest = boldMatch
      earliestIndex = boldMatch.index
      type = 'bold'
    }
    if (codeMatch && codeMatch.index < earliestIndex) {
      earliest = codeMatch
      earliestIndex = codeMatch.index
      type = 'code'
    }
    if (italicMatch && italicMatch.index < earliestIndex && type !== 'bold') {
      earliest = italicMatch
      earliestIndex = italicMatch.index
      type = 'italic'
    }
    
    if (!earliest) {
      parts.push({ type: 'text', content: remaining, key: key++ })
      break
    }
    
    // Add text before the match
    if (earliestIndex > 0) {
      parts.push({ type: 'text', content: remaining.substring(0, earliestIndex), key: key++ })
    }
    
    // Add the formatted element
    parts.push({ type: type, content: earliest[1], key: key++ })
    
    // Continue after the match
    remaining = remaining.substring(earliestIndex + earliest[0].length)
  }
  
  return parts
}
