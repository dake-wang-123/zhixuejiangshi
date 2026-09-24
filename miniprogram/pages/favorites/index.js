const { listFavorites, toggleFavorite } = require('../../utils/favorites.js')

Page({
  data: {
    list: [],
    empty: true
  },
  onShow() {
    this.refresh()
  },
  refresh() {
    const list = listFavorites()
    this.setData({ list: list, empty: !list.length })
  },
  onOpen(e) {
    const code = e.currentTarget.dataset.code || ''
    const title = e.currentTarget.dataset.title || ''
    wx.navigateTo({
      url: '/pages/results/detail?lessonCode=' + encodeURIComponent(code) + '&title=' + encodeURIComponent(title)
    })
  },
  onRemove(e) {
    toggleFavorite({
      lessonCode: e.currentTarget.dataset.code,
      topicTitle: e.currentTarget.dataset.title
    })
    this.refresh()
  }
})
