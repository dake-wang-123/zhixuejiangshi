const app = getApp()
const classroom = require('../../utils/classroom.js')
const {
  ensureFlowSession,
  blankSession,
  writeSession,
  conversationScope,
  stableUserId
} = require('../../utils/session.js')
const { startPrompt, PENDING_TOPIC_KEY, PENDING_LESSON_KEY } = require('../../utils/flow.js')
const { readPending, sourceOf } = require('../../utils/personal-plan.js')
const { friendlyError } = require('../../utils/errors.js')

Page({
  data: {
    course: null,
    displayTitle: '智学伴练',
    lessonCode: '',
    loading: false,
    planning: false,
    sending: false,
    reviewing: false,
    error: '',
    hint: '',
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
    topicDraft: '',
    thinking: false,
    thinkHint: '',
    waitSec: 0
  },
  sessionKey() {
    return conversationScope({
      lessonCode: this.data.lessonCode,
      title: this.data.course && (this.data.course.title || this.data.displayTitle)
    })
  },
  cozeUserId(account) {
    return stableUserId(account, this.sessionKey())
  },
  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
    let pending = ''
    let lessonCode = ''
    let personal = null
    try {
      personal = readPending()
      const packed = wx.getStorageSync(PENDING_LESSON_KEY) || null
      if (packed) {
        pending = packed.title || packed.lessonTitle || ''
        lessonCode = packed.lessonCode || packed.code || ''
        wx.removeStorageSync(PENDING_LESSON_KEY)
      }
      if (!pending) pending = wx.getStorageSync(PENDING_TOPIC_KEY) || ''
      if (pending) wx.removeStorageSync(PENDING_TOPIC_KEY)
    } catch (e) {}
    if (personal) {
      pending = personal.title
      lessonCode = personal.lessonCode
      this.setData({
        displayTitle: personal.title,
        lessonCode: personal.lessonCode,
        course: {
          title: personal.title,
          displayTitle: personal.title,
          lessonCode: personal.lessonCode,
          source: 'personal',
          planText: personal.text
        }
      })
    } else if (pending) {
      this.setData({
        displayTitle: pending,
        lessonCode: lessonCode,
        course: {
          title: pending,
          displayTitle: pending,
          lessonCode: lessonCode,
          source: sourceOf({ lessonCode: lessonCode }, lessonCode)
        }
      })
    }
    ensureFlowSession(this.sessionKey(), pending)
    app.ensureLogin().then(() => {
      if (personal) {
        this.setData({
          planning: true,
          hint: '正在按你的个人教案开始 10 步…'
        })
        return classroom.startCourseFlow(this, this.data.course)
      }
      if (pending) {
        this.setData({
          planning: true,
          hint: lessonCode ? ('正在把 ' + lessonCode + ' 课题发给智学…') : '正在把课题发给智学…'
        })
        return classroom.startOpenFlow(this, pending)
      }
      return classroom.startOpenFlow(this)
    }).catch((err) => {
      this.setData({ error: this.friendlyError(err), planning: false })
    })
  },
  onUnload() {
    classroom.stopLive(this)
  },
  onDraft(e) {
    this.setData({ draft: e.detail.value })
  },
  onTopicDraft(e) {
    this.setData({ topicDraft: e.detail.value })
  },
  onStartTopic() {
    const title = String(this.data.topicDraft || '').trim()
    if (!title) {
      wx.showToast({ title: '请先输入课题原题', icon: 'none' })
      return
    }
    this.setData({
      displayTitle: title,
      lessonCode: '',
      course: { title: title, displayTitle: title },
      planning: true,
      topicDraft: ''
    })
    classroom.startOpenFlow(this, title)
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
      writeSession(page.sessionKey(), blankSession(''))
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
        planning: false,
        displayTitle: '智学伴练',
        lessonCode: '',
        course: null,
        hint: '',
        thinking: false,
        thinkHint: '',
        waitSec: 0
      })
      classroom.startOpenFlow(page)
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
  onViewResults() {
    const code = this.data.lessonCode || 'open'
    const title = this.data.displayTitle || ''
    wx.navigateTo({
      url: '/pages/results/detail?lessonCode=' + encodeURIComponent(code) + '&title=' + encodeURIComponent(title)
    })
  },
  friendlyError(err) {
    return friendlyError(err, '智学调用失败')
  }
})
