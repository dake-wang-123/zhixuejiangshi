const app = getApp()
const { graphqlRequest, eqBigint } = require('../../utils/graphql.js')
const { getImageUrl } = require('../../utils/upload.js')

Page({
  data: { list: [], loading: true, error: '' },
  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
    this.load()
  },
  load() {
    this.setData({ loading: true, error: '' })
    app.ensureLogin().then(() => {
      const account = app.globalData.account || {}
      const token = app.getToken()
      const q = `
        query MyLearning($where: study_record_bool_exp) {
          study_record(where: $where, order_by: { updated_at: desc }) {
            id progress
            course {
              id title description price status cover_id
              category_id { id name }
            }
          }
        }
      `
      return graphqlRequest(q, { where: eqBigint('user_id', account.id) }, token)
    }).then((data) => {
      const rows = data.study_record || []
      const token = app.getToken()
      return Promise.all(rows.map((row) => {
        const course = row.course || {}
        return getImageUrl(course.cover_id, token).then((url) => {
          row.coverUrl = url
          row.percent = Math.round(Number(row.progress || 0) * (Number(row.progress || 0) <= 1 ? 100 : 1))
          return row
        }).catch(() => row)
      }))
    }).then((list) => this.setData({ list: list, loading: false }))
      .catch((err) => this.setData({ loading: false, error: this.friendlyError(err) }))
  },
  friendlyError(err) {
    const msg = (err && err.message) || '加载失败'
    if (msg.indexOf('wechat id config') >= 0) {
      return 'Zion 尚未配置微信小程序 AppID，请在编辑器「登录设置 / 微信」中绑定后重试。'
    }
    return msg
  },
  onOpen(e) {
    wx.navigateTo({ url: '/pages/course/detail?id=' + e.currentTarget.dataset.id })
  },
  onAsk(e) {
    const title = e.currentTarget.dataset.title
    wx.setStorageSync('agentSeed', '我正在自学《' + title + '》，请用智学助手带我做讲师备课演练。')
    wx.switchTab({ url: '/pages/agent/index' })
  }
})
