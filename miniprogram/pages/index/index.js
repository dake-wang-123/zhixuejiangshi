const app = getApp()
const { graphqlRequest } = require('../../utils/graphql.js')
const { buildOfficialCatalog, listOfficialCategories } = require('../../utils/official-catalog.js')
const { PENDING_TOPIC_KEY, PENDING_LESSON_KEY } = require('../../utils/flow.js')
const personal = require('../../utils/personal-plan.js')
const { friendlyError } = require('../../utils/errors.js')

const CATALOG_LIST = `
  query CourseCatalog($limit: Int) {
    course_catalog(limit: $limit, order_by: { category_sort: asc, seq: asc }) {
      id
      category
      category_sort
      lesson_code
      seq
      title
    }
  }
`

Page({
  data: {
    loading: true,
    refreshing: false,
    error: '',
    rows: [],
    sections: [],
    categories: [],
    activeCategory: '',
    catalogCount: 0,
    categoryCount: 0,
    planOpen: false,
    planTitle: '',
    planText: '',
    planFileName: '',
    planSubmitting: false
  },
  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
    this.load(false)
  },
  onPullDownRefresh() {
    this.load(true).then(() => wx.stopPullDownRefresh())
  },
  paintCatalog(rows, activeCategory) {
    const packed = buildOfficialCatalog(rows, activeCategory)
    const cats = [{ id: '', name: '全部' }].concat(listOfficialCategories(rows))
    this.setData({
      rows: packed.rows,
      catalogCount: packed.catalogCount,
      categoryCount: packed.categoryCount,
      categories: cats,
      sections: packed.sections
    })
    return packed
  },
  load(forceRefresh) {
    const hasRows = !!(this.data.rows && this.data.rows.length)
    const preview = this.paintCatalog(this.data.rows, this.data.activeCategory)
    this.setData({
      loading: !preview.catalogCount,
      refreshing: !!hasRows || !!forceRefresh,
      error: ''
    })
    return app.ensureLogin().then(() => {
      return graphqlRequest(CATALOG_LIST, { limit: 100 }, app.getToken())
    }).then((data) => {
      const rows = data.course_catalog || []
      const packed = this.paintCatalog(rows, this.data.activeCategory)
      this.setData({
        loading: false,
        refreshing: false,
        error: packed.catalogCount ? '' : '课程目录还是空的，请下拉刷新。'
      })
    }).catch((err) => {
      const packed = this.paintCatalog(this.data.rows, this.data.activeCategory)
      this.setData({
        loading: false,
        refreshing: false,
        error: packed.catalogCount ? '' : this.friendlyError(err)
      })
    })
  },
  friendlyError(err) {
    return friendlyError(err, '加载失败')
  },
  onCategory(e) {
    const id = e.currentTarget.dataset.id || ''
    this.setData({ activeCategory: id })
    this.paintCatalog(this.data.rows, id)
  },
  onOpen(e) {
    const title = e.currentTarget.dataset.title || ''
    const code = e.currentTarget.dataset.code || ''
    if (!title) {
      wx.showToast({ title: '缺少课程标题', icon: 'none' })
      return
    }
    try {
      wx.setStorageSync(PENDING_TOPIC_KEY, title)
      wx.setStorageSync(PENDING_LESSON_KEY, { lessonCode: code, title: title })
    } catch (err) {}
    wx.switchTab({ url: '/pages/agent/index' })
  },
  onOpenPlan() {
    this.setData({ planOpen: true })
  },
  onClosePlan() {
    this.setData({ planOpen: false })
  },
  onPlanTitle(e) {
    this.setData({ planTitle: e.detail.value })
  },
  onPlanText(e) {
    this.setData({ planText: e.detail.value })
  },
  onPickPlan() {
    const page = this
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      success: (res) => {
        const file = (res.tempFiles || [])[0]
        if (!file) return
        const name = file.name || '教案'
        page.setData({
          planFileName: name,
          planTitle: page.data.planTitle || name.replace(/\.[^.]+$/, '')
        })
        personal.readPlainFile(file.path, name).then((text) => {
          page.setData({
            planText: String(text).slice(0, 12000),
            planTitle: page.data.planTitle || personal.inferTitle(text, name)
          })
        }).catch((err) => {
          wx.showToast({ title: err.message || '请改成粘贴正文', icon: 'none' })
        })
      }
    })
  },
  onSubmitPlan() {
    if (this.data.planSubmitting) return
    const text = String(this.data.planText || '').trim()
    if (!text) {
      wx.showToast({ title: '请先粘贴教案正文', icon: 'none' })
      return
    }
    const title = String(this.data.planTitle || '').trim() || personal.inferTitle(text, this.data.planFileName)
    const packed = personal.rememberPending({ title: title, text: text })
    try {
      wx.setStorageSync(PENDING_TOPIC_KEY, packed.title)
      wx.setStorageSync(PENDING_LESSON_KEY, {
        lessonCode: packed.lessonCode,
        title: packed.title,
        source: 'personal'
      })
    } catch (e) {}
    this.setData({
      planSubmitting: false,
      planOpen: false,
      planTitle: '',
      planText: '',
      planFileName: ''
    })
    wx.switchTab({ url: '/pages/agent/index' })
  }
})
