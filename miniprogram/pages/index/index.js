const app = getApp()
const config = require('../../config.js')
const { graphqlRequest, eqText } = require('../../utils/graphql.js')
const { getImageUrl } = require('../../utils/upload.js')

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
      topic { id name }
      category_id { id name }
    }
    course_category(order_by: { sort_order: asc }) {
      id
      name
      sort_order
    }
  }
`

Page({
  data: {
    loading: true,
    error: '',
    courses: [],
    visibleCourses: [],
    categories: [],
    activeCategory: 0
  },
  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
    this.load()
  },
  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh())
  },
  load() {
    this.setData({ loading: true, error: '' })
    return app.ensureLogin().then(() => {
      const token = app.getToken()
      const where = eqText('status', config.statusOnShelf)
      return graphqlRequest(COURSE_LIST, { where: where, limit: 50 }, token)
    }).then((data) => {
      const categories = data.course_category || []
      const courses = data.course || []
      const token = app.getToken()
      const tasks = courses.map((item) => {
        return getImageUrl(item.cover_id, token).then((url) => {
          item.coverUrl = url
          return item
        }).catch(() => item)
      })
      return Promise.all(tasks).then(() => {
        this.setData({
          loading: false,
          courses: courses,
          categories: [{ id: 0, name: '全部' }].concat(categories),
          visibleCourses: courses
        })
      })
    }).catch((err) => {
      this.setData({
        loading: false,
        error: this.friendlyError(err)
      })
    })
  },
  friendlyError(err) {
    const msg = (err && err.message) || '加载失败'
    if (msg.indexOf('wechat id config') >= 0) {
      return 'Zion 尚未配置微信小程序 AppID，请在 Zion 编辑器「登录设置 / 微信」中绑定小程序。'
    }
    if (msg.indexOf('未登录') >= 0 || msg.indexOf('无访问权限') >= 0) {
      return '当前身份无法读取课程，请完成微信静默登录后再下拉刷新。'
    }
    return msg
  },
  onCategory(e) {
    const id = Number(e.currentTarget.dataset.id)
    const visible = !id
      ? this.data.courses
      : this.data.courses.filter((item) => item.category_id && Number(item.category_id.id) === id)
    this.setData({ activeCategory: id, visibleCourses: visible })
  },
  onOpen(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/course/detail?id=' + id })
  }
})
