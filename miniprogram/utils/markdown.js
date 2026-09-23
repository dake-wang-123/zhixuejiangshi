function textNode(text) {
  return { type: 'text', text: String(text || '') }
}

function el(name, style, children) {
  return {
    name: name,
    attrs: { style: style },
    children: children || []
  }
}

function inlineNodes(raw) {
  const s = String(raw || '')
  const out = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let last = 0
  let match
  while ((match = re.exec(s))) {
    if (match.index > last) out.push(textNode(s.slice(last, match.index)))
    const token = match[0]
    if (token.charAt(0) === '*') {
      out.push(el('strong', 'font-weight:700;color:#333333;', [textNode(token.slice(2, -2))]))
    } else {
      out.push(el('code', 'font-size:14px;background:#F3F4F6;padding:0 6px;border-radius:4px;color:#4B6EF5;', [textNode(token.slice(1, -1))]))
    }
    last = match.index + token.length
  }
  if (last < s.length) out.push(textNode(s.slice(last)))
  if (!out.length) out.push(textNode(''))
  return out
}

function toNodes(src) {
  const lines = String(src || '').replace(/\r\n/g, '\n').split('\n')
  const nodes = []
  let listItems = []
  let listOrdered = false

  function flushList() {
    if (!listItems.length) return
    const tag = listOrdered ? 'ol' : 'ul'
    nodes.push(el(
      tag,
      'margin:0 0 16px;padding-left:22px;font-size:16px;line-height:1.7;color:#333333;',
      listItems.map((item) => el('li', 'margin:0 0 8px;', inlineNodes(item)))
    ))
    listItems = []
  }

  lines.forEach((line) => {
    const trimmed = String(line || '').replace(/^\s+/, '')
    if (!trimmed) {
      flushList()
      return
    }
    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      flushList()
      const level = heading[1].length
      const size = level === 1 ? '20px' : (level === 2 ? '18px' : '16px')
      nodes.push(el('div', 'margin:0 0 16px;font-size:' + size + ';font-weight:700;line-height:1.6;color:#333333;', inlineNodes(heading[2])))
      return
    }
    const quote = trimmed.match(/^>\s?(.*)$/)
    if (quote) {
      flushList()
      nodes.push(el('div', 'margin:0 0 16px;padding:4px 0 4px 12px;border-left:3px solid #4B6EF5;color:#666666;font-size:16px;line-height:1.7;', inlineNodes(quote[1])))
      return
    }
    const ul = trimmed.match(/^[-*]\s+(.+)$/)
    if (ul) {
      if (listItems.length && listOrdered) flushList()
      listOrdered = false
      listItems.push(ul[1])
      return
    }
    const ol = trimmed.match(/^\d+[\.、．\)]\s+(.+)$/)
    if (ol) {
      if (listItems.length && !listOrdered) flushList()
      listOrdered = true
      listItems.push(ol[1])
      return
    }
    flushList()
    nodes.push(el('div', 'margin:0 0 16px;font-size:16px;line-height:1.7;color:#333333;word-break:break-word;white-space:pre-wrap;', inlineNodes(trimmed)))
  })
  flushList()
  if (!nodes.length) {
    nodes.push(el('div', 'margin:0;font-size:16px;line-height:1.7;color:#333333;white-space:pre-wrap;', inlineNodes(src)))
  }
  return nodes
}

function decorateThread(messages) {
  return (messages || []).filter((item) => !item.hidden).map((item) => {
    const next = Object.assign({}, item)
    if (item.role === 'assistant') next.nodes = toNodes(item.content)
    return next
  })
}

module.exports = {
  toNodes: toNodes,
  decorateThread: decorateThread
}
