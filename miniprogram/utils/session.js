const {
  FLOW_VERSION,
  OPEN_SESSION_ID,
  firstLiveIndex
} = require('./flow.js')

const SESSION_KEY = 'zhixue_sessions_v9'
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

function blankSession(topicTitle) {
  return {
    flowVersion: FLOW_VERSION,
    steps: [],
    messages: [],
    followUps: [],
    completedCount: firstLiveIndex(),
    currentIndex: firstLiveIndex(),
    conversationId: '',
    chatId: '',
    topicTitle: topicTitle || ''
  }
}

function ensureFlowSession(courseId, topicTitle) {
  const existing = readSession(courseId)
  if (existing && existing.flowVersion === FLOW_VERSION) {
    if (topicTitle && existing.topicTitle && existing.topicTitle !== topicTitle) {
      return writeSession(courseId, blankSession(topicTitle))
    }
    return existing
  }
  return writeSession(courseId, blankSession(topicTitle))
}

function visibleMessages(messages) {
  return (messages || []).filter((item) => !item.hidden)
}

function hasAssistant(messages, stageIndex) {
  return (messages || []).some((item) => {
    if (item.role !== 'assistant' || item.hidden || item.failed) return false
    return true
  })
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
  OPEN_SESSION_ID: OPEN_SESSION_ID,
  FLOW_VERSION: FLOW_VERSION,
  SESSION_KEY: SESSION_KEY,
  readSession: readSession,
  writeSession: writeSession,
  blankSession: blankSession,
  ensureFlowSession: ensureFlowSession,
  visibleMessages: visibleMessages,
  hasAssistant: hasAssistant,
  stripFollowUps: stripFollowUps
}
