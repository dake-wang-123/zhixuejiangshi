const app = getApp()
const { graphqlRequest, eqBigint } = require('../../utils/graphql.js')
const { isAdmin } = require('../../utils/admin.js')
const { accountView, membershipView } = require('../../utils/account-view.js')
const records = require('../../utils/learn-records.js')
const { listFavorites } = require('../../utils/favorites.js')

Page({
  data: {
    profile: { name: '家庭教育讲师', avatar: '', phone: '' },
    account: null,
    loginError: '',
    vip: { active: false, label: '未开通', sub: '开通后可免费学习会员课' },
    recordCount: 0,
    recordPreview: '',
    favoriteCount: 0,
    isAdmin: false
  },
  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
    this.refresh()
  },
  refresh() {
    this.setData({ favoriteCount: listFavorites().length })
    app.ensureLogin().then(() => {
      const account = app.globalData.account
      this.setData({
        account: account,
        profile: accountView(account),
        loginError: '',
        isAdmin: isAdmin(account)
      })
      return this.loadExtras()
    }).catch((err) => {
      this.setData({
        account: null,
        profile: { name: '未登录', avatar: '', phone: '' },
        loginError: this.friendlyError(err)
      })
    })
  },
  friendlyError(err) {
    const msg = (err && err.message) || '登录失败'
    if (msg.indexOf('wechat id config') >= 0) {
      return 'Zion 读不到微信小程序配置。请核对编辑器「登录设置 / 微信」里的 AppID、AppSecret。'
    }
    if (msg.indexOf('invalid code') >= 0 || msg.indexOf('FAILED_TO_GET_MINI_APP_SESSION_KEY') >= 0) {
      return '微信登录 code 无效。请用微信开发者工具打开后再试。'
    }
    return msg
  },
  loadExtras() {
    const account = app.globalData.account || {}
    const token = app.getToken()
    if (!account.id) return Promise.resolve()
    const q = `
      query MineMember($memberWhere: user_membership_bool_exp) {
        user_membership(where: $memberWhere, limit: 1, order_by: { expire_time: desc }) {
          id expire_time status level
        }
      }
    `
    return graphqlRequest(q, {
      memberWhere: eqBigint('user_id', account.id)
    }, token).then((data) => {
      this.setData({
        vip: membershipView((data.user_membership || [])[0] || null)
      })
      return records.listStudyRecords(token)
    }).then((list) => {
      const first = (list || [])[0]
      this.setData({
        recordCount: (list || []).length,
        recordPreview: first ? (first.lessonCode + ' · ' + first.progressText) : ''
      })
    }).catch(() => {})
  },
  onRecords() {
    wx.navigateTo({ url: '/pages/results/index' })
  },
  onFavorites() {
    wx.navigateTo({ url: '/pages/favorites/index' })
  },
  onVip() {
    wx.navigateTo({ url: '/pages/vip/index' })
  },
  onHelp() {
    wx.navigateTo({ url: '/pages/help/index' })
  },
  onAbout() {
    wx.navigateTo({ url: '/pages/about/index' })
  },
  onRelogin() {
    app.relLogin().then(() => this.refresh()).catch(() => this.refresh())
  }
})
