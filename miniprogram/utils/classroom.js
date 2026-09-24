const { chatWithCoze } = require('./agent.js')
const {
  readSession,
  writeSession,
  hasAssistant,
  hydrateSession,
  storedLessonCode
} = require('./session.js')
const {
  startPrompt,
  OPEN_GUIDE_PROMPT,
  detectProgress,
  applyProgress,
  inferProgress,
  paintStepViews,
  packTurn,
  stepMeta,
  replayPrompt,
  exam1Prompt,
  exam2Prompt
} = require('./flow.js')
const history = require('./learn-history.js')
const results = require('./learn-results.js')
const typewriter = require('./typewriter.js')
const { decorateThread } = require('./markdown.js')

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
  const inferred = inferProgress((session && session.messages) || [])
  const localDone = ((session && session.completedSteps) || []).length
  const progress = localDone >= inferred.completedSteps.length
    ? applyProgress(session || {}, {}, '')
    : inferred
  if (session && session.currentStep) progress.currentStep = session.currentStep
  if (session && session.completedSteps && session.completedSteps.length >= progress.completedSteps.length) {
    progress.completedSteps = session.completedSteps
    progress.finished = session.completedSteps.length >= 10
  }
  if (session && session.exam1Done) progress.exam1Done = true
  if (session && session.exam2Done) progress.exam2Done = true
  return progress
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
    viewingStep: (session && session.viewingStep) || 0,
    viewingTitle: (session && session.viewingStep) ? stepMeta(session.viewingStep).title : '',
    currentLabel: progress.finished && current >= 11
      ? meta.title
      : ('第' + Math.min(10, current) + '步 · ' + (current <= 10 ? meta.title : '检验'))
  })
  return progress
}

function paint(page, session) {
  typewriter.stop(page)
  const thread = markAnchors(decorateThread(((session && session.messages) || []).filter((item) => !item.hidden)))
  const topic = (session && session.topicTitle) || ''
  const progress = paintProgress(page, session)
  page.setData({
    conversationId: (session && session.conversationId) || '',
    thread: thread,
    followUps: (session && session.followUps) || [],
    thinking: false,
    hint: topic ? ('课题：' + topic) : '按 10 步交付往下走'
  })
  if (!(session && session.viewingStep)) scrollBottom(page)
  return session
}

function persist(page, patch, options) {
  const session = writeSession(page.sessionKey(), patch)
  history.rememberScope({
    lessonCode: storedLessonCode(page),
    topicTitle: session.topicTitle || (page.data && page.data.displayTitle) || '',
    conversationId: session.conversationId || ''
  })
  if (!(options && options.skipPaint)) paint(page, session)
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
      conversationId: session.conversationId
    })
    return session
  }).catch(() => hydrateSession(page.sessionKey(), null, topicTitle))
}

function backupTurn(page, userText, result) {
  const account = getApp().globalData.account || {}
  const token = getApp().getToken()
  if (!account.id || !token || !result) return Promise.resolve()
  const cid = result.conversationId || ''
  const hid = result.chatId || ''
  const lessonCode = storedLessonCode(page)
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

function mergeLiveThread(base, result, step) {
  const items = (result && result.items) || []
  const chatId = (result && result.chatId) || ''
  const n = Number(step) || 0
  const bubbles = items.map((item, index) => ({
    id: 'coze-' + (item.id || chatId || 'live') + '-' + index,
    role: 'assistant',
    hidden: false,
    content: item.content,
    step: n || undefined
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
  page.setData({ thinking: false })
}

function askZhixue(page, text, options) {
  const opts = options || {}
  const prompt = String(text || '').trim()
  if (!prompt || page.data.sending || page._busy) return Promise.resolve()
  page._busy = true
  stopLive(page)
  const preview = readSession(page.sessionKey()) || {}
  const progress = progressOf(preview)
  const command = opts.command || 'reply'
  const step = opts.step || progress.currentStep || 1
  const packed = packTurn(prompt, Object.assign({}, progress, { currentStep: step }), command)
  const userMsg = {
    id: Date.now(),
    role: 'user',
    hidden: false,
    content: prompt,
    step: step,
    command: command
  }
  const base = (preview.messages || []).filter((item) => item.role === 'user' || item.role === 'assistant')
  const pending = base.concat([userMsg])
  persist(page, { messages: pending, followUps: [], viewingStep: 0, currentStep: step })
  page.setData({ sending: true, error: '', draft: '', planning: false, followUps: [], viewingStep: 0 })
  startWaitClock(page)
  const account = getApp().globalData.account || {}
  const userId = page.cozeUserId(account)
  let typed = ''
  return chatWithCoze(packed, userId, preview.conversationId || '', getApp().getToken(), function onTick(result) {
    persist(page, {
      messages: mergeLiveThread(pending, result, step),
      followUps: result.followUps || [],
      conversationId: result.conversationId || preview.conversationId || '',
      chatId: result.chatId || preview.chatId || ''
    }, { skipPaint: true })
    const next = String((result && result.reply) || '')
    if (!next || next === typed) return
    typed = next
    stopWaitClock(page)
    typewriter.play(page, pending, next, {
      id: 'coze-live-' + (result.chatId || 'turn'),
      followUps: [],
      step: step
    })
  }).then((result) => {
    const finalText = String((result && result.reply) || typed)
    const detected = detectProgress(finalText)
    const nextProgress = applyProgress(progressOf(preview), detected, command)
    if (command === 'exam1' && finalText) nextProgress.exam1Done = true
    if (command === 'exam2' && finalText) nextProgress.exam2Done = true
    persist(page, {
      messages: mergeLiveThread(pending, result, nextProgress.currentStep || step),
      followUps: result.followUps || [],
      conversationId: result.conversationId || preview.conversationId || '',
      chatId: result.chatId || preview.chatId || '',
      currentStep: nextProgress.currentStep,
      completedSteps: nextProgress.completedSteps,
      exam1Done: nextProgress.exam1Done,
      exam2Done: nextProgress.exam2Done,
      finished: nextProgress.finished,
      steps: paintStepViews(nextProgress),
      completedCount: nextProgress.completedSteps.length,
      currentIndex: Math.max(0, nextProgress.currentStep - 1)
    }, { skipPaint: true })
    stopWaitClock(page)
    return typewriter.play(page, pending, finalText, {
      id: 'coze-live-' + ((result && result.chatId) || 'turn'),
      followUps: (result && result.followUps) || [],
      step: nextProgress.currentStep
    }).then(() => {
      const latest = readSession(page.sessionKey())
      paint(page, latest)
      page.setData({ sending: false, thinking: false })
      page._busy = false
      if (typeof page.saveProgress === 'function') {
        page.saveProgress(nextProgress.completedSteps.length, 10)
      }
      return backupTurn(page, prompt, result).then(() => backupResults(page, command, result))
    })
  }).catch((err) => {
    stopLive(page)
    const latest = readSession(page.sessionKey()) || {}
    persist(page, {
      messages: (latest.messages || pending).concat([{
        id: Date.now() + 1,
        role: 'assistant',
        hidden: false,
        failed: true,
        content: page.friendlyError(err)
      }])
    })
    page.setData({ sending: false, error: page.friendlyError(err) })
    page._busy = false
  })
}

function startCourseFlow(page, course) {
  const title = startPrompt(course)
  return restoreRemote(page, title).then((existing) => {
    if (existing && (existing.messages || []).length && hasAssistant(existing.messages)) {
      paint(page, existing)
      page.setData({ planning: false, hint: title ? ('课题：' + title) : '已恢复上次学习记录' })
      return existing
    }
    if (!title) {
      page.setData({ planning: false })
      return existing
    }
    persist(page, {
      topicTitle: title,
      conversationId: existing.conversationId || '',
      chatId: existing.chatId || ''
    }, { skipPaint: true })
    page.setData({ planning: true })
    return askZhixue(page, title)
  })
}

function startOpenFlow(page, topicTitle) {
  if (topicTitle) {
    return startCourseFlow(page, { title: topicTitle, displayTitle: topicTitle })
  }
  const existing = readSession(page.sessionKey())
  if (existing && hasAssistant(existing.messages)) {
    paint(page, existing)
    return Promise.resolve(existing)
  }
  const token = getApp().getToken()
  const last = history.readLastScope()
  const loadLast = token ? history.lastRow(token).catch(() => null) : Promise.resolve(null)
  return loadLast.then((row) => {
    const lessonCode = (row && (row.lesson_code || row.课号)) || (last && last.lessonCode) || ''
    const title = (row && (row.topic || row.topic_title || row.课题)) || (last && last.topicTitle) || ''
    if (lessonCode && lessonCode !== 'open') {
      if (typeof page.setData === 'function') {
        page.setData({
          lessonCode: lessonCode,
          displayTitle: title || lessonCode,
          course: { title: title || lessonCode, displayTitle: title || lessonCode, lessonCode: lessonCode }
        })
      }
      return startCourseFlow(page, page.data.course)
    }
    if (title) {
      return startCourseFlow(page, { title: title, displayTitle: title })
    }
    page.setData({ planning: true, hint: '正在向智学取引导语…' })
    return askZhixue(page, OPEN_GUIDE_PROMPT)
  })
}

function clearHistory(page) {
  const token = getApp().getToken()
  const lessonCode = storedLessonCode(page)
  const title = (page.data && page.data.displayTitle) || ''
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
      lastUser = messages[i].content
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
  const n = Number(step) || 1
  persist(page, { currentStep: n, viewingStep: 0 }, { skipPaint: true })
  page.setData({ viewingStep: 0, currentStep: n })
  askZhixue(page, replayPrompt(n), { command: 'replay_step', step: n })
}

function backToLive(page) {
  persist(page, { viewingStep: 0 }, { skipPaint: true })
  page.setData({ viewingStep: 0, viewingTitle: '' })
  scrollBottom(page)
}

function startExam1(page) {
  if (!(page.data && page.data.finished)) {
    wx.showToast({ title: '先把 10 步学完', icon: 'none' })
    return
  }
  askZhixue(page, exam1Prompt(), { command: 'exam1', step: 11 })
}

function startExam2(page) {
  if (!(page.data && page.data.exam1Done)) {
    wx.showToast({ title: '请先完成实战演练', icon: 'none' })
    return
  }
  askZhixue(page, exam2Prompt(), { command: 'exam2', step: 12 })
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
