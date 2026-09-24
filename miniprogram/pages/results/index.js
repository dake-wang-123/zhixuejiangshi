const app = getApp()
const results = require('../../utils/learn-results.js')

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
      return results.listResults(app.getToken())
    }).then((rows) => {
      const groups = results.groupByLesson(rows)
      this.setData({
        loading: false,
        groups: groups,
        empty: !groups.length
      })
    }).catch((err) => {
      this.setData({
        loading: false,
        error: (err && err.message) || '读取学习成果失败',
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
  }
})
