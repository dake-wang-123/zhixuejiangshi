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

const BODY = 'font-size:16px;line-height:1.8;color:#333333;word-break:break-all;'
const HEAD = 'font-size:17px;font-weight:700;line-height:1.7;color:#333333;word-break:break-all;'
const MARK = 'font-weight:700;color:#2C3D8F;'
const CODE = 'font-size:14px;background:#F3F4F6;padding:0 6px;border-radius:4px;color:#4B6EF5;'
const INDEX = 'color:#4B6EF5;font-weight:700;margin-right:8px;'

const TITLE_KIND = {
  '核心逻辑': 'heading',
  '本步目标': 'heading',
  '关键要点': 'heading',
  '操作步骤': 'heading',
  '注意事项': 'heading',
  '场景说明': 'heading',
  '场景话术': 'script',
  '示范话术': 'script',
  '重点话术': 'script',
  '可以这样说': 'script',
  '家长话术': 'script',
  '下一步提问': 'ask',
  '引导问题': 'ask',
  '本轮问题': 'ask',
  '现在请你': 'ask',
  '请你回答': 'ask'
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
      out.push(el('strong', MARK, [textNode(token.slice(2, -2))]))
    } else {
      out.push(el('code', CODE, [textNode(token.slice(1, -1))]))
    }
    last = match.index + token.length
  }
  if (last < s.length) out.push(textNode(s.slice(last)))
  if (!out.length) out.push(textNode(''))
  return out
}

function titleKind(line) {
  const raw = String(line || '').replace(/^#{1,3}\s+/, '').replace(/[*`]/g, '').replace(/[:：]\s*$/, '').trim()
  return TITLE_KIND[raw] || ''
}

function titleLabel(line) {
  return String(line || '').replace(/^#{1,3}\s+/, '').replace(/[*`]/g, '').replace(/[:：]\s*$/, '').trim()
}

function looksStructured(src) {
  return /^(#{1,3}\s+|[-*]\s+|\d+[\.、．\)]\s+|>\s+)/m.test(src) || /\*\*[^*]+\*\*/.test(src)
}

function splitSentences(text) {
  const src = String(text || '').replace(/\s+/g, ' ').trim()
  if (!src) return []
  const out = []
  let buf = ''
  for (let i = 0; i < src.length; i++) {
    const ch = src.charAt(i)
    buf += ch
    if ('。！？；'.indexOf(ch) >= 0) {
      const piece = buf.trim()
      if (piece) out.push(piece)
      buf = ''
    }
  }
  if (buf.trim()) out.push(buf.trim())
  return out
}

function splitLong(text, limit) {
  const max = limit || 72
  const src = String(text || '').trim()
  if (!src) return []
  const parts = splitSentences(src)
  if (parts.length <= 1) return [src]
  const chunks = []
  let buf = ''
  parts.forEach((part) => {
    if (!buf) {
      buf = part
      return
    }
    const grow = buf + part
    if (grow.length > max || (buf.length >= 24 && part.length >= 12)) {
      chunks.push(buf)
      buf = part
      return
    }
    buf = grow
  })
  if (buf) chunks.push(buf)
  return chunks
}

function explodeLine(line) {
  const raw = String(line || '').replace(/^\s+/, '')
  if (!raw) return ['']
  if (/^\d+[\.、．\)]\s*.+\s+\d+[\.、．\)]/.test(raw)) {
    return raw.replace(/\s+(?=\d+[\.、．\)])/g, '\n').split('\n')
  }
  if (/^[-*]\s*.+\s+[-*]\s+/.test(raw)) {
    return raw.replace(/\s+(?=[-*]\s+)/g, '\n').split('\n')
  }
  return [raw]
}

function prepareSource(src) {
  let text = String(src || '').replace(/\r\n/g, '\n').replace(/\u3000/g, ' ').trim()
  if (!text) return ''
  const lines = []
  String(text).split('\n').forEach((line) => {
    explodeLine(line).forEach((piece) => lines.push(piece))
  })
  if (!looksStructured(text) && lines.length <= 2 && (text.length > 48 || splitSentences(text).length >= 2)) {
    return splitLong(text, 64).join('\n\n')
  }
  return lines.join('\n')
}

function makeBlock(kind, text, nodes, extra) {
  const block = Object.assign({
    id: '',
    kind: kind,
    kicker: '',
    text: String(text || ''),
    nodes: nodes || []
  }, extra || {})
  return block
}

function listNodes(items, ordered) {
  return items.map((item, index) => {
    const mark = ordered ? String(index + 1) + '.' : '·'
    return el('div', BODY + 'margin:0 0 8px;', [el('span', INDEX, [textNode(mark + ' ')])].concat(inlineNodes(item)))
  })
}

function toBlocks(src) {
  const lines = prepareSource(src).split('\n')
  const blocks = []
  let listItems = []
  let listOrdered = false
  let section = 'para'

  function flushList() {
    if (!listItems.length) return
    const kind = section === 'ask' ? 'ask' : (section === 'script' ? 'script' : 'list')
    const text = listItems.join('\n')
    const kicker = kind === 'ask' ? '下一步提问' : (kind === 'script' ? '重点话术' : '')
    blocks.push(makeBlock(kind, text, listNodes(listItems, listOrdered), { kicker: kicker }))
    listItems = []
  }

  function pushParas(kind, raw, kicker) {
    splitLong(raw, 72).forEach((piece) => {
      blocks.push(makeBlock(kind, piece, [el('div', BODY, inlineNodes(piece))], { kicker: kicker || '' }))
    })
  }

  lines.forEach((line) => {
    const trimmed = String(line || '').replace(/^\s+/, '')
    if (!trimmed || trimmed === '---' || trimmed === '***') {
      flushList()
      return
    }
    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      flushList()
      const label = titleLabel(heading[2])
      const kind = titleKind(heading[2]) || 'heading'
      section = kind === 'heading' ? 'para' : kind
      blocks.push(makeBlock('heading', label, [el('div', HEAD, inlineNodes(label))], {
        kicker: kind === 'ask' ? '下一步提问' : (kind === 'script' ? '重点话术' : '')
      }))
      return
    }
    const alias = titleKind(trimmed)
    if (alias && trimmed.replace(/[*`]/g, '').length <= 12) {
      flushList()
      const label = titleLabel(trimmed)
      section = alias === 'heading' ? 'para' : alias
      blocks.push(makeBlock('heading', label, [el('div', HEAD, inlineNodes(label))], {
        kicker: alias === 'ask' ? '下一步提问' : (alias === 'script' ? '重点话术' : '')
      }))
      return
    }
    const quote = trimmed.match(/^>\s?(.*)$/)
    if (quote) {
      flushList()
      const kind = section === 'ask' ? 'ask' : 'script'
      pushParas(kind, quote[1], kind === 'ask' ? '下一步提问' : '重点话术')
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
    const kind = section === 'ask' ? 'ask' : (section === 'script' ? 'script' : 'para')
    const kicker = kind === 'ask' ? '下一步提问' : (kind === 'script' ? '重点话术' : '')
    pushParas(kind, trimmed, kicker)
  })
  flushList()

  if (!blocks.length) {
    pushParas('para', String(src || ''), '')
  }

  const last = blocks[blocks.length - 1]
  if (last && last.kind === 'para' && /[？?]$/.test(last.text) && last.text.length <= 80) {
    last.kind = 'ask'
    last.kicker = '下一步提问'
  }

  blocks.forEach((block, index) => {
    block.id = 'b' + index
  })
  return blocks
}

function toNodes(src) {
  const nodes = []
  toBlocks(src).forEach((block) => {
    ;(block.nodes || []).forEach((node) => nodes.push(node))
  })
  if (!nodes.length) {
    nodes.push(el('div', BODY, inlineNodes(src)))
  }
  return nodes
}

function decorateThread(messages) {
  return (messages || []).filter((item) => !item.hidden).map((item) => {
    const next = Object.assign({}, item)
    if (item.role === 'assistant') {
      next.blocks = toBlocks(item.content)
      next.nodes = toNodes(item.content)
    }
    return next
  })
}

module.exports = {
  toNodes: toNodes,
  toBlocks: toBlocks,
  decorateThread: decorateThread,
  prepareSource: prepareSource,
  splitLong: splitLong
}
