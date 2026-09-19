const { shortTitle } = require('./study.js')

const SESSION_KEY = 'zhixue_sessions_v2'
const FOLLOW_MARK = '__FOLLOW_UPS__'

function loadAll() {
  try {
    if (typeof wx === 'undefined' || !wx.getStorageSync) return {}
    return wx.getStorageSync(SESSION_KEY) || {}
  } catch (e) {
    return {}
  }
}

function readSession(courseId) {
  if (!courseId) return null
  return loadAll()[String(courseId)] || null
}

function writeSession(courseId, patch) {
  if (!courseId) return null
  const all = loadAll()
  const prev = all[String(courseId)] || {}
  const next = Object.assign({}, prev, patch || {}, { updatedAt: Date.now() })
  all[String(courseId)] = next
  if (typeof wx !== 'undefined' && wx.setStorageSync) {
    wx.setStorageSync(SESSION_KEY, all)
  }
  return next
}

function normalizeStep(item, index) {
  const title = String((item && (item.title || item.name || item.环节 || item.标题)) || '').trim()
  const goal = String((item && (item.goal || item.aim || item.目标 || item.description || item.desc)) || '').trim()
  if (!title) return null
  return {
    key: 'guide-' + index + '-' + title,
    title: title,
    shortTitle: shortTitle(title, 4),
    goal: goal,
    detail: goal,
    group: '智学环节',
    kind: 'guide'
  }
}

function parseJsonSteps(text) {
  const raw = String(text || '').trim()
  if (!raw) return []
  let blob = raw
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) blob = fence[1]
  const start = blob.indexOf('[')
  const end = blob.lastIndexOf(']')
  if (start < 0 || end <= start) return []
  let data
  try {
    data = JSON.parse(blob.slice(start, end + 1))
  } catch (e) {
    try {
      data = JSON.parse(blob.slice(start, end + 1).replace(/,\s*]/g, ']'))
    } catch (e2) {
      return []
    }
  }
  if (!Array.isArray(data)) return []
  return data.map(normalizeStep).filter(Boolean)
}

function cleanTitle(text) {
  return String(text || '')
    .replace(/[*_`#]+/g, '')
    .replace(/^\s*[\d一二三四五六七八九十]+[\.、．\)]\s*/, '')
    .replace(/^第\s*\d+\s*[节步环节章]\s*[:：]?\s*/, '')
    .trim()
}

function parseListedSteps(text) {
  const fromJson = parseJsonSteps(text)
  if (fromJson.length >= 2) return fromJson
  const lines = String(text || '').split(/\n/)
  const steps = []
  const seen = {}
  const numbered = /^\s*(?:(?:\d{1,2}|[一二三四五六七八九十]+)[\.、．\)]|（\d{1,2}）|\(\d{1,2}\)|第\s*\d{1,2}\s*[节步环节章]|环节\s*\d{1,2})\s*[:：.\s]?\s*(.+)\s*$/
  const heading = /^\s{0,3}#{2,3}\s+(.+)\s*$/
  lines.forEach((line) => {
    const match = line.match(numbered) || line.match(heading)
    if (!match) return
    const title = cleanTitle(match[1])
    if (!title || title.length > 36 || seen[title]) return
    seen[title] = true
    const step = normalizeStep({ title: title }, steps.length)
    if (step) steps.push(step)
  })
  return steps
}

function mergeSteps(current, incoming) {
  const have = current || []
  const extra = incoming || []
  if (!have.length) return extra
  if (!extra.length) return have
  const seen = {}
  have.forEach((item) => { seen[item.title] = true })
  const next = have.slice()
  extra.forEach((item) => {
    if (!item || !item.title || seen[item.title]) return
    seen[item.title] = true
    next.push(normalizeStep(item, next.length))
  })
  return next
}

function startPrompt(course) {
  const title = (course && course.title) || '这门课'
  const category = course && course.category_id && course.category_id.name
  const desc = (course && course.description) || ''
  const lines = ['开始学习《' + title + '》' + (category ? '（' + category + '）' : '')]
  if (desc) lines.push(desc)
  return lines.join('\n')
}

function visibleMessages(messages) {
  return (messages || []).filter((item) => !item.hidden)
}

function hasAssistant(messages) {
  return (messages || []).some((item) => item.role === 'assistant' && !item.hidden && !item.failed)
}

function stripFollowUps(reply) {
  const text = String(reply || '')
  const idx = text.indexOf(FOLLOW_MARK)
  if (idx < 0) return { reply: text, followUps: [] }
  let followUps = []
  try {
    const parsed = JSON.parse(text.slice(idx + FOLLOW_MARK.length))
    if (Array.isArray(parsed)) followUps = parsed.filter((item) => typeof item === 'string' && item.trim())
  } catch (e) {}
  return { reply: text.slice(0, idx).trim(), followUps: followUps }
}

module.exports = {
  FOLLOW_MARK: FOLLOW_MARK,
  readSession: readSession,
  writeSession: writeSession,
  normalizeStep: normalizeStep,
  parseListedSteps: parseListedSteps,
  mergeSteps: mergeSteps,
  startPrompt: startPrompt,
  visibleMessages: visibleMessages,
  hasAssistant: hasAssistant,
  stripFollowUps: stripFollowUps
}
