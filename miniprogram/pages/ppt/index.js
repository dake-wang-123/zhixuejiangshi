const app = getApp()
const { graphqlRequest, eqBigint } = require('../../utils/graphql.js')
const { generatePpt, openPptUrl } = require('../../utils/agent.js')
const { lectureTextFromCourse, formatAnalysis } = require('../../utils/analysis.js')

const MY_PPTS = `
  query MyPpts($where: ppt_record_bool_exp) {
    ppt_record(where: $where, order_by: { created_at: desc }, limit: 40) {
      id title status file_url cover_url outline error_message created_at course_id
    }
  }
`

Page({
  data: {
    title: '',
    text: '',
    courseId: '',
    progress: '',
    submitting: false,
    loading: true,
    error: '',
    records: []
  },
  onLoad(query) {
    const title = decodeURIComponent(query.title || '')
    const courseId = query.courseId || query.id || ''
    const seed = wx.getStorageSync('pptSeed') || ''
    if (seed) wx.removeStorageSync('pptSeed')
    this.setData({
      title: title,
      courseId: courseId,
      text: seed
    })
    if (courseId && !seed) this.prefillFromCourse(courseId)
  },
  onShow() {
    this.load()
  },
  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh())
  },
  onTitle(e) {
    this.setData({ title: e.detail.value })
  },
  onText(e) {
    this.setData({ text: e.detail.value })
  },
  prefillFromCourse(courseId) {
    app.ensureLogin().then(() => {
      const q = `
        query CourseForPpt($id: bigint!) {
          course_by_pk(id: $id) { id title description ai_analysis }
        }
      `
      return graphqlRequest(q, { id: courseId }, app.getToken())
    }).then((data) => {
      const course = data.course_by_pk
      if (!course) return
      const analysis = formatAnalysis(course.ai_analysis)
      this.setData({
        title: this.data.title || course.title || '',
        text: this.data.text || lectureTextFromCourse(course, analysis)
      })
    }).catch(() => {})
  },
  load() {
    this.setData({ loading: true, error: '' })
    return app.ensureLogin().then(() => {
      const account = app.globalData.account || {}
      if (!account.id) throw new Error('请先完成微信登录')
      return graphqlRequest(MY_PPTS, { where: eqBigint('user_id', account.id) }, app.getToken())
    }).then((data) => {
      this.setData({
        records: data.ppt_record || [],
        loading: false
      })
    }).catch((err) => {
      this.setData({ loading: false, error: this.friendlyError(err) })
    })
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
  onSubmit() {
    if (this.data.submitting) return
    const title = (this.data.title || '').trim() || '家庭教育课件'
    const text = (this.data.text || '').trim()
    if (!text) {
      wx.showToast({ title: '请粘贴讲课稿或课程要点', icon: 'none' })
      return
    }
    this.setData({ submitting: true, progress: '正在登录…' })
    app.ensureLogin().then(() => {
      const account = app.globalData.account || {}
      if (!account.id) throw new Error('请先完成微信登录')
      return generatePpt({
        title: title,
        lecture_content: text,
        course_id: this.data.courseId,
        user_id: account.id
      }, app.getToken(), (msg) => this.setData({ progress: msg }))
    }).then((result) => {
      this.setData({ submitting: false, progress: '' })
      if (result.fileUrl) {
        wx.showToast({ title: '课件已生成' })
        openPptUrl(result.fileUrl)
      } else {
        wx.showToast({ title: result.errorMessage || '已记录，待下载', icon: 'none' })
      }
      return this.load()
    }).catch((err) => {
      this.setData({ submitting: false, progress: '' })
      wx.showToast({ title: err.message || '生成失败', icon: 'none' })
      return this.load()
    })
  },
  onOpen(e) {
    openPptUrl(e.currentTarget.dataset.url)
  },
  onCopy(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({ title: '已复制下载链接' })
    })
  }
})
