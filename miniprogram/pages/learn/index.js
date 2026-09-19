const app = getApp()
const { graphqlRequest, eqBigint } = require('../../utils/graphql.js')
const { getImageUrl } = require('../../utils/upload.js')
const { decorateStudyRow, groupByCategory } = require('../../utils/catalog.js')

Page({
  data: {
    sections: [],
    loading: true,
    error: ''
  },
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
              id title description price status cover_id ai_analysis
              category_id { id name }
            }
          }
          course_category(order_by: { sort_order: asc }) {
            id name sort_order
          }
        }
      `
      return graphqlRequest(q, { where: eqBigint('user_id', account.id) }, token)
    }).then((data) => {
      const rows = data.study_record || []
      const categories = data.course_category || []
      const token = app.getToken()
      return Promise.all(rows.map((row) => {
        const course = row.course || {}
        return getImageUrl(course.cover_id, token).then((url) => {
          row.coverUrl = url
          return decorateStudyRow(row, categories)
        }).catch(() => decorateStudyRow(row, categories))
      })).then((list) => {
        const visible = list.filter((row) => row.course && row.course.id)
        this.setData({
          sections: groupByCategory(visible, categories, 0),
          loading: false
        })
      })
    }).catch((err) => this.setData({ loading: false, error: this.friendlyError(err) }))
  },
  friendlyError(err) {
    const msg = (err && err.message) || '加载失败'
    if (msg.indexOf('wechat id config') >= 0) {
      return 'Zion 读不到微信小程序配置。请核对编辑器「登录设置 / 微信」与微信开发者工具 AppID 是否一致。'
    }
    if (msg.indexOf('invalid code') >= 0 || msg.indexOf('FAILED_TO_GET_MINI_APP_SESSION_KEY') >= 0) {
      return '微信登录 code 无效，请用微信开发者工具打开本小程序后再试。'
    }
    return msg
  },
  onOpen(e) {
    const id = e.currentTarget.dataset.id
    const step = e.currentTarget.dataset.step
    wx.navigateTo({ url: '/pages/course/detail?id=' + id + '&step=' + (step || 0) })
  },
  onAsk(e) {
    const title = e.currentTarget.dataset.title
    wx.setStorageSync('agentSeed', '我正在自学《' + title + '》，请按我上次停下的步骤继续带备课本段要点。')
    wx.switchTab({ url: '/pages/agent/index' })
  },
  onBrowse() {
    wx.switchTab({ url: '/pages/index/index' })
  }
})
