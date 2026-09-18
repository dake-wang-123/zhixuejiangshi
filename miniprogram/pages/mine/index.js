const app = getApp()
const { graphqlRequest, eqBigint } = require('../../utils/graphql.js')

Page({
  data: {
    account: null,
    loginError: '',
    educationYears: '',
    membership: null,
    feedback: '',
    saving: false,
    sending: false
  },
  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 4 })
    }
    this.refresh()
  },
  refresh() {
    app.ensureLogin().then(() => {
      this.setData({
        account: app.globalData.account,
        loginError: ''
      })
      return this.loadExtras()
    }).catch((err) => {
      this.setData({
        account: null,
        loginError: this.friendlyError(err)
      })
    })
  },
  friendlyError(err) {
    const msg = (err && err.message) || '登录失败'
    if (msg.indexOf('wechat id config') >= 0) {
      return 'Zion 读不到微信小程序配置。请核对编辑器「登录设置 / 微信」里的 AppID、AppSecret 是否与微信开发者工具一致。'
    }
    if (msg.indexOf('invalid code') >= 0 || msg.indexOf('FAILED_TO_GET_MINI_APP_SESSION_KEY') >= 0) {
      return '微信登录 code 无效。请用微信开发者工具打开本小程序，确保 AppID 为 wx0277d4abe92dd8a3 后再试。'
    }
    return msg
  },
  loadExtras() {
    const account = app.globalData.account || {}
    const token = app.getToken()
    if (!account.id) return Promise.resolve()
    const q = `
      query Mine($profileWhere: user_profile_bool_exp, $memberWhere: user_membership_bool_exp) {
        user_profile(where: $profileWhere, limit: 1) {
          id education_years
        }
        user_membership(where: $memberWhere, limit: 1, order_by: { expire_time: desc }) {
          id expire_time status level
        }
      }
    `
    return graphqlRequest(q, {
      profileWhere: eqBigint('user_id', account.id),
      memberWhere: eqBigint('user_id', account.id)
    }, token).then((data) => {
      const profile = (data.user_profile || [])[0]
      const membership = (data.user_membership || [])[0] || null
      this.setData({
        educationYears: profile && profile.education_years != null ? String(profile.education_years) : '',
        membership: membership
      })
    }).catch(() => {})
  },
  onYears(e) {
    this.setData({ educationYears: e.detail.value })
  },
  onFeedback(e) {
    this.setData({ feedback: e.detail.value })
  },
  onSaveProfile() {
    const years = Number(this.data.educationYears)
    if (!years && years !== 0) {
      wx.showToast({ title: '请填写从业年限', icon: 'none' })
      return
    }
    this.setData({ saving: true })
    app.ensureLogin().then(() => {
      const account = app.globalData.account
      const token = app.getToken()
      const mutation = `
        mutation UpsertProfile($object: user_profile_insert_input!, $onConflict: user_profile_on_conflict) {
          insert_user_profile_one(object: $object, on_conflict: $onConflict) { id education_years }
        }
      `
      return graphqlRequest(mutation, {
        object: { user_id: account.id, education_years: years },
        onConflict: {
          constraint: 'user_profile_user_id_key',
          update_columns: ['education_years']
        }
      }, token)
    }).then(() => {
      this.setData({ saving: false })
      wx.showToast({ title: '资料已保存' })
    }).catch((err) => {
      this.setData({ saving: false })
      wx.showToast({ title: err.message || '保存失败', icon: 'none' })
    })
  },
  onSendFeedback() {
    const content = (this.data.feedback || '').trim()
    if (!content) {
      wx.showToast({ title: '请填写反馈内容', icon: 'none' })
      return
    }
    this.setData({ sending: true })
    app.ensureLogin().then(() => {
      const account = app.globalData.account
      const mutation = `
        mutation SendFeedback($object: feedback_insert_input!) {
          insert_feedback_one(object: $object) { id }
        }
      `
      return graphqlRequest(mutation, {
        object: {
          content: content,
          handle_status: '待处理',
          user_id_id: account.id
        }
      }, app.getToken())
    }).then(() => {
      this.setData({ sending: false, feedback: '' })
      wx.showToast({ title: '已提交反馈' })
    }).catch((err) => {
      this.setData({ sending: false })
      wx.showToast({ title: err.message || '提交失败', icon: 'none' })
    })
  },
  onRelogin() {
    app.relLogin().then(() => this.refresh()).catch(() => this.refresh())
  }
})
