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
        ? '对话走 Zion「智学对话」。密钥无效时：在编辑器项目密钥 coze_api_key 只填 Coze 个人访问令牌（不要加 Bearer），保存后同步后端。'
        : '请在 miniprogram/config.js 填入 Coze Bot ID。'
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
      return 'Zion 读不到微信小程序配置。请核对编辑器「登录设置 / 微信」与微信开发者工具 AppID 是否一致。'
    }
    if (msg.indexOf('invalid code') >= 0 || msg.indexOf('FAILED_TO_GET_MINI_APP_SESSION_KEY') >= 0) {
      return '微信登录 code 无效，请用微信开发者工具打开本小程序后再试。'
    }
    if (msg.indexOf('operation_mu6ckpzl') >= 0 || msg.indexOf('Cannot query field') >= 0) {
      return '智学 TPA 尚未同步到运行时。请在 Zion 编辑器检查「智学」接口并同步后端。'
    }
    if (msg.indexOf('密钥无效') >= 0 || msg.indexOf('4101') >= 0) {
      return '智学密钥无效。请在 Zion 项目密钥 coze_api_key 只填 Coze 个人访问令牌（不要加 Bearer），保存后执行同步后端。'
    }
    if (msg.indexOf('ACTION_FLOW_NOT_FOUND') >= 0 || msg.indexOf('Action flow not found') >= 0) {
      return '智学对话流程尚未同步到运行时。请在 Zion 执行「同步后端」后再试。'
    }
    if (msg.indexOf('Did not provide value') >= 0 || msg.indexOf('required field') >= 0) {
      return '智学请求体还没有绑完整。请检查 Actionflow「智学对话」的 Authorization 与 body。'
    }
    return msg
  }
})
