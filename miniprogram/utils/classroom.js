const { chatWithCoze } = require('./agent.js')
const {
  readSession,
  writeSession,
  hasAssistant
} = require('./session.js')
const {
  parseListedSteps,
  mergeSteps,
  startPrompt,
  continuePrompt,
  firstLiveIndex
} = require('./flow.js')
const voice = require('./voice.js')

function liveIndexOf(session) {
  const steps = (session && session.steps) || []
  const completed = Number((session && session.completedCount) || 0)
  if (!steps.length) return 0
  if (completed >= steps.length) return steps.length - 1
  return Math.min(completed, steps.length - 1)
}

function paint(page, session, viewIndex) {
  const steps = (session && session.steps) || []
  const completedCount = Number((session && session.completedCount) || 0)
  const finished = steps.length > 0 && completedCount >= steps.length
  const liveIndex = liveIndexOf(session)
  const idx = viewIndex == null ? (page.data.reviewing ? page.data.currentIndex : liveIndex) : viewIndex
  const safeIndex = steps.length ? Math.max(0, Math.min(idx, steps.length - 1)) : 0
  const reviewing = !!(steps.length && !finished && safeIndex !== liveIndex)
  const currentStep = steps[safeIndex] || null
  const thread = ((session && session.messages) || []).filter((item) => {
    if (item.hidden) return false
    if (!steps.length || !reviewing) return true
    return Number(item.stageIndex) === Number(safeIndex)
  })
  const followUps = reviewing ? [] : ((session && session.followUps) || [])
  page.setData({
    steps: steps,
    completedCount: completedCount,
    finished: finished,
    liveIndex: liveIndex,
    currentIndex: safeIndex,
    reviewing: reviewing,
    currentStep: currentStep,
    conversationId: (session && session.conversationId) || '',
    thread: thread,
    followUps: followUps,
    hint: currentStep
      ? ((currentStep.group ? currentStep.group + ' · ' : '') + currentStep.title)
      : '对话跟随智学。智能体列出环节后，顶部红格变绿表示该环节已完成'
  })
  scrollBottom(page)
  return session
}

function persist(page, patch, viewIndex) {
  const session = writeSession(page.sessionKey(), patch)
  paint(page, session, viewIndex)
  return session
}

function scrollBottom(page) {
  const thread = page.data.thread || []
  const last = thread[thread.length - 1]
  page.setData({ scrollInto: last ? 'm-' + last.id : '' })
}

function askZhixue(page, text, options) {
  const opts = options || {}
  const prompt = String(text || '').trim()
  if (!prompt || page.data.sending || page._busy) return Promise.resolve()
  page._busy = true
  const stageIndex = opts.stageIndex != null ? opts.stageIndex : liveIndexOf(readSession(page.sessionKey()))
  const hidden = !!opts.hidden
  const preview = readSession(page.sessionKey()) || {}
  const pending = (preview.messages || []).concat([{
    id: Date.now(),
    role: 'user',
    hidden: hidden,
    stageIndex: stageIndex,
    content: prompt
  }])
  persist(page, { messages: pending, followUps: [] }, stageIndex)
  page.setData({ sending: true, error: '', draft: '', planning: false, reviewing: false })
  const account = getApp().globalData.account || {}
  const userId = page.cozeUserId(account)
  return chatWithCoze(prompt, userId, preview.conversationId || '', getApp().getToken()).then((result) => {
    const latest = readSession(page.sessionKey()) || {}
    const withoutDup = (latest.messages || pending).slice()
    if (withoutDup.length && withoutDup[withoutDup.length - 1].role === 'user') {
      withoutDup.pop()
    }
    const messages = withoutDup.slice()
    if (!hidden) {
      messages.push({
        id: Date.now(),
        role: 'user',
        hidden: false,
        stageIndex: stageIndex,
        content: prompt
      })
    }
    messages.push({
      id: Date.now() + 1,
      role: 'assistant',
      hidden: false,
      stageIndex: stageIndex,
      content: result.reply
    })
    const steps = mergeSteps(latest.steps, parseListedSteps(result.reply))
    persist(page, {
      messages: messages,
      steps: steps,
      followUps: result.followUps || [],
      conversationId: result.conversationId || latest.conversationId || '',
      chatId: result.chatId || latest.chatId || ''
    }, stageIndex)
    page.setData({ sending: false })
    page._busy = false
  }).catch((err) => {
    const latest = readSession(page.sessionKey()) || {}
    persist(page, {
      messages: (latest.messages || pending).concat([{
        id: Date.now() + 1,
        role: 'assistant',
        hidden: false,
        failed: true,
        stageIndex: stageIndex,
        content: page.friendlyError(err)
      }])
    }, stageIndex)
    page.setData({ sending: false, error: page.friendlyError(err) })
    page._busy = false
  })
}

function startCourseFlow(page, course) {
  const title = (course && (course.displayTitle || course.title)) || ''
  const existing = readSession(page.sessionKey())
  if (existing && (existing.messages || []).length && hasAssistant(existing.messages) && (!title || existing.topicTitle === title)) {
    paint(page, existing)
    return Promise.resolve(existing)
  }
  const live = firstLiveIndex()
  persist(page, {
    steps: [],
    completedCount: live,
    currentIndex: live,
    messages: [],
    followUps: [],
    conversationId: '',
    chatId: '',
    topicTitle: title
  }, live)
  const prompt = startPrompt(course, title)
  if (!prompt) {
    page.setData({ planning: false })
    return Promise.resolve(readSession(page.sessionKey()))
  }
  page.setData({ planning: true })
  return askZhixue(page, prompt, {
    hidden: false,
    stageIndex: live
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
  paint(page, existing || {
    steps: [],
    messages: [],
    followUps: [],
    completedCount: 0,
    currentIndex: 0
  })
  page.setData({ planning: false })
  return Promise.resolve(existing)
}

function onStepBar(page, index) {
  const i = Number(index)
  if (isNaN(i)) return
  const session = readSession(page.sessionKey()) || {}
  const completed = Number(session.completedCount || 0)
  if (i > completed) {
    wx.showToast({ title: '请先走完当前环节再进入', icon: 'none' })
    return
  }
  paint(page, session, i)
}

function onComplete(page) {
  if (page.data.sending || page._busy) return
  if (page.data.reviewing) {
    wx.showToast({ title: '回看中，请先回到当前环节', icon: 'none' })
    return
  }
  const session = readSession(page.sessionKey()) || {}
  const steps = session.steps || []
  if (!steps.length) {
    wx.showToast({ title: '等智学列出环节后再标记完成', icon: 'none' })
    return
  }
  const liveIndex = liveIndexOf(session)
  if (!hasAssistant(session.messages, liveIndex)) {
    wx.showToast({ title: '等智学回复后再进入下一环节', icon: 'none' })
    return
  }
  const completedCount = Math.min(Number(session.completedCount || 0) + 1, steps.length)
  persist(page, { completedCount: completedCount }, Math.min(completedCount, steps.length - 1))
  if (typeof page.saveProgress === 'function') {
    page.saveProgress(completedCount, steps.length)
  }
  if (completedCount >= steps.length) {
    wx.showToast({ title: '智学列出的环节已走完', icon: 'none' })
    return
  }
  const next = steps[completedCount]
  wx.showToast({ title: '进入「' + next.title + '」', icon: 'none' })
  return askZhixue(page, continuePrompt(), {
    hidden: false,
    stageIndex: completedCount
  })
}

function onSend(page) {
  if (page.data.reviewing) {
    const session = readSession(page.sessionKey()) || {}
    paint(page, session, liveIndexOf(session))
  }
  const text = (page.data.draft || '').trim()
  if (!text || page.data.sending) return
  askZhixue(page, text, { hidden: false, stageIndex: liveIndexOf(readSession(page.sessionKey())) })
}

function onFollow(page, text) {
  if (!text || page.data.sending) return
  if (page.data.reviewing) {
    paint(page, readSession(page.sessionKey()) || {}, liveIndexOf(readSession(page.sessionKey())))
  }
  askZhixue(page, text, { hidden: false, stageIndex: liveIndexOf(readSession(page.sessionKey())) })
}

function onRetry(page, fallbackPrompt) {
  page.setData({ error: '' })
  const session = readSession(page.sessionKey()) || {}
  const liveIndex = liveIndexOf(session)
  const messages = session.messages || []
  let lastUser = ''
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user' && Number(messages[i].stageIndex) === liveIndex) {
      lastUser = messages[i].content
      break
    }
  }
  askZhixue(page, lastUser || fallbackPrompt, {
    hidden: false,
    stageIndex: liveIndex
  })
}

function bindMic(page) {
  return {
    onMicStart: function () {
      if (page.data.sending || page.data.recording) return
      page.setData({ recording: true })
      voice.startRecord().catch((err) => {
        page.setData({ recording: false })
        wx.showToast({ title: page.friendlyError(err), icon: 'none' })
      })
    },
    onMicEnd: function () {
      if (!page.data.recording) return
      page.setData({ recording: false })
      voice.stopRecord().then((text) => {
        page.setData({ draft: voice.appendDraft(page.data.draft, text) })
      }).catch((err) => {
        wx.showToast({ title: page.friendlyError(err), icon: 'none' })
      })
    }
  }
}

module.exports = {
  paint: paint,
  persist: persist,
  askZhixue: askZhixue,
  startCourseFlow: startCourseFlow,
  startOpenFlow: startOpenFlow,
  onStepBar: onStepBar,
  onComplete: onComplete,
  onSend: onSend,
  onFollow: onFollow,
  onRetry: onRetry,
  bindMic: bindMic,
  liveIndexOf: liveIndexOf
}
