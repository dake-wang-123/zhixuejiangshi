const { chatWithCoze } = require('./agent.js')
const {
  readSession,
  writeSession,
  hasAssistant
} = require('./session.js')
const {
  startPrompt,
  OPEN_GUIDE_PROMPT
} = require('./flow.js')
const voice = require('./voice.js')
const typewriter = require('./typewriter.js')

const THINK_HINTS = [
  '智学正在翻这一课的教案…',
  '正在组织这一步的讲解…',
  '马上把引导问题发给你…'
]

function paint(page, session) {
  typewriter.stop(page)
  const thread = ((session && session.messages) || []).filter((item) => !item.hidden)
  const topic = (session && session.topicTitle) || ''
  page.setData({
    conversationId: (session && session.conversationId) || '',
    thread: thread,
    followUps: (session && session.followUps) || [],
    thinking: false,
    hint: topic ? ('课题：' + topic) : '问答由智学原文给出'
  })
  scrollBottom(page)
  return session
}

function persist(page, patch, options) {
  const session = writeSession(page.sessionKey(), patch)
  if (!(options && options.skipPaint)) paint(page, session)
  return session
}

function scrollBottom(page) {
  const thread = page.data.thread || []
  const last = thread[thread.length - 1]
  page.setData({ scrollInto: last ? 'm-' + last.id : '' })
}

function mergeLiveThread(base, result) {
  const items = (result && result.items) || []
  const chatId = (result && result.chatId) || ''
  const bubbles = items.map((item, index) => ({
    id: 'coze-' + (item.id || chatId || 'live') + '-' + index,
    role: 'assistant',
    hidden: false,
    content: item.content
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

function askZhixue(page, text) {
  const prompt = String(text || '').trim()
  if (!prompt || page.data.sending || page._busy) return Promise.resolve()
  page._busy = true
  stopLive(page)
  const preview = readSession(page.sessionKey()) || {}
  const userMsg = {
    id: Date.now(),
    role: 'user',
    hidden: false,
    content: prompt
  }
  const base = (preview.messages || []).filter((item) => item.role === 'user' || item.role === 'assistant')
  const pending = base.concat([userMsg])
  persist(page, { messages: pending, followUps: [] })
  page.setData({ sending: true, error: '', draft: '', planning: false, followUps: [] })
  startWaitClock(page)
  const account = getApp().globalData.account || {}
  const userId = page.cozeUserId(account)
  let typed = ''
  return chatWithCoze(prompt, userId, preview.conversationId || '', getApp().getToken(), function onTick(result) {
    persist(page, {
      messages: mergeLiveThread(pending, result),
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
      followUps: []
    })
  }).then((result) => {
    persist(page, {
      messages: mergeLiveThread(pending, result),
      followUps: result.followUps || [],
      conversationId: result.conversationId || preview.conversationId || '',
      chatId: result.chatId || preview.chatId || ''
    }, { skipPaint: true })
    const finalText = String((result && result.reply) || typed)
    stopWaitClock(page)
    return typewriter.play(page, pending, finalText, {
      id: 'coze-live-' + ((result && result.chatId) || 'turn'),
      followUps: (result && result.followUps) || []
    }).then(() => {
      page.setData({ sending: false, thinking: false })
      page._busy = false
      if (typeof page.saveProgress === 'function') {
        page.saveProgress(1, 1)
      }
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
  const existing = readSession(page.sessionKey())
  if (existing && (existing.messages || []).length && hasAssistant(existing.messages) && (!title || existing.topicTitle === title)) {
    paint(page, existing)
    return Promise.resolve(existing)
  }
  persist(page, {
    messages: [],
    followUps: [],
    conversationId: '',
    chatId: '',
    topicTitle: title
  })
  if (!title) {
    page.setData({ planning: false })
    return Promise.resolve(readSession(page.sessionKey()))
  }
  page.setData({ planning: true })
  return askZhixue(page, title)
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
  persist(page, {
    messages: [],
    followUps: [],
    conversationId: '',
    chatId: '',
    topicTitle: ''
  })
  page.setData({ planning: true, hint: '正在向智学取引导语…' })
  return askZhixue(page, OPEN_GUIDE_PROMPT)
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

function bindMic(page) {
  return {
    onMicTap: function () {
      if (page.data.sending) return
      if (page.data.recording) {
        voice.end().then((text) => {
          page.setData({
            recording: false,
            draft: voice.appendDraft(page.data.draft, text)
          })
        }).catch((err) => {
          page.setData({ recording: false })
          wx.showToast({ title: voice.friendlyVoiceError(err), icon: 'none' })
        })
        return
      }
      voice.begin({
        onPartial: function (text) {
          page.setData({ draft: voice.appendDraft(page._voiceBase || '', text) })
        }
      }).then(() => {
        page._voiceBase = page.data.draft || ''
        page.setData({ recording: true })
      }).catch((err) => {
        page.setData({ recording: false })
        wx.showToast({ title: voice.friendlyVoiceError(err), icon: 'none' })
      })
    },
    onMicStart: function () {},
    onMicEnd: function () {}
  }
}

module.exports = {
  paint: paint,
  persist: persist,
  askZhixue: askZhixue,
  startCourseFlow: startCourseFlow,
  startOpenFlow: startOpenFlow,
  onSend: onSend,
  onFollow: onFollow,
  onRetry: onRetry,
  bindMic: bindMic,
  stopLive: stopLive
}
