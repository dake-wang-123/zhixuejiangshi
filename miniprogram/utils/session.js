const {
  FLOW_VERSION,
  OPEN_SESSION_ID,
  firstLiveIndex,
  inferProgress,
  paintStepViews
} = require('./flow.js')
const { lessonCodeOf } = require('./learn-history.js')

const SESSION_KEY = 'zhixue_sessions_v10'
const FOLLOW_MARK = '__FOLLOW_UPS__'

function conversationScope(opts) {
  const lesson = String((opts && (opts.lessonCode || opts.lesson_code)) || '').trim()
  const title = String((opts && (opts.title || opts.topicTitle || opts.displayTitle)) || '').trim()
  if (lesson) return 'lesson:' + lesson
  if (title) return 'topic:' + title
  return OPEN_SESSION_ID
}

function stableUserId(account, scope) {
  const uid = (account && (account.id || account.userId)) || 'guest'
  const safe = String(scope || OPEN_SESSION_ID).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40)
  return ('learn-' + uid + '-' + safe).slice(0, 64)
}

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

function blankProgress() {
  return {
    currentStep: 1,
    completedSteps: [],
    exam1Done: false,
    exam2Done: false,
    finished: false,
    viewingStep: 0
  }
}

function blankSession(topicTitle) {
  return Object.assign({
    flowVersion: FLOW_VERSION,
    steps: paintStepViews({ currentStep: 1, completedSteps: [] }),
    messages: [],
    followUps: [],
    completedCount: firstLiveIndex(),
    currentIndex: firstLiveIndex(),
    conversationId: '',
    chatId: '',
    topicTitle: topicTitle || '',
    source: 'catalog',
    planText: ''
  }, blankProgress())
}

function ensureFlowSession(courseId, topicTitle) {
  const existing = readSession(courseId)
  if (existing && existing.flowVersion === FLOW_VERSION) {
    if (topicTitle && existing.topicTitle && existing.topicTitle !== topicTitle && !(existing.messages || []).length) {
      return writeSession(courseId, blankSession(topicTitle))
    }
    return existing
  }
  if (existing && (existing.messages || []).length) {
    const inferred = inferProgress(existing.messages)
    return writeSession(courseId, Object.assign({
      flowVersion: FLOW_VERSION,
      topicTitle: topicTitle || existing.topicTitle || '',
      conversationId: existing.conversationId || '',
      chatId: existing.chatId || '',
      messages: existing.messages,
      followUps: existing.followUps || [],
      steps: paintStepViews(inferred)
    }, inferred, {
      viewingStep: 0
    }))
  }
  return writeSession(courseId, blankSession(topicTitle))
}

function hydrateSession(courseId, remote, topicTitle) {
  const local = readSession(courseId) || blankSession(topicTitle)
  const remoteMessages = (remote && remote.messages) || []
  const localMessages = local.messages || []
  const messages = remoteMessages.length >= localMessages.length ? remoteMessages : localMessages
  const conversationId = (remote && remote.conversationId) || local.conversationId || ''
  const chatId = (remote && remote.chatId) || local.chatId || ''
  const title = topicTitle || (remote && remote.topicTitle) || local.topicTitle || ''
  const inferred = inferProgress(messages)
  const localDone = (local.completedSteps || []).length
  const progress = localDone >= inferred.completedSteps.length
    ? {
      currentStep: local.currentStep || inferred.currentStep,
      completedSteps: local.completedSteps || inferred.completedSteps,
      exam1Done: !!(local.exam1Done || inferred.exam1Done),
      exam2Done: !!(local.exam2Done || inferred.exam2Done),
      finished: (local.completedSteps || inferred.completedSteps).length >= 10
    }
    : inferred
  return writeSession(courseId, Object.assign({
    flowVersion: FLOW_VERSION,
    messages: messages,
    followUps: (local.followUps || []).length ? local.followUps : ((remote && remote.followUps) || []),
    conversationId: conversationId,
    chatId: chatId,
    topicTitle: title,
    source: local.source || 'catalog',
    planText: local.planText || '',
    completedCount: progress.completedSteps.length,
    currentIndex: Math.max(0, (progress.currentStep || 1) - 1),
    steps: paintStepViews(progress),
    viewingStep: 0
  }, progress))
}

function storedLessonCode(page) {
  if (page && typeof page.lessonCode === 'function') return lessonCodeOf(page.lessonCode())
  const data = (page && page.data) || {}
  return lessonCodeOf(data.lessonCode || (data.course && data.course.lessonCode), conversationScope({
    lessonCode: data.lessonCode,
    title: data.course && (data.course.title || data.displayTitle)
  }))
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
  conversationScope: conversationScope,
  stableUserId: stableUserId,
  readSession: readSession,
  writeSession: writeSession,
  blankSession: blankSession,
  ensureFlowSession: ensureFlowSession,
  hydrateSession: hydrateSession,
  storedLessonCode: storedLessonCode,
  visibleMessages: visibleMessages,
  hasAssistant: hasAssistant,
  stripFollowUps: stripFollowUps
}
