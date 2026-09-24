const app = getApp()
const results = require('../../utils/learn-results.js')

Page({
  data: {
    lessonCode: '',
    topicTitle: '',
    loading: true,
    error: '',
    tabs: [],
    active: 'script',
    current: null,
    showCopy: false
  },
  onLoad(query) {
    this.setData({
      lessonCode: decodeURIComponent(query.lessonCode || query.code || ''),
      topicTitle: decodeURIComponent(query.title || '')
    })
  },
  onShow() {
    this.load()
  },
  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh(), () => wx.stopPullDownRefresh())
  },
  load() {
    const code = this.data.lessonCode
    this.setData({ loading: true, error: '' })
    return app.ensureLogin().then(() => {
      return results.listLesson(code, app.getToken())
    }).then((rows) => {
      const tabs = results.tabsFromRows(rows, this.data.topicTitle)
      const firstReady = tabs.filter((item) => item.ready)[0]
      const active = this.pickActive(tabs, this.data.active || (firstReady && firstReady.kind) || 'script')
      const topic = (firstReady && firstReady.topicTitle) || this.data.topicTitle || code
      this.setData({
        loading: false,
        topicTitle: topic,
        tabs: tabs
      })
      this.applyTab(active)
    }).catch((err) => {
      this.setData({
        loading: false,
        error: (err && err.message) || '读取成果失败'
      })
    })
  },
  pickActive(tabs, preferred) {
    const hit = (tabs || []).filter((item) => item.kind === preferred && item.ready)[0]
    if (hit) return hit.kind
    const first = (tabs || []).filter((item) => item.ready)[0]
    return (first && first.kind) || preferred || 'script'
  },
  applyTab(kind) {
    const tabs = this.data.tabs || []
    const current = tabs.filter((item) => item.kind === kind)[0] || tabs[0] || null
    this.setData({
      active: kind,
      current: current,
      showCopy: !!(current && current.kind === 'outline' && current.ready)
    })
  },
  onTab(e) {
    const kind = e.currentTarget.dataset.kind
    if (!kind) return
    this.applyTab(kind)
  },
  onCopyOutline() {
    const current = this.data.current || {}
    const text = String(current.content || '').trim()
    if (!text) {
      wx.showToast({ title: '还没有 PPT 大纲', icon: 'none' })
      return
    }
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: '已复制 PPT 大纲' })
    })
  }
})
