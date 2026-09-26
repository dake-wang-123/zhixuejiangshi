const { chatWithCoze } = require('./agent.js')
const {
  readSession,
  writeSession,
  blankSession,
  hasAssistant,
  hydrateSession,
  storedLessonCode
} = require('./session.js')
const {
  startPrompt,
  topicTitleOf,
  detectProgress,
  applyProgress,
  inferProgress,
  paintStepViews,
  packTurn,
  rawUserMessage,
  extractCurrentStep,
  stepMeta,
  stripGateMarkers
} = require('./flow.js')
const isolation = require('./isolation.js')
const history = require('./learn-history.js')
const results = require('./learn-results.js')
const typewriter = require('./typewriter.js')
const { decorateThread } = require('./markdown.js')
const { shortUserText, sourceOf } = require('./personal-plan.js')

const THINK_HINTS = [
  '智学正在翻这一课的教案…',
  '正在组织这一步的讲解…',
  '马上把引导问题发给你…'
]

function markAnchors(thread) {
  const seen = {}
  return (thread || []).map((item) => {
    const next = Object.assign({}, item)
    const step = Number(item.step) || 0
    if (step && !seen[step]) {
      seen[step] = true
      next.anchor = 's-' + step
    }
    return next
  })
}

function progressOf(session) {
  return inferProgress((session && session.messages) || [])
}

function paintProgress(page, session) {
  const progress = progressOf(session)
  const steps = paintStepViews(progress)
  const current = progress.currentStep || 1
  const meta = stepMeta(current)
  page.setData({
    steps: steps,
    currentStep: current,
    currentIndex: Math.max(0, current - 1),
    completedCount: (progress.completedSteps || []).length,
    finished: !!(progress.finished || (progress.completedSteps || []).length >= 10),
    exam1Done: !!progress.exam1Done,
    exam2Done: !!progress.exam2Done,
    exam2Ready: !!progress.exam2Done,
    currentPhase: progress.currentPhase || 'learning',
    inspectionStep: progress.inspectionStep || 0,
    inspectWait: progress.inspectWait || '',
    allClear: !!progress.exam2Done,
    viewingStep: (session && session.viewingStep) || 0,
    viewingTitle: (session && session.viewingStep) ? stepMeta(session.viewingStep).title : '',
    currentLabel: progress.finished && current >= 11
      ? meta.title
      : ('第' + Math.min(10, current) + '步 · ' + (current <= 10 ? meta.title : '检验'))
  })
  return progress
}

function abortTurn(page) {
  isolation.nextTurnId(page)
  page._busy = false
  stopLive(page)
  if (typeof page.setData === 'function') {
    page.setData({ sending: false, thinking: false })
  }
}

function applyLesson(page, incoming) {
  const title = String((incoming && (incoming.title || incoming.displayTitle || incoming.topicTitle)) || '').trim()
  const lessonCode = String((incoming && (incoming.lessonCode || incoming.lesson_code)) || '').trim()
  const source = (incoming && incoming.source) || sourceOf(incoming, lessonCode)
  const course = {
    title: title,
    displayTitle: title,
    lessonCode: lessonCode,
    source: source,
    planText: (incoming && (incoming.planText || incoming.text)) || ''
  }
  const patch = {
    course: course,
    displayTitle: title || '智学伴练',
    lessonCode: lessonCode,
    thread: [],
    followUps: [],
    conversationId: '',
    currentStep: 1,
    currentIndex: 0,
    completedCount: 0,
    finished: false,
    exam1Done: false,
    exam2Done: false,
    exam2Ready: false,
    currentPhase: 'learning',
    inspectionStep: 0,
    inspectWait: '',
    allClear: false,
    viewingStep: 0,
    viewingTitle: '',
    error: '',
    sending: false,
    thinking: false,
    planning: true,
    steps: paintStepViews({ currentStep: 1, completedSteps: [] }),
    currentLabel: '第1步 · 自我介绍',
    hint: lessonCode ? ('正在进入 ' + lessonCode) : '正在进入课题'
  }
  Object.assign(page.data, patch)
  page.setData(patch)
  if (typeof page.sessionKey === 'function') {
    writeSession(page.sessionKey(), Object.assign(blankSession(title), {
      source: source,
      planText: course.planText || '',
      conversationId: '',
      chatId: '',
      localSlotKey: isolation.localSlotKey(
        (typeof getApp === 'function' && getApp().globalData && getApp().globalData.account) || {},
        lessonCode
      )
    }))
  }
  return course
}

function paint(page, session) {
  typewriter.stop(page)
  const visible = ((session && session.messages) || []).filter((item) => !item.hidden).map((item) => {
    if (item.role !== 'assistant') return item
    return Object.assign({}, item, { content: stripGateMarkers(item.content) })
  })
  const thread = markAnchors(decorateThread(visible)).map((item) => {
    if (item.role !== 'user') return item
    const next = Object.assign({}, item)
    next.content = rawUserMessage(item.content)
    next.preview = shortUserText(next.content)
    return next
  })
  const topic = (session && session.topicTitle) || ''
  const progress = paintProgress(page, session)
  page.setData({
    conversationId: (session && session.conversationId) || '',
    thread: thread,
    followUps: (session && session.followUps) || [],
    thinking: false,
    hint: topic ? ('课题：' + topic) : '按十步交付法往下走'
  })
  if (!(session && session.viewingStep)) scrollBottom(page)
  return session
}

function persist(page, patch, options) {
  const opts = options || {}
  const sessionKey = opts.sessionKey || page.sessionKey()
  const lessonCode = opts.lessonCode || storedLessonCode(page)
  const next = Object.assign({}, patch || {})
  if (next.conversationId !== undefined) {
    next.conversationId = isolation.conversationForLesson(lessonCode, next.conversationId)
  }
  const session = writeSession(sessionKey, next)
  if (session && session.conversationId) {
    isolation.bindConversation(lessonCode, session.conversationId)
  }
  history.rememberScope({
    lessonCode: lessonCode,
    topicTitle: session.topicTitle || (page.data && page.data.displayTitle) || '',
    conversationId: session.conversationId || ''
  })
  if (typeof page.sessionKey === 'function' && page.sessionKey() !== sessionKey) {
    return session
  }
  if (!opts.skipPaint) paint(page, session)
  else paintProgress(page, session)
  return session
}

function restoreRemote(page, topicTitle) {
  const token = getApp().getToken()
  const lessonCode = storedLessonCode(page)
  if (!token) {
    return Promise.resolve(hydrateSession(page.sessionKey(), null, topicTitle))
  }
  page.setData({ planning: true, hint: '正在恢复上次学习记录…' })
  return history.listMessages(lessonCode, topicTitle, token).then((rows) => {
    const remote = history.rowsToSession(rows, topicTitle)
    const session = hydrateSession(page.sessionKey(), remote, topicTitle)
    history.rememberScope({
      lessonCode: lessonCode,
      topicTitle: session.topicTitle,
      conversationId: isolation.conversationForLesson(lessonCode, session.conversationId)
    })
    return session
  }).catch(() => hydrateSession(page.sessionKey(), null, topicTitle))
}

function backupTurn(page, userText, result, boundLesson) {
  const account = getApp().globalData.account || {}
  const token = getApp().getToken()
  if (!account.id || !token || !result) return Promise.resolve()
  const cid = isolation.conversationForLesson(boundLesson || storedLessonCode(page), result.conversationId)
  const hid = result.chatId || ''
  const lessonCode = boundLesson || storedLessonCode(page)
  const topic = (page.data && (page.data.displayTitle || (page.data.course && page.data.course.title))) || ''
  const rows = []
  if (userText && String(userText).indexOf('__POLL_CHAT__|') !== 0) {
    rows.push({
      lesson_code: lessonCode,
      topic_title: topic,
      role: 'user',
      content: userText,
      conversation_id: cid,
      chat_id: hid,
      key: [cid, hid, 'user', 'prompt'].join('|'),
      account_id: account.id
    })
  }
  ;((result.items) || []).forEach((item, index) => {
    if (!item || item.role !== 'assistant') return
    const content = String(item.content || '').trim()
    if (!content) return
    rows.push({
      lesson_code: lessonCode,
      topic_title: topic,
      role: 'assistant',
      content: content,
      conversation_id: cid,
      chat_id: hid,
      key: [cid, hid, 'assistant', item.id || index].join('|'),
      account_id: account.id
    })
  })
  return history.saveRows(rows, token)
}

function backupResults(page, command, result) {
  if (command !== 'exam1' && command !== 'exam2') return Promise.resolve()
  const account = getApp().globalData.account || {}
  const token = getApp().getToken()
  const text = String((result && result.reply) || '').trim()
  if (!account.id || !token || !text) return Promise.resolve()
  return results.saveExam({
    accountId: account.id,
    lessonCode: storedLessonCode(page),
    topicTitle: (page.data && (page.data.displayTitle || (page.data.course && page.data.course.title))) || '',
    command: command,
    text: text
  }, token)
}

function scrollBottom(page) {
  const thread = page.data.thread || []
  const last = thread[thread.length - 1]
  page.setData({ scrollInto: last ? 'm-' + last.id : 'thread-end' })
}

function mergeLiveThread(base, result) {
  const items = (result && result.items) || []
  const chatId = (result && result.chatId) || ''
  const bubbles = items.map((item, index) => ({
    id: 'coze-' + (item.id || chatId || 'live') + '-' + index,
    role: 'assistant',
    hidden: false,
    content: item.content,
    step: extractCurrentStep(item.content) || undefined
  }))
  return base.concat(bubbles)
}

function stopWaitClock(page) {
  if (page._waitTimer) {
    clearInterval(page._waitTimer)
    page._waitTimer = null
  }
}

function startWaitClock(page) {
  stopWaitClock(page)
  page._waitStarted = Date.now()
  page.setData({
    thinking: true,
    waitSec: 0,
    thinkHint: THINK_HINTS[0]
  })
  page._waitTimer = setInterval(() => {
    const sec = Math.floor((Date.now() - page._waitStarted) / 1000)
    page.setData({
      waitSec: sec,
      thinkHint: THINK_HINTS[Math.floor(sec / 3) % THINK_HINTS.length]
    })
  }, 1000)
}

function stopLive(page) {
  typewriter.stop(page)
  stopWaitClock(page)
  if (page._autoAdvanceTimer) {
    clearTimeout(page._autoAdvanceTimer)
    page._autoAdvanceTimer = null
  }
  page.setData({ thinking: false })
}

function askZhixue(page, text, options) {
  const opts = options || {}
  const prompt = rawUserMessage(String(text || '').trim())
  if (!prompt || page.data.sending || page._busy) return Promise.resolve()
  page._busy = true
  stopLive(page)
  const turnId = isolation.nextTurnId(page)
  const sessionKey = page.sessionKey()
  const lessonCode = storedLessonCode(page)
  const preview = readSession(sessionKey) || {}
  const boundCid = isolation.conversationForLesson(lessonCode, preview.conversationId)
  const packed = packTurn(prompt)
  const userMsg = {
    id: Date.now(),
    role: 'user',
    hidden: false,
    content: prompt,
    preview: opts.preview || shortUserText(prompt)
  }
  const base = (preview.messages || []).filter((item) => item.role === 'user' || item.role === 'assistant')
  const pending = base.concat([userMsg])
  persist(page, {
    messages: pending,
    followUps: [],
    viewingStep: 0,
    conversationId: boundCid
  }, { sessionKey: sessionKey, lessonCode: lessonCode })
  page.setData({ sending: true, error: '', draft: '', planning: false, followUps: [], viewingStep: 0 })
  startWaitClock(page)
  const account = getApp().globalData.account || {}
  const userId = page.cozeUserId(account)
  let typed = ''
  return chatWithCoze(packed, userId, boundCid, getApp().getToken(), function onTick(result) {
    if (!isolation.isLiveTurn(page, turnId, sessionKey)) return
    persist(page, {
      messages: mergeLiveThread(pending, result),
      followUps: result.followUps || [],
      conversationId: isolation.conversationForLesson(lessonCode, result.conversationId || boundCid),
      chatId: result.chatId || preview.chatId || ''
    }, { skipPaint: true, sessionKey: sessionKey, lessonCode: lessonCode })
    const next = String((result && result.reply) || '')
    if (!next || next === typed) return
    typed = next
    stopWaitClock(page)
    typewriter.play(page, pending, stripGateMarkers(next), {
      id: 'coze-live-' + (result.chatId || 'turn'),
      followUps: [],
      step: extractCurrentStep(next)
    })
  }).then((result) => {
    if (!isolation.isLiveTurn(page, turnId, sessionKey)) {
      page._busy = false
      return
    }
    const finalText = String((result && result.reply) || typed)
    const nextProgress = applyProgress(progressOf(preview), detectProgress(finalText))
    persist(page, {
      messages: mergeLiveThread(pending, result),
      followUps: result.followUps || [],
      conversationId: isolation.conversationForLesson(lessonCode, (result && result.conversationId) || boundCid),
      chatId: (result && result.chatId) || preview.chatId || '',
      currentStep: nextProgress.currentStep,
      completedSteps: nextProgress.completedSteps,
      exam1Done: nextProgress.exam1Done,
      exam2Done: nextProgress.exam2Done,
      finished: nextProgress.finished,
      currentPhase: nextProgress.currentPhase,
      inspectionStep: nextProgress.inspectionStep,
      inspectWait: nextProgress.inspectWait,
      steps: paintStepViews(nextProgress),
      completedCount: nextProgress.completedSteps.length,
      currentIndex: Math.max(0, (nextProgress.currentStep || 1) - 1)
    }, { skipPaint: true, sessionKey: sessionKey, lessonCode: lessonCode })
    stopWaitClock(page)
    return typewriter.play(page, pending, stripGateMarkers(finalText), {
      id: 'coze-live-' + ((result && result.chatId) || 'turn'),
      followUps: (result && result.followUps) || [],
      step: nextProgress.currentStep
    }).then(() => {
      if (!isolation.isLiveTurn(page, turnId, sessionKey)) {
        page._busy = false
        return
      }
      const latest = readSession(sessionKey)
      paint(page, latest)
      page.setData({ sending: false, thinking: false })
      page._busy = false
      if (typeof page.saveProgress === 'function') {
        page.saveProgress(nextProgress.completedSteps.length, 10)
      }
      const examCommand = nextProgress.exam2Done ? 'exam2' : (nextProgress.exam1Done ? 'exam1' : '')
      return backupTurn(page, prompt, result, lessonCode).then(() => backupResults(page, examCommand, result))
    })
  }).catch((err) => {
    if (!isolation.isLiveTurn(page, turnId, sessionKey)) {
      page._busy = false
      return
    }
    stopLive(page)
    const latest = readSession(sessionKey) || {}
    persist(page, {
      messages: (latest.messages || pending).concat([{
        id: Date.now() + 1,
        role: 'assistant',
        hidden: false,
        failed: true,
        content: page.friendlyError(err)
      }])
    }, { sessionKey: sessionKey, lessonCode: lessonCode })
    page.setData({ sending: false, error: page.friendlyError(err) })
    page._busy = false
  })
}

function startCourseFlow(page, course) {
  const topic = topicTitleOf(course)
  const opener = startPrompt(course)
  const source = sourceOf(course)
  const lessonCode = String((course && (course.lessonCode || course.lesson_code)) || page.data.lessonCode || '').trim()
  if (typeof page.setData === 'function' && (lessonCode || topic)) {
    const next = {
      lessonCode: lessonCode || page.data.lessonCode || '',
      displayTitle: topic || page.data.displayTitle,
      course: Object.assign({}, course, {
        title: topic || (course && course.title) || '',
        displayTitle: topic || (course && course.displayTitle) || '',
        lessonCode: lessonCode || (course && course.lessonCode) || '',
        source: source
      })
    }
    Object.assign(page.data, next)
    page.setData(next)
  }
  return restoreRemote(page, topic).then((existing) => {
    const hasHistory = !!(existing && (existing.messages || []).length && hasAssistant(existing.messages))
    const cid = hasHistory
      ? isolation.conversationForLesson(storedLessonCode(page), existing && existing.conversationId)
      : ''
    const account = (typeof getApp === 'function' && getApp().globalData && getApp().globalData.account) || {}
    if (existing && cid !== (existing.conversationId || '')) {
      existing = persist(page, {
        conversationId: cid,
        localSlotKey: isolation.localSlotKey(account, storedLessonCode(page))
      }, { skipPaint: true })
    }
    if (hasHistory) {
      paint(page, existing)
      page.setData({ planning: false, hint: topic ? ('课题：' + topic) : '已恢复上次学习记录' })
      return existing
    }
    if (!opener) {
      page.setData({ planning: false })
      return existing
    }
    persist(page, {
      topicTitle: topic,
      source: source,
      planText: (course && course.planText) || (existing && existing.planText) || '',
      conversationId: '',
      chatId: '',
      currentStep: 1,
      completedSteps: [],
      localSlotKey: isolation.localSlotKey(account, storedLessonCode(page))
    }, { skipPaint: true })
    page.setData({ planning: true, currentStep: 1, conversationId: '' })
    return askZhixue(page, opener, {
      preview: source === 'personal' ? ('这份个人教案 · ' + topic) : topic
    })
  })
}

function startOpenFlow(page, topicTitle) {
  if (topicTitle) {
    return startCourseFlow(page, {
      title: topicTitle,
      displayTitle: topicTitle,
      lessonCode: (page.data && page.data.lessonCode) || '',
      source: sourceOf(page.data && page.data.course, page.data && page.data.lessonCode),
      planText: (page.data && page.data.course && page.data.course.planText) || ''
    })
  }
  const lessonCode = storedLessonCode(page)
  if (lessonCode && lessonCode !== 'open') {
    const course = (page.data && page.data.course) || {
      title: (page.data && page.data.displayTitle) || lessonCode,
      displayTitle: (page.data && page.data.displayTitle) || lessonCode,
      lessonCode: lessonCode
    }
    return startCourseFlow(page, course)
  }
  const existing = readSession(page.sessionKey())
  if (existing && hasAssistant(existing.messages)) {
    paint(page, existing)
    return Promise.resolve(existing)
  }
  page.setData({
    planning: false,
    hint: '从课程目录点一门课，或在输入框里直接回复智学。'
  })
  return Promise.resolve(existing)
}

function clearHistory(page) {
  const token = getApp().getToken()
  const lessonCode = storedLessonCode(page)
  const title = (page.data && page.data.displayTitle) || ''
  isolation.unbindLesson(lessonCode)
  return history.clearLesson(lessonCode, title, token).catch(() => 0)
}

function onPlus(page) {
  const items = []
  if (typeof page.onClear === 'function') items.push('重新开始')
  if (page.data && page.data.error) items.push('再问一次')
  if (!items.length) {
    wx.showToast({ title: '从课程目录点课即可换课', icon: 'none' })
    return
  }
  wx.showActionSheet({
    itemList: items,
    success: (res) => {
      const name = items[res.tapIndex]
      if (name === '重新开始' && typeof page.onClear === 'function') page.onClear()
      if (name === '再问一次' && typeof page.onRetry === 'function') page.onRetry()
    }
  })
}

function onSend(page) {
  const text = (page.data.draft || '').trim()
  if (!text || page.data.sending) return
  askZhixue(page, text)
}

function onFollow(page, text) {
  if (!text || page.data.sending) return
  askZhixue(page, String(text))
}

function onRetry(page, fallbackPrompt) {
  page.setData({ error: '' })
  const session = readSession(page.sessionKey()) || {}
  const messages = session.messages || []
  let lastUser = ''
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user' && !messages[i].hidden) {
      lastUser = rawUserMessage(messages[i].content)
      break
    }
  }
  askZhixue(page, lastUser || fallbackPrompt)
}

function scrollToStep(page, step) {
  const thread = page.data.thread || []
  const hit = thread.filter((item) => Number(item.step) === Number(step))[0]
  page.setData({
    viewingStep: step,
    viewingTitle: stepMeta(step).title,
    scrollInto: hit ? (hit.anchor || ('m-' + hit.id)) : 'thread-end'
  })
  persist(page, { viewingStep: step }, { skipPaint: true })
}

function onStepTap(page, index) {
  const steps = page.data.steps || []
  const item = steps[Number(index)]
  if (!item) return
  if (item.status === 'todo') {
    wx.showToast({ title: '还没学到第' + item.n + '步', icon: 'none' })
    return
  }
  if (item.status === 'current') {
    persist(page, { viewingStep: 0 }, { skipPaint: true })
    page.setData({ viewingStep: 0, viewingTitle: '' })
    scrollBottom(page)
    return
  }
  const items = ['查看本步对话']
  items.push('重新学习此步')
  wx.showActionSheet({
    itemList: items,
    success: (res) => {
      const name = items[res.tapIndex]
      if (name === '查看本步对话') scrollToStep(page, item.n)
      if (name === '重新学习此步') replayStep(page, item.n)
    }
  })
}

function replayStep(page, step) {
  scrollToStep(page, step)
  wx.showToast({ title: '在输入框里直接告诉智学即可', icon: 'none' })
}

function backToLive(page) {
  persist(page, { viewingStep: 0 }, { skipPaint: true })
  page.setData({ viewingStep: 0, viewingTitle: '' })
  scrollBottom(page)
}

function startExam1(page) {
  askZhixue(page, '确认进入')
}

function startExam2(page) {
  askZhixue(page, '确认进入检验2')
}

function makePpt(page) {
  const session = readSession(page.sessionKey()) || {}
  const messages = session.messages || []
  let script = ''
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant' && !messages[i].failed && (messages[i].step === 12 || messages[i].command === 'exam2' || /说课|PPT/.test(messages[i].content || ''))) {
      script = messages[i].content
      break
    }
  }
  if (!script) {
    wx.showToast({ title: '还没有说课稿，请先点说课训练', icon: 'none' })
    return
  }
  try {
    wx.setStorageSync('pptSeed', script)
  } catch (e) {}
  const title = (page.data && page.data.displayTitle) || '家庭教育课件'
  const courseId = (page.data && page.data.course && page.data.course.id) || ''
  wx.navigateTo({
    url: '/pages/ppt/index?title=' + encodeURIComponent(title) + (courseId ? ('&courseId=' + courseId) : '')
  })
}

module.exports = {
  paint: paint,
  persist: persist,
  askZhixue: askZhixue,
  abortTurn: abortTurn,
  applyLesson: applyLesson,
  startCourseFlow: startCourseFlow,
  startOpenFlow: startOpenFlow,
  clearHistory: clearHistory,
  onSend: onSend,
  onPlus: onPlus,
  onFollow: onFollow,
  onRetry: onRetry,
  onStepTap: onStepTap,
  replayStep: replayStep,
  backToLive: backToLive,
  startExam1: startExam1,
  startExam2: startExam2,
  makePpt: makePpt,
  stopLive: stopLive
}
