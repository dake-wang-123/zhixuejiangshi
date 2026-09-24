const app = getApp()
const records = require('../../utils/learn-records.js')
const favorites = require('../../utils/favorites.js')
const { PENDING_LESSON_KEY } = require('../../utils/flow.js')

Page({
  data: {
    loading: true,
    error: '',
    groups: [],
    empty: false
  },
  onShow() {
    this.load()
  },
  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh(), () => wx.stopPullDownRefresh())
  },
  load() {
    this.setData({ loading: true, error: '' })
    return app.ensureLogin().then(() => {
      return records.listStudyRecords(app.getToken())
    }).then((groups) => {
      const list = (groups || []).map((item) => Object.assign({}, item, {
        starred: favorites.hasFavorite(item.lessonCode)
      }))
      this.setData({
        loading: false,
        groups: list,
        empty: !list.length
      })
    }).catch((err) => {
      this.setData({
        loading: false,
        error: (err && err.message) || '读取学习记录失败',
        empty: false
      })
    })
  },
  onOpen(e) {
    const code = e.currentTarget.dataset.code || ''
    const title = e.currentTarget.dataset.title || ''
    wx.navigateTo({
      url: '/pages/results/detail?lessonCode=' + encodeURIComponent(code) + '&title=' + encodeURIComponent(title)
    })
  },
  onStar(e) {
    const code = e.currentTarget.dataset.code || ''
    const title = e.currentTarget.dataset.title || ''
    favorites.toggleFavorite({ lessonCode: code, topicTitle: title })
    this.load()
  },
  onContinue(e) {
    const code = e.currentTarget.dataset.code || ''
    const title = e.currentTarget.dataset.title || ''
    try {
      wx.setStorageSync(PENDING_LESSON_KEY, { lessonCode: code, title: title })
    } catch (err) {}
    wx.switchTab({ url: '/pages/agent/index' })
  }
})
