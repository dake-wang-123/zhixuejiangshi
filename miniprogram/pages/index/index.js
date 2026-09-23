const app = getApp()
const { graphqlRequest } = require('../../utils/graphql.js')
const { buildOfficialCatalog, listOfficialCategories } = require('../../utils/official-catalog.js')
const { PENDING_TOPIC_KEY, PENDING_LESSON_KEY } = require('../../utils/flow.js')

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
    categoryCount: 0
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
    const msg = (err && err.message) || '加载失败'
    if (msg.indexOf('wechat id config') >= 0) {
      return 'Zion 读不到微信小程序配置。请核对编辑器「登录设置 / 微信」与微信开发者工具 AppID 是否一致。'
    }
    if (msg.indexOf('invalid code') >= 0 || msg.indexOf('FAILED_TO_GET_MINI_APP_SESSION_KEY') >= 0) {
      return '微信登录 code 无效，请用微信开发者工具打开本小程序后再下拉刷新。'
    }
    if (msg.indexOf('未登录') >= 0 || msg.indexOf('无访问权限') >= 0) {
      return '当前身份无法读取课程目录，请完成登录后再下拉刷新。'
    }
    return msg
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
  }
})
