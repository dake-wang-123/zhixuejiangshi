const app = getApp()
const config = require('../../config.js')
const { graphqlRequest, eqBigint } = require('../../utils/graphql.js')
const { uploadFile } = require('../../utils/upload.js')
const { parseLessonPlan } = require('../../utils/agent.js')
const { formatAnalysis } = require('../../utils/analysis.js')

const MY_PLANS = `
  query MyPlans($where: course_bool_exp) {
    course(where: $where, order_by: { created_at: desc }, limit: 40) {
      id title description status source_type original_file_id ai_analysis created_at
      topic { id name }
    }
  }
`

Page({
  data: {
    title: '',
    text: '',
    fileName: '',
    filePath: '',
    progress: '',
    submitting: false,
    loading: true,
    error: '',
    plans: []
  },
  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
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
  load() {
    this.setData({ loading: true, error: '' })
    return app.ensureLogin().then(() => {
      const account = app.globalData.account || {}
      if (!account.id) throw new Error('请先完成微信登录')
      return graphqlRequest(MY_PLANS, { where: eqBigint('uploader_id', account.id) }, app.getToken())
    }).then((data) => {
      const plans = (data.course || []).map((item) => {
        const view = formatAnalysis(item.ai_analysis) || { summaryText: '', chapters: [], tags: [] }
        item.view = view
        item.hasAnalysis = !!(view.summaryText || (view.chapters && view.chapters.length) || (view.tags && view.tags.length))
        return item
      })
      this.setData({ plans: plans, loading: false })
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
  onChoose() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      success: (res) => {
        const file = (res.tempFiles || [])[0]
        if (!file) return
        const name = file.name || '教案'
        this.setData({
          fileName: name,
          filePath: file.path,
          title: this.data.title || name.replace(/\.[^.]+$/, '')
        })
        this.tryReadText(file.path, name)
      }
    })
  },
  tryReadText(filePath, name) {
    const lower = (name || '').toLowerCase()
    if (!(/\.(txt|md|markdown)$/).test(lower)) return
    const fs = wx.getFileSystemManager()
    try {
      const content = fs.readFileSync(filePath, 'utf8')
      if (content && !this.data.text) {
        this.setData({ text: String(content).slice(0, 20000) })
      }
    } catch (e) {
      // binary or encoding mismatch — user can paste
    }
  },
  onSubmit() {
    if (this.data.submitting) return
    const title = (this.data.title || '').trim()
    if (!title) {
      wx.showToast({ title: '请填写教案标题', icon: 'none' })
      return
    }
    if (!this.data.filePath && !(this.data.text || '').trim()) {
      wx.showToast({ title: '请上传文件或粘贴全文', icon: 'none' })
      return
    }
    this.setData({ submitting: true, progress: '正在登录…' })
    app.ensureLogin().then(() => {
      const account = app.globalData.account || {}
      const token = app.getToken()
      if (!account.id) throw new Error('请先完成微信登录')
      const start = this.data.filePath
        ? this.uploadAndCreate(title, account, token)
        : this.createCourse(title, account, token, null)
      return start.then((course) => this.parseIfNeeded(course, token))
    }).then(() => {
      this.setData({
        submitting: false,
        progress: '',
        title: '',
        text: '',
        fileName: '',
        filePath: ''
      })
      wx.showToast({ title: '教案已提交' })
      return this.load()
    }).catch((err) => {
      this.setData({ submitting: false, progress: '' })
      wx.showToast({ title: err.message || '提交失败', icon: 'none' })
    })
  },
  uploadAndCreate(title, account, token) {
    this.setData({ progress: '正在上传教案文件…' })
    return uploadFile(this.data.filePath, this.data.fileName || title, token).then((fileId) => {
      return this.createCourse(title, account, token, fileId)
    })
  },
  createCourse(title, account, token, fileId) {
    this.setData({ progress: '正在写入课程记录…' })
    const mutation = `
      mutation CreatePlan($object: course_insert_input!) {
        insert_course_one(object: $object) { id title status }
      }
    `
    const object = {
      title: title,
      description: (this.data.text || '').trim().slice(0, 200),
      price: 0,
      member_free: true,
      source_type: config.sourceLecturer,
      status: (this.data.text || '').trim() ? config.statusParsing : config.statusDraft,
      uploader_id: account.id
    }
    if (fileId) object.original_file_id = fileId
    return graphqlRequest(mutation, { object: object }, token).then((data) => data.insert_course_one)
  },
  parseIfNeeded(course, token) {
    const fullText = (this.data.text || '').trim()
    if (!fullText) return course
    return this.runParse(course.id, fullText, token)
  },
  runParse(courseId, fullText, token) {
    this.setData({ progress: '智能体正在拆教案…' })
    return parseLessonPlan(fullText, token, (msg) => this.setData({ progress: msg })).then((parsed) => {
      this.setData({ progress: '正在写回解析结果…' })
      const summaryText = (parsed.summary && (parsed.summary.summary || parsed.summary.text)) || ''
      const mutation = `
        mutation SaveAnalysis($id: bigint!, $set: course_set_input!) {
          update_course_by_pk(pk_columns: { id: $id }, _set: $set) { id status }
        }
      `
      return graphqlRequest(mutation, {
        id: courseId,
        set: {
          ai_analysis: parsed,
          description: summaryText || undefined,
          status: config.statusDraft
        }
      }, token)
    })
  },
  onReparse(e) {
    const id = e.currentTarget.dataset.id
    const text = (this.data.text || '').trim()
    if (!text) {
      wx.showToast({ title: '请先在上方粘贴教案全文', icon: 'none' })
      return
    }
    this.setData({ submitting: true, progress: '重新解析…' })
    app.ensureLogin()
      .then(() => this.runParse(id, text, app.getToken()))
      .then(() => {
        this.setData({ submitting: false, progress: '' })
        wx.showToast({ title: '已更新解析' })
        return this.load()
      })
      .catch((err) => {
        this.setData({ submitting: false, progress: '' })
        wx.showToast({ title: err.message || '解析失败', icon: 'none' })
      })
  },
  onOpen(e) {
    wx.navigateTo({ url: '/pages/course/detail?id=' + e.currentTarget.dataset.id })
  }
})
