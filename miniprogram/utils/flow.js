const { shortTitle } = require('./study.js')
const { matchCanonical } = require('./coze-catalog.js')

const FLOW_VERSION = 9
const OPEN_SESSION_ID = 'open'
const PENDING_TOPIC_KEY = 'zhixue_pending_topic'
const PENDING_LESSON_KEY = 'zhixue_pending_lesson'
const TOPIC_DRAFT_KEY = 'zhixue_topic_draft'
const OPEN_GUIDE_PROMPT = '你好'

function normalizeStep(item, index) {
  const title = String((item && (item.title || item.name || item.环节 || item.标题)) || '').trim()
  const goal = String((item && (item.goal || item.aim || item.目标 || item.description || item.desc)) || '').trim()
  if (!title) return null
  return {
    key: 'coze-' + index + '-' + title,
    mark: String(index + 1),
    title: title,
    shortTitle: shortTitle(title, 4),
    goal: goal,
    detail: goal,
    group: (item && (item.group || item.模块)) || '智学环节',
    kind: 'guide',
    index: index
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
    return []
  }
  if (!Array.isArray(data)) return []
  return data.map(normalizeStep).filter(Boolean)
}

function cleanStepTitle(text) {
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
  const numbered = /^\s*(?:(?:\d{1,2}|[一二三四五六七八九十]+)[\.、．\)]|（\d{1,2}）|\(\d{1,2}\)|第\s*\d{1,2}\s*[节步环节章]|环节\s*\d{1,2}|模块\s*[一二三四五六七八九十\d]+)\s*[:：.\s]?\s*(.+)\s*$/
  lines.forEach((line) => {
    const match = line.match(numbered)
    if (!match) return
    const title = cleanStepTitle(match[1])
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

function listFlowSteps() {
  return []
}

function firstLiveIndex() {
  return 0
}

function topicTitleOf(course, fallback) {
  const hit = matchCanonical(
    course && course.title,
    course && course.displayTitle,
    fallback
  )
  if (hit) return hit.title
  return String((course && (course.displayTitle || course.title)) || fallback || '').trim()
}

function startPrompt(course, fallback) {
  return topicTitleOf(course, fallback)
}

function detectAdvance(text, steps, completedCount) {
  const list = steps || []
  const current = Math.max(0, Number(completedCount) || 0)
  const next = list[current + 1]
  if (!next || !next.title) return current
  if (String(text || '').indexOf(next.title) >= 0) return current + 1
  return current
}

module.exports = {
  FLOW_VERSION: FLOW_VERSION,
  OPEN_SESSION_ID: OPEN_SESSION_ID,
  PENDING_TOPIC_KEY: PENDING_TOPIC_KEY,
  PENDING_LESSON_KEY: PENDING_LESSON_KEY,
  TOPIC_DRAFT_KEY: TOPIC_DRAFT_KEY,
  OPEN_GUIDE_PROMPT: OPEN_GUIDE_PROMPT,
  parseListedSteps: parseListedSteps,
  mergeSteps: mergeSteps,
  listFlowSteps: listFlowSteps,
  firstLiveIndex: firstLiveIndex,
  topicTitleOf: topicTitleOf,
  startPrompt: startPrompt,
  detectAdvance: detectAdvance
}
