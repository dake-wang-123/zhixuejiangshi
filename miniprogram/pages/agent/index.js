const app = getApp()
const config = require('../../config.js')
const { chatWithCoze } = require('../../utils/agent.js')

const STORAGE_KEY = 'zhixue_messages'

Page({
  data: {
    messages: [],
    draft: '',
    sending: false,
    error: '',
    hint: '',
    scrollInto: ''
  },
  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 })
    }
    const messages = wx.getStorageSync(STORAGE_KEY) || []
    this.setData({
      messages: messages,
      hint: config.cozeBotId
        ? '对话走 Zion「异步」流程调用 Coze 智学。'
        : '请在 miniprogram/config.js 填入 Coze Bot ID，并在 Zion 编辑器把「异步」流程的智学 TPA 请求体绑好。'
    })
    const seed = wx.getStorageSync('agentSeed')
    if (seed) {
      wx.removeStorageSync('agentSeed')
      this.setData({ draft: seed })
    }
    this.scrollBottom()
  },
  onDraft(e) {
    this.setData({ draft: e.detail.value })
  },
  persist(messages) {
    wx.setStorageSync(STORAGE_KEY, messages)
  },
  scrollBottom() {
    const last = this.data.messages[this.data.messages.length - 1]
    this.setData({ scrollInto: last ? 'm-' + last.id : '' })
  },
  onClear() {
    wx.removeStorageSync(STORAGE_KEY)
    wx.removeStorageSync('zhixue_conversation')
    this.setData({ messages: [], error: '' })
  },
  onSend() {
    const text = (this.data.draft || '').trim()
    if (!text || this.data.sending) return
    const messages = this.data.messages.slice()
    const userMsg = { id: Date.now(), role: 'user', content: text }
    messages.push(userMsg)
    this.setData({ messages: messages, draft: '', sending: true, error: '' })
    this.persist(messages)
    this.scrollBottom()
    app.ensureLogin().then(() => {
      const account = app.globalData.account || {}
      const conversationId = wx.getStorageSync('zhixue_conversation') || ''
      return chatWithCoze(text, account.id, conversationId, app.getToken())
    }).then((result) => {
      if (result.conversationId) {
        wx.setStorageSync('zhixue_conversation', result.conversationId)
      }
      const reply = result.reply || '智学已收到，但没有返回可读文本。'
      const next = this.data.messages.concat([{
        id: Date.now() + 1,
        role: 'assistant',
        content: reply
      }])
      this.setData({ messages: next, sending: false })
      this.persist(next)
      this.scrollBottom()
    }).catch((err) => {
      const fail = this.data.messages.concat([{
        id: Date.now() + 1,
        role: 'assistant',
        content: this.friendlyError(err)
      }])
      this.setData({
        messages: fail,
        sending: false,
        error: this.friendlyError(err)
      })
      this.persist(fail)
      this.scrollBottom()
    })
  },
  friendlyError(err) {
    const msg = (err && err.message) || '智学调用失败'
    if (msg.indexOf('wechat id config') >= 0) {
      return '请先在 Zion 配置微信小程序 AppID，完成静默登录后再对话。'
    }
    if (msg.indexOf('operation_mu6ckpzl') >= 0 || msg.indexOf('Cannot query field') >= 0) {
      return '智学 TPA 尚未同步到运行时。请在 Zion 编辑器检查「智学」接口并同步后端。'
    }
    if (msg.indexOf('Did not provide value') >= 0 || msg.indexOf('required field') >= 0) {
      return '「异步」流程还没有绑好智学请求体。请在 Zion 把 Authorization、Content-Type 和 body 绑到 Coze /v3/chat。'
    }
    return msg
  }
})
