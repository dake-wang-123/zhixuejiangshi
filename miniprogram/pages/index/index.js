const app = getApp()
const config = require('../../config.js')
const { graphqlRequest, eqText } = require('../../utils/graphql.js')
const { getImageUrl } = require('../../utils/upload.js')
const { buildCozeCatalog } = require('../../utils/catalog.js')
const {
  listCategories,
  loadCachedCatalog,
  fetchCozeCatalog
} = require('../../utils/coze-catalog.js')
const { TOPIC_DRAFT_KEY } = require('../../utils/flow.js')

const COURSE_LIST = `
  query CourseList($where: course_bool_exp, $limit: Int) {
    course(where: $where, limit: $limit, order_by: { is_recommended: desc, created_at: desc }) {
      id
      title
      description
      price
      member_free
      source_type
      status
      is_recommended
      cover_id
      ai_analysis
      topic { id name }
      category_id { id name }
    }
  }
`

Page({
  data: {
    loading: true,
    refreshing: false,
    error: '',
    courses: [],
    sections: [],
    categories: [],
    activeCategory: '',
    totalCount: 0,
    matchedCount: 0,
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
  paintCatalog(courses, activeCategory) {
    const packed = buildCozeCatalog(courses, activeCategory)
    const cats = [{ id: '', name: '全部' }].concat(listCategories().map((name) => ({ id: name, name: name })))
    this.setData({
      courses: courses,
      totalCount: packed.catalogCount,
      matchedCount: packed.matchedCount,
      catalogCount: packed.catalogCount,
      categoryCount: packed.categoryCount,
      categories: cats,
      sections: packed.sections
    })
    return packed
  },
  load(forceRefresh) {
    const cached = loadCachedCatalog()
    const hasCache = cached.categories.length || cached.courses.length
    this.setData({
      loading: !hasCache,
      refreshing: !!hasCache,
      error: ''
    })
    if (hasCache) this.paintCatalog(this.data.courses, this.data.activeCategory)
    return app.ensureLogin().then(() => {
      const token = app.getToken()
      const account = app.globalData.account || {}
      const where = eqText('status', config.statusOnShelf)
      return graphqlRequest(COURSE_LIST, { where: where, limit: 200 }, token).then((data) => {
        const courses = data.course || []
        const tasks = courses.map((item) => {
          return getImageUrl(item.cover_id, token).then((url) => {
            item.coverUrl = url
            return item
          }).catch(() => item)
        })
        return Promise.all(tasks).then(() => {
          this.paintCatalog(courses, this.data.activeCategory)
          return fetchCozeCatalog(token, 'catalog-' + (account.id || 'guest'), { fresh: !!forceRefresh })
        }).then(() => {
          this.paintCatalog(this.data.courses, this.data.activeCategory)
          this.setData({ loading: false, refreshing: false, error: '' })
        })
      })
    }).catch((err) => {
      const packed = this.paintCatalog(this.data.courses, this.data.activeCategory)
      this.setData({
        loading: false,
        refreshing: false,
        error: packed.categoryCount || packed.catalogCount ? '' : this.friendlyError(err)
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
      return '当前身份无法读取课程，请完成微信静默登录后再下拉刷新。'
    }
    return msg
  },
  onCategory(e) {
    const id = e.currentTarget.dataset.id || ''
    this.setData({ activeCategory: id })
    this.paintCatalog(this.data.courses, id)
  },
  onOpen(e) {
    const dbId = e.currentTarget.dataset.id
    const title = e.currentTarget.dataset.title
    if (dbId) {
      wx.navigateTo({ url: '/pages/course/detail?id=' + dbId })
      return
    }
    if (typeof wx.setStorageSync === 'function') {
      wx.setStorageSync(TOPIC_DRAFT_KEY, title || '')
    }
    wx.switchTab({ url: '/pages/learn/index' })
  }
})
