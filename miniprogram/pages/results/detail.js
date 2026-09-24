const app = getApp()
const results = require('../../utils/learn-results.js')
const history = require('../../utils/learn-history.js')
const { inferProgress, PENDING_LESSON_KEY } = require('../../utils/flow.js')
const { progressLabel, progressRatio } = require('../../utils/learn-records.js')
const favorites = require('../../utils/favorites.js')

Page({
  data: {
    lessonCode: '',
    topicTitle: '',
    loading: true,
    error: '',
    tabs: [],
    active: 'script',
    current: null,
    showCopy: false,
    progressText: '',
    percent: 0,
    starred: false
  },
  onLoad(query) {
    const lessonCode = decodeURIComponent(query.lessonCode || query.code || '')
    this.setData({
      lessonCode: lessonCode,
      topicTitle: decodeURIComponent(query.title || ''),
      starred: favorites.hasFavorite(lessonCode)
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
    const title = this.data.topicTitle
    this.setData({ loading: true, error: '' })
    return app.ensureLogin().then(() => {
      return Promise.all([
        results.listLesson(code, app.getToken()),
        history.listMessages(code, title, app.getToken()).catch(() => [])
      ])
    }).then((pair) => {
      const rows = pair[0]
      const messages = pair[1]
      const tabs = results.tabsFromRows(rows, this.data.topicTitle)
      const firstReady = tabs.filter((item) => item.ready)[0]
      const active = this.pickActive(tabs, this.data.active || (firstReady && firstReady.kind) || 'script')
      const topic = (firstReady && firstReady.topicTitle) || this.data.topicTitle || code
      const progress = inferProgress(history.rowsToSession(messages, topic).messages)
      this.setData({
        loading: false,
        topicTitle: topic,
        tabs: tabs,
        progressText: progressLabel(progress),
        percent: progressRatio(progress),
        starred: favorites.hasFavorite(code)
      })
      this.applyTab(active)
    }).catch((err) => {
      this.setData({
        loading: false,
        error: (err && err.message) || '读取学习记录失败'
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
  onStar() {
    const next = favorites.toggleFavorite({
      lessonCode: this.data.lessonCode,
      topicTitle: this.data.topicTitle
    })
    this.setData({ starred: next.on })
  },
  onContinue() {
    try {
      wx.setStorageSync(PENDING_LESSON_KEY, {
        lessonCode: this.data.lessonCode,
        title: this.data.topicTitle
      })
    } catch (e) {}
    wx.switchTab({ url: '/pages/agent/index' })
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
