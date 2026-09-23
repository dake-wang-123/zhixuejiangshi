const app = getApp()
const classroom = require('../../utils/classroom.js')
const {
  ensureFlowSession,
  blankSession,
  writeSession,
  conversationScope,
  stableUserId
} = require('../../utils/session.js')
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
    topicDraft: '',
    thinking: false,
    thinkHint: '',
    waitSec: 0
  },
  sessionKey() {
    return conversationScope({
      lessonCode: this.data.lessonCode,
      title: this.data.course && (this.data.course.title || this.data.displayTitle)
    })
  },
  cozeUserId(account) {
    return stableUserId(account, this.sessionKey())
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
    if (pending) {
      this.setData({
        displayTitle: pending,
        lessonCode: lessonCode,
        course: { title: pending, displayTitle: pending, lessonCode: lessonCode }
      })
    }
    ensureFlowSession(this.sessionKey(), pending)
    voice.prepare().catch(() => {})
    app.ensureLogin().then(() => {
      if (pending) {
        this.setData({
          planning: true,
          hint: lessonCode ? ('正在把 ' + lessonCode + ' 课题发给智学…') : '正在把课题发给智学…'
        })
        return classroom.startOpenFlow(this, pending)
      }
      return classroom.startOpenFlow(this)
    }).catch((err) => {
      this.setData({ error: this.friendlyError(err), planning: false })
    })
  },
  onUnload() {
    classroom.stopLive(this)
    voice.cancel()
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
  onPlus() {
    classroom.onPlus(this)
  },
  onFollow(e) {
    classroom.onFollow(this, e.currentTarget.dataset.text)
  },
  onRetry() {
    classroom.onRetry(this, startPrompt(this.data.course, this.data.displayTitle))
  },
  onClear() {
    classroom.stopLive(this)
    voice.cancel()
    const page = this
    const afterClear = function () {
      writeSession(page.sessionKey(), blankSession(''))
      page.setData({
        error: '',
        followUps: [],
        thread: [],
        steps: [],
        planning: false,
        displayTitle: '智学伴练',
        lessonCode: '',
        course: null,
        hint: '',
        thinking: false,
        thinkHint: '',
        waitSec: 0
      })
      classroom.startOpenFlow(page)
    }
    classroom.clearHistory(this).then(afterClear, afterClear)
  },
  onMicTap() {
    if (this.data.sending) return
    if (this.data.recording) {
      voice.end().then((text) => {
        this.setData({
          recording: false,
          draft: voice.appendDraft(this.data.draft, text)
        })
      }).catch((err) => {
        this.setData({ recording: false })
        wx.showToast({ title: voice.friendlyVoiceError(err), icon: 'none' })
      })
      return
    }
    const base = this.data.draft || ''
    this._voiceBase = base
    voice.begin({
      onPartial: (text) => {
        this.setData({ draft: voice.appendDraft(this._voiceBase || '', text) })
      }
    }).then(() => {
      this.setData({ recording: true })
    }).catch((err) => {
      this.setData({ recording: false })
      wx.showToast({ title: voice.friendlyVoiceError(err), icon: 'none' })
    })
  },
  onMicStart() {},
  onMicEnd() {},
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
