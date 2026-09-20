const app = getApp()
const classroom = require('../../utils/classroom.js')
const { ensureFlowSession, OPEN_SESSION_ID } = require('../../utils/session.js')
const { openStartPrompt } = require('../../utils/flow.js')
const voice = require('../../utils/voice.js')

Page({
  data: {
    course: null,
    displayTitle: '智学伴练',
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
    conversationId: ''
  },
  sessionKey() {
    return OPEN_SESSION_ID
  },
  cozeUserId(account) {
    return 'learn-' + (account.id || 'guest') + '-open'
  },
  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 })
    }
    ensureFlowSession(OPEN_SESSION_ID, false)
    app.ensureLogin().then(() => classroom.startOpenFlow(this)).catch((err) => {
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
  onSend() {
    classroom.onSend(this)
  },
  onFollow(e) {
    classroom.onFollow(this, e.currentTarget.dataset.text)
  },
  onStepBar(e) {
    classroom.onStepBar(this, e.detail.index)
  },
  onRetry() {
    classroom.onRetry(this, openStartPrompt())
  },
  onComplete() {
    classroom.onComplete(this)
  },
  onBackLive() {
    const session = require('../../utils/session.js').readSession(this.sessionKey())
    classroom.paint(this, session || {}, classroom.liveIndexOf(session || {}))
  },
  onClear() {
    const session = require('../../utils/session.js')
    session.writeSession(OPEN_SESSION_ID, session.blankSession(false))
    this.setData({ error: '', followUps: [], thread: [], planning: true })
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
