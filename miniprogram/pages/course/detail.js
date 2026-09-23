const app = getApp()
const { graphqlRequest, eqBigint, andWhere } = require('../../utils/graphql.js')
const classroom = require('../../utils/classroom.js')
const { ensureFlowSession } = require('../../utils/session.js')
const { startPrompt, TOPIC_DRAFT_KEY } = require('../../utils/flow.js')
const { matchCanonical, loadCachedCatalog } = require('../../utils/coze-catalog.js')
const voice = require('../../utils/voice.js')

Page({
  data: {
    id: '',
    course: null,
    displayTitle: '',
    matched: false,
    loading: true,
    planning: false,
    sending: false,
    recording: false,
    reviewing: false,
    error: '',
    hint: '',
    enrolled: false,
    studyId: '',
    steps: [],
    currentIndex: 0,
    liveIndex: 0,
    completedCount: 0,
    finished: false,
    currentStep: null,
    thread: [],
    followUps: [],
    draft: '',
    scrollInto: '',
    conversationId: ''
  },
  sessionKey() {
    return this.data.id
  },
  cozeUserId(account) {
    return 'learn-' + (account.id || 'guest') + '-c' + this.data.id
  },
  onLoad(query) {
    this.setData({ id: query.id })
    this.boot()
  },
  onUnload() {
    if (this.data.recording) {
      try { wx.stopRecord({ fail: function () {} }) } catch (e) {}
    }
  },
  boot() {
    const id = this.data.id
    this.setData({ loading: true, error: '', hint: '正在打开智学伴练…' })
    loadCachedCatalog()
    return app.ensureLogin().then(() => {
      const token = app.getToken()
      const account = app.globalData.account || {}
      const q = `
        query CourseStudy($id: bigint!, $studyWhere: study_record_bool_exp) {
          course_by_pk(id: $id) {
            id title description price member_free status cover_id ai_analysis
            category_id { id name }
          }
          study_record(where: $studyWhere, limit: 1) { id progress }
        }
      `
      const studyWhere = andWhere([
        eqBigint('course_id', id),
        eqBigint('user_id', account.id)
      ])
      return graphqlRequest(q, { id: id, studyWhere: studyWhere }, token).then((data) => {
        const course = data.course_by_pk
        if (!course) throw new Error('课程不存在或无权查看')
        const study = (data.study_record || [])[0]
        const canonical = matchCanonical(course.title)
        const displayTitle = canonical ? canonical.title : course.title
        this.data.course = Object.assign({}, course, { displayTitle: displayTitle })
        ensureFlowSession(id, displayTitle)
        this.setData({
          course: this.data.course,
          displayTitle: displayTitle,
          matched: !!canonical,
          enrolled: !!study,
          studyId: study ? study.id : '',
          loading: false
        })
        wx.setNavigationBarTitle({ title: '智学 · ' + String(displayTitle || '课程').slice(0, 10) })
        this.setData({
          matched: true,
          planning: true,
          hint: '正在把课题发给智学…'
        })
        return this.ensureEnrolled().then(() => classroom.startCourseFlow(this, this.data.course))
      })
    }).then(() => {
      this.setData({ loading: false, planning: false })
    }).catch((err) => {
      this.setData({
        loading: false,
        planning: false,
        error: this.friendlyError(err)
      })
    })
  },
  ensureEnrolled() {
    if (this.data.studyId) return Promise.resolve(this.data.studyId)
    const account = app.globalData.account
    if (!account || !account.id) return Promise.reject(new Error('请先登录'))
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
  saveProgress(completedCount, total) {
    if (!this.data.studyId) return Promise.resolve()
    const ratio = total ? completedCount / total : 0
    const mutation = `
      mutation SaveProgress($id: bigint!, $set: study_record_set_input!) {
        update_study_record_by_pk(pk_columns: { id: $id }, _set: $set) { id progress }
      }
    `
    return graphqlRequest(mutation, {
      id: this.data.studyId,
      set: { progress: ratio }
    }, app.getToken()).catch(() => {})
  },
  onGoInput() {
    try {
      wx.setStorageSync(TOPIC_DRAFT_KEY, this.data.displayTitle || '')
    } catch (e) {}
    wx.switchTab({ url: '/pages/learn/index' })
  },
  onDraft(e) {
    this.setData({ draft: e.detail.value })
  },
  onSend() {
    classroom.onSend(this)
  },
  onFollow(e) {
    classroom.onFollow(this, e.currentTarget.dataset.text)
  },
  onStepBar(e) {
    classroom.onStepBar(this, e.detail.index)
  },
  onRetry() {
    classroom.onRetry(this, startPrompt(this.data.course, this.data.displayTitle))
  },
  onComplete() {
    classroom.onComplete(this)
  },
  onBackLive() {
    const session = require('../../utils/session.js').readSession(this.sessionKey())
    classroom.paint(this, session || {}, classroom.liveIndexOf(session || {}))
  },
  onMicStart() {
    if (this.data.sending || this.data.recording) return
    this.setData({ recording: true })
    voice.startRecord().catch((err) => {
      this.setData({ recording: false })
      wx.showToast({ title: this.friendlyError(err), icon: 'none' })
    })
  },
  onMicEnd() {
    if (!this.data.recording) return
    this.setData({ recording: false })
    voice.stopRecord().then((text) => {
      this.setData({ draft: voice.appendDraft(this.data.draft, text) })
    }).catch((err) => {
      wx.showToast({ title: this.friendlyError(err), icon: 'none' })
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
  }
})
