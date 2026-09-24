const app = getApp()
const { graphqlRequest, eqBigint, andWhere } = require('../../utils/graphql.js')
const classroom = require('../../utils/classroom.js')
const { ensureFlowSession, stableUserId, blankSession, writeSession } = require('../../utils/session.js')
const { startPrompt, PENDING_TOPIC_KEY } = require('../../utils/flow.js')
const { matchCanonical, loadCachedCatalog } = require('../../utils/coze-catalog.js')
const { findLessonCode } = require('../../utils/official-catalog.js')
const { friendlyError } = require('../../utils/errors.js')

Page({
  data: {
    id: '',
    course: null,
    displayTitle: '',
    matched: false,
    loading: true,
    planning: false,
    sending: false,
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
    currentStep: 1,
    viewingStep: 0,
    viewingTitle: '',
    exam1Done: false,
    exam2Done: false,
    exam2Ready: false,
    currentLabel: '',
    thread: [],
    followUps: [],
    draft: '',
    scrollInto: '',
    conversationId: '',
    lessonCode: '',
    thinking: false,
    thinkHint: '',
    waitSec: 0
  },
  sessionKey() {
    return this.data.id
  },
  cozeUserId(account) {
    return stableUserId(account, this.sessionKey())
  },
  onLoad(query) {
    this.setData({ id: query.id })
    this.boot()
  },
  onUnload() {
    classroom.stopLive(this)
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
        const lessonCode = findLessonCode(displayTitle)
        this.data.course = Object.assign({}, course, { displayTitle: displayTitle, lessonCode: lessonCode })
        ensureFlowSession(id, displayTitle)
        this.setData({
          course: this.data.course,
          displayTitle: displayTitle,
          lessonCode: lessonCode,
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
      wx.setStorageSync(PENDING_TOPIC_KEY, this.data.displayTitle || '')
    } catch (e) {}
    wx.switchTab({ url: '/pages/agent/index' })
  },
  onDraft(e) {
    this.setData({ draft: e.detail.value })
  },
  onSend() {
    classroom.onSend(this)
  },
  onPlus() {
    classroom.onPlus(this)
  },
  onFollow(e) {
    classroom.onFollow(this, e.currentTarget.dataset.text)
  },
  onRetry() {
    classroom.onRetry(this, startPrompt(this.data.course, this.data.displayTitle))
  },
  onClear() {
    classroom.stopLive(this)
    const page = this
    const afterClear = function () {
      writeSession(page.sessionKey(), blankSession(page.data.displayTitle || ''))
      page.setData({
        error: '',
        followUps: [],
        thread: [],
        steps: [],
        currentStep: 1,
        currentIndex: 0,
        completedCount: 0,
        finished: false,
        viewingStep: 0,
        exam1Done: false,
        exam2Done: false,
        exam2Ready: false,
        hint: '',
        thinking: false,
        thinkHint: '',
        waitSec: 0
      })
      classroom.startCourseFlow(page, page.data.course)
    }
    classroom.clearHistory(this).then(afterClear, afterClear)
  },
  onStepChange(e) {
    classroom.onStepTap(this, e.detail.index)
  },
  onBackLive() {
    classroom.backToLive(this)
  },
  onReplayStep() {
    classroom.replayStep(this, this.data.viewingStep || this.data.currentStep)
  },
  onExam1() {
    classroom.startExam1(this)
  },
  onExam2() {
    classroom.startExam2(this)
  },
  onMakePpt() {
    classroom.makePpt(this)
  },
  friendlyError(err) {
    return friendlyError(err, '加载失败')
  }
})
