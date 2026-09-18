const app = getApp()
const { graphqlRequest, eqBigint, andWhere } = require('../../utils/graphql.js')
const { getImageUrl } = require('../../utils/upload.js')
const { formatAnalysis } = require('../../utils/analysis.js')

Page({
  data: {
    id: '',
    course: null,
    coverUrl: '',
    loading: true,
    error: '',
    enrolled: false,
    studyId: '',
    percent: 0,
    analysis: null
  },
  onLoad(query) {
    this.setData({ id: query.id })
    this.load()
  },
  load() {
    const id = this.data.id
    this.setData({ loading: true, error: '' })
    return app.ensureLogin().then(() => {
      const token = app.getToken()
      const account = app.globalData.account || {}
      const q = `
        query CourseDetail($id: bigint!, $studyWhere: study_record_bool_exp) {
          course_by_pk(id: $id) {
            id title description price member_free source_type status is_recommended cover_id
            original_file_id ai_analysis
            topic { id name description }
            category_id { id name }
            direction { id name }
            expertise { id name }
          }
          study_record(where: $studyWhere, limit: 1) { id progress }
        }
      `
      const studyWhere = andWhere([
        eqBigint('course_id', id),
        eqBigint('user_id', account.id)
      ])
      return graphqlRequest(q, { id: id, studyWhere: studyWhere }, token)
    }).then((data) => {
      const course = data.course_by_pk
      if (!course) throw new Error('课程不存在或无权查看')
      const study = (data.study_record || [])[0]
      const progress = study ? Number(study.progress || 0) : 0
      const percent = Math.round(progress * (progress <= 1 ? 100 : 1))
      this.setData({
        course: course,
        analysis: formatAnalysis(course.ai_analysis),
        enrolled: !!study,
        studyId: study ? study.id : '',
        percent: percent,
        loading: false
      })
      return getImageUrl(course.cover_id, app.getToken()).then((url) => this.setData({ coverUrl: url }))
    }).catch((err) => this.setData({ loading: false, error: this.friendlyError(err) }))
  },
  friendlyError(err) {
    const msg = (err && err.message) || '加载失败'
    if (msg.indexOf('wechat id config') >= 0) {
      return 'Zion 尚未配置微信小程序 AppID，请在编辑器「登录设置 / 微信」中绑定后重试。'
    }
    return msg
  },
  onEnroll() {
    const account = app.globalData.account
    if (!account || !account.id) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }
    wx.showLoading({ title: '加入学习' })
    const token = app.getToken()
    const mutation = `
      mutation Enroll($object: study_record_insert_input!) {
        insert_study_record_one(object: $object) { id }
      }
    `
    graphqlRequest(mutation, {
      object: { course_id: this.data.id, user_id: account.id, progress: 0 }
    }, token).then((data) => {
      wx.hideLoading()
      this.setData({
        enrolled: true,
        studyId: data.insert_study_record_one.id,
        percent: 0
      })
      wx.showToast({ title: '已加入学习' })
    }).catch((err) => {
      wx.hideLoading()
      wx.showToast({ title: err.message || '加入失败', icon: 'none' })
    })
  },
  onProgress(e) {
    const percent = Number(e.currentTarget.dataset.percent)
    if (!this.data.studyId) {
      wx.showToast({ title: '请先选课', icon: 'none' })
      return
    }
    const mutation = `
      mutation SaveProgress($id: bigint!, $set: study_record_set_input!) {
        update_study_record_by_pk(pk_columns: { id: $id }, _set: $set) { id progress }
      }
    `
    graphqlRequest(mutation, {
      id: this.data.studyId,
      set: { progress: percent / 100 }
    }, app.getToken()).then(() => {
      this.setData({ percent: percent })
      wx.showToast({ title: '进度 ' + percent + '%' })
    }).catch((err) => wx.showToast({ title: err.message || '进度保存失败', icon: 'none' }))
  },
  onLearn() {
    wx.switchTab({ url: '/pages/learn/index' })
  },
  onAsk() {
    const title = this.data.course ? this.data.course.title : ''
    wx.setStorageSync('agentSeed', '我想学习课程《' + title + '》，请按讲师自学路径带我过一遍要点。')
    wx.switchTab({ url: '/pages/agent/index' })
  }
})
