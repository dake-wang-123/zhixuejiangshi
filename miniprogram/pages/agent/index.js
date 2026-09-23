const app = getApp()
const classroom = require('../../utils/classroom.js')
const { ensureFlowSession, OPEN_SESSION_ID, blankSession, writeSession } = require('../../utils/session.js')
const { startPrompt, PENDING_TOPIC_KEY, PENDING_LESSON_KEY } = require('../../utils/flow.js')
const voice = require('../../utils/voice.js')

Page({
  data: {
    course: null,
    displayTitle: '智学伴练',
    lessonCode: '',
    loading: false,
    planning: false,
    sending: false,
    recording: false,
    reviewing: false,
    error: '',
    hint: '',
    steps: [],
    currentIndex: 0,
    liveIndex: 0,
    completedCount: 0,
    finished: false,
    currentStep: null,
    thread: [],
    followUps: [],
    draft: '',
    scrollInto: '',
    conversationId: '',
    topicDraft: ''
  },
  sessionKey() {
    return OPEN_SESSION_ID
  },
  cozeUserId(account) {
    return 'learn-' + (account.id || 'guest') + '-open'
  },
  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
    let pending = ''
    let lessonCode = ''
    try {
      const packed = wx.getStorageSync(PENDING_LESSON_KEY) || null
      if (packed) {
        pending = packed.title || packed.lessonTitle || ''
        lessonCode = packed.lessonCode || packed.code || ''
        wx.removeStorageSync(PENDING_LESSON_KEY)
      }
      if (!pending) pending = wx.getStorageSync(PENDING_TOPIC_KEY) || ''
      if (pending) wx.removeStorageSync(PENDING_TOPIC_KEY)
    } catch (e) {}
    ensureFlowSession(OPEN_SESSION_ID, pending)
    app.ensureLogin().then(() => {
      if (pending) {
        this.setData({
          displayTitle: pending,
          lessonCode: lessonCode,
          course: { title: pending, displayTitle: pending, lessonCode: lessonCode },
          planning: true,
          hint: lessonCode ? ('正在把 ' + lessonCode + ' 课题发给智学…') : '正在把课题发给智学…'
        })
        return classroom.startOpenFlow(this, pending)
      }
      this.setData({
        displayTitle: '智学伴练',
        lessonCode: '',
        course: null
      })
      return classroom.startOpenFlow(this)
    }).catch((err) => {
      this.setData({ error: this.friendlyError(err), planning: false })
    })
  },
  onUnload() {
    if (this.data.recording) {
      try { wx.stopRecord({ fail: function () {} }) } catch (e) {}
    }
  },
  onDraft(e) {
    this.setData({ draft: e.detail.value })
  },
  onTopicDraft(e) {
    this.setData({ topicDraft: e.detail.value })
  },
  onStartTopic() {
    const title = String(this.data.topicDraft || '').trim()
    if (!title) {
      wx.showToast({ title: '请先输入课题原题', icon: 'none' })
      return
    }
    this.setData({
      displayTitle: title,
      lessonCode: '',
      course: { title: title, displayTitle: title },
      planning: true,
      topicDraft: ''
    })
    classroom.startOpenFlow(this, title)
  },
  onSend() {
    classroom.onSend(this)
  },
  onFollow(e) {
    classroom.onFollow(this, e.currentTarget.dataset.text)
  },
  onRetry() {
    classroom.onRetry(this, startPrompt(this.data.course, this.data.displayTitle))
  },
  onClear() {
    writeSession(OPEN_SESSION_ID, blankSession(''))
    this.setData({
      error: '',
      followUps: [],
      thread: [],
      steps: [],
      planning: false,
      displayTitle: '智学伴练',
      lessonCode: '',
      course: null,
      hint: ''
    })
    classroom.startOpenFlow(this)
  },
  onMicStart() {
    if (this.data.sending || this.data.recording) return
    this.setData({ recording: true })
    voice.startRecord().catch((err) => {
      this.setData({ recording: false })
      wx.showToast({ title: this.friendlyError(err), icon: 'none' })
    })
  },
  onMicEnd() {
    if (!this.data.recording) return
    this.setData({ recording: false })
    voice.stopRecord().then((text) => {
      this.setData({ draft: voice.appendDraft(this.data.draft, text) })
    }).catch((err) => {
      wx.showToast({ title: this.friendlyError(err), icon: 'none' })
    })
  },
  friendlyError(err) {
    const msg = (err && err.message) || '智学调用失败'
    if (msg.indexOf('wechat id config') >= 0) {
      return 'Zion 读不到微信小程序配置。请核对编辑器「登录设置 / 微信」与微信开发者工具 AppID 是否一致。'
    }
    if (msg.indexOf('invalid code') >= 0 || msg.indexOf('FAILED_TO_GET_MINI_APP_SESSION_KEY') >= 0) {
      return '微信登录 code 无效，请用微信开发者工具打开本小程序后再试。'
    }
    return msg
  }
})
