const app = getApp()
const { graphqlRequest, eqBigint, andWhere } = require('../../utils/graphql.js')
const { getImageUrl } = require('../../utils/upload.js')
const { lectureTextFromCourse } = require('../../utils/analysis.js')
const {
  buildStudySteps,
  isolateStep,
  groupSteps,
  resumePosition,
  persistCursor,
  readCursor,
  ratioFromFurthest
} = require('../../utils/study.js')

Page({
  data: {
    id: '',
    wantedStep: '',
    course: null,
    coverUrl: '',
    loading: true,
    error: '',
    enrolled: false,
    studyId: '',
    percent: 0,
    steps: [],
    groups: [],
    currentIndex: 0,
    currentStep: null,
    furthest: 0,
    displayTitle: '',
    saving: false
  },
  onLoad(query) {
    this.setData({
      id: query.id,
      wantedStep: query.step === undefined ? '' : String(query.step)
    })
    this.load()
  },
  onHide() {
    this.rememberCursor()
  },
  onUnload() {
    this.rememberCursor()
  },
  rememberCursor() {
    if (!this.data.id || !this.data.currentStep) return
    persistCursor(
      this.data.id,
      this.data.studyId,
      this.data.currentStep,
      this.data.furthest,
      this.data.steps.length
    )
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
      const built = buildStudySteps(course)
      const groups = groupSteps(built.steps)
      const resume = resumePosition(
        study ? study.progress : 0,
        readCursor(course.id),
        built.steps,
        study ? study.id : ''
      )
      let current = resume.current
      if (this.data.wantedStep !== '') {
        const wanted = Number(this.data.wantedStep)
        if (!isNaN(wanted)) current = wanted
      }
      const currentStep = isolateStep(built.steps, current)
      this.setData({
        course: course,
        displayTitle: built.courseName,
        steps: built.steps,
        groups: groups,
        currentIndex: currentStep.index,
        currentStep: currentStep,
        furthest: study ? resume.furthest : 0,
        enrolled: !!study,
        studyId: study ? study.id : '',
        percent: study ? resume.percent : 0,
        loading: false
      })
      this.rememberCursor()
      return getImageUrl(course.cover_id, app.getToken()).then((url) => this.setData({ coverUrl: url }))
    }).catch((err) => this.setData({ loading: false, error: this.friendlyError(err) }))
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
  showStep(index, persist) {
    const currentStep = isolateStep(this.data.steps, index)
    const nextFurthest = this.data.enrolled
      ? Math.max(this.data.furthest, currentStep.index)
      : this.data.furthest
    const percent = this.data.enrolled
      ? Math.round(ratioFromFurthest(nextFurthest, this.data.steps.length) * 100)
      : this.data.percent
    this.setData({
      currentIndex: currentStep.index,
      currentStep: currentStep,
      furthest: nextFurthest,
      percent: percent
    })
    this.rememberCursor()
    if (persist && this.data.studyId) this.saveProgress(nextFurthest)
  },
  saveProgress(furthest) {
    if (this.data.saving || !this.data.studyId) return Promise.resolve()
    const ratio = ratioFromFurthest(furthest, this.data.steps.length)
    const mutation = `
      mutation SaveProgress($id: bigint!, $set: study_record_set_input!) {
        update_study_record_by_pk(pk_columns: { id: $id }, _set: $set) { id progress }
      }
    `
    this.setData({ saving: true })
    return graphqlRequest(mutation, {
      id: this.data.studyId,
      set: { progress: ratio }
    }, app.getToken()).then(() => {
      this.setData({
        saving: false,
        furthest: furthest,
        percent: Math.round(ratio * 100)
      })
    }).catch((err) => {
      this.setData({ saving: false })
      wx.showToast({ title: err.message || '进度保存失败', icon: 'none' })
    })
  },
  ensureEnrolled() {
    if (this.data.studyId) return Promise.resolve(this.data.studyId)
    const account = app.globalData.account
    if (!account || !account.id) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return Promise.reject(new Error('请先登录'))
    }
    const mutation = `
      mutation Enroll($object: study_record_insert_input!) {
        insert_study_record_one(object: $object) { id }
      }
    `
    return graphqlRequest(mutation, {
      object: { course_id: this.data.id, user_id: account.id, progress: 0 }
    }, app.getToken()).then((data) => {
      const studyId = data.insert_study_record_one.id
      this.setData({ enrolled: true, studyId: studyId })
      return studyId
    })
  },
  onEnroll() {
    wx.showLoading({ title: '加入学习' })
    this.ensureEnrolled().then(() => {
      wx.hideLoading()
      this.showStep(this.data.currentIndex, true)
      wx.showToast({ title: '已加入学习' })
    }).catch((err) => {
      wx.hideLoading()
      wx.showToast({ title: err.message || '加入失败', icon: 'none' })
    })
  },
  onStepBar(e) {
    this.onPickStep(e.detail.index)
  },
  onPickStep(e) {
    const index = typeof e === 'number' ? e : Number(e.currentTarget.dataset.index)
    if (isNaN(index)) return
    if (!this.data.enrolled) {
      this.ensureEnrolled().then(() => this.showStep(index, true)).catch(() => this.showStep(index, false))
      return
    }
    this.showStep(index, true)
  },
  onPrev() {
    this.onPickStep(Math.max(0, this.data.currentIndex - 1))
  },
  onNext() {
    this.onPickStep(Math.min(this.data.steps.length - 1, this.data.currentIndex + 1))
  },
  onLearn() {
    wx.switchTab({ url: '/pages/learn/index' })
  },
  onAsk() {
    const title = this.data.displayTitle || (this.data.course && this.data.course.title) || ''
    const step = this.data.currentStep
    const seed = step
      ? '我想继续自学《' + title + '》的第 ' + step.ordinal + ' 步「' + step.title + '」。请只讲这一步，不要和其他步骤混在一起。'
      : '我想学习课程《' + title + '》，请按讲师自学路径带我过一遍要点。'
    wx.setStorageSync('agentSeed', seed)
    wx.switchTab({ url: '/pages/agent/index' })
  },
  onMakePpt() {
    const course = this.data.course
    if (!course) return
    const text = lectureTextFromCourse(course)
    if (!text) {
      wx.showToast({ title: '这门课还没有可生成课件的内容', icon: 'none' })
      return
    }
    wx.setStorageSync('pptSeed', text)
    wx.navigateTo({
      url: '/pages/ppt/index?title=' + encodeURIComponent(this.data.displayTitle || course.title || '') + '&courseId=' + course.id
    })
  }
})
