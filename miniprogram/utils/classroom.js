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

function paint(page, session) {
  const thread = ((session && session.messages) || []).filter((item) => !item.hidden)
  const topic = (session && session.topicTitle) || ''
  page.setData({
    conversationId: (session && session.conversationId) || '',
    thread: thread,
    followUps: (session && session.followUps) || [],
    hint: topic ? ('课题：' + topic) : '问答由智学原文给出'
  })
  scrollBottom(page)
  return session
}

function persist(page, patch) {
  const session = writeSession(page.sessionKey(), patch)
  paint(page, session)
  return session
}

function scrollBottom(page) {
  const thread = page.data.thread || []
  const last = thread[thread.length - 1]
  page.setData({ scrollInto: last ? 'm-' + last.id : '' })
}

function mergeLiveThread(base, result) {
  const items = (result && result.items) || []
  const bubbles = items.map((item, index) => ({
    id: 'coze-' + index + '-' + (item.type || 'answer'),
    role: 'assistant',
    hidden: false,
    content: item.content
  }))
  return base.concat(bubbles)
}

function askZhixue(page, text) {
  const prompt = String(text || '').trim()
  if (!prompt || page.data.sending || page._busy) return Promise.resolve()
  page._busy = true
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
  page.setData({ sending: true, error: '', draft: '', planning: false })
  const account = getApp().globalData.account || {}
  const userId = page.cozeUserId(account)
  return chatWithCoze(prompt, userId, preview.conversationId || '', getApp().getToken(), function onTick(result) {
    persist(page, {
      messages: mergeLiveThread(pending, result),
      followUps: result.followUps || [],
      conversationId: result.conversationId || preview.conversationId || '',
      chatId: result.chatId || preview.chatId || ''
    })
  }).then((result) => {
    persist(page, {
      messages: mergeLiveThread(pending, result),
      followUps: result.followUps || [],
      conversationId: result.conversationId || preview.conversationId || '',
      chatId: result.chatId || preview.chatId || ''
    })
    page.setData({ sending: false })
    page._busy = false
    if (typeof page.saveProgress === 'function') {
      page.saveProgress(1, 1)
    }
  }).catch((err) => {
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
  bindMic: bindMic
}
