const app = getApp()
const { graphqlRequest, eqBigint, andWhere } = require('../../utils/graphql.js')
const { chatWithCoze } = require('../../utils/agent.js')
const voice = require('../../utils/voice.js')
const {
  readSession,
  writeSession,
  parseListedSteps,
  mergeSteps,
  startPrompt,
  visibleMessages,
  hasAssistant
} = require('../../utils/session.js')

Page({
  data: {
    id: '',
    course: null,
    displayTitle: '',
    loading: true,
    planning: false,
    sending: false,
    recording: false,
    error: '',
    hint: '',
    enrolled: false,
    studyId: '',
    steps: [],
    currentIndex: 0,
    completedCount: 0,
    finished: false,
    currentStep: null,
    thread: [],
    followUps: [],
    draft: '',
    scrollInto: '',
    conversationId: ''
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
    this.setData({ loading: true, error: '', hint: '正在打开智学…' })
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
        this.data.course = course
        const existing = readSession(id)
        this.setData({
          course: course,
          displayTitle: course.title,
          enrolled: !!study,
          studyId: study ? study.id : '',
          loading: false,
          planning: !(existing && hasAssistant(existing.messages)),
          hint: '正在调用智学…'
        })
        wx.setNavigationBarTitle({ title: '智学 · ' + String(course.title || '课程').slice(0, 10) })
        return this.ensureEnrolled().then(() => this.ensureStarted())
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
  paintSession(session) {
    const steps = (session && session.steps) || []
    const completedCount = Number((session && session.completedCount) || 0)
    const finished = steps.length > 0 && completedCount >= steps.length
    const teachIndex = finished
      ? Math.max(0, steps.length - 1)
      : Math.min(completedCount, Math.max(0, steps.length - 1))
    const currentStep = steps[teachIndex] || null
    const thread = visibleMessages(session && session.messages)
    this.setData({
      steps: steps,
      completedCount: completedCount,
      finished: finished,
      currentIndex: teachIndex,
      currentStep: currentStep,
      conversationId: (session && session.conversationId) || '',
      thread: thread,
      followUps: (session && session.followUps) || [],
      hint: currentStep
        ? ('第 ' + (teachIndex + 1) + ' 环节：' + currentStep.title)
        : '对话完全跟随智学。列出环节后，顶部红格变绿表示该环节已完成'
    })
    this.scrollBottom()
    return session
  },
  persist(patch) {
    const session = writeSession(this.data.id, patch)
    this.paintSession(session)
    return session
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
  applyReply(result, userText) {
    const latest = readSession(this.data.id) || {}
    const messages = (latest.messages || []).slice()
    if (userText) {
      messages.push({
        id: Date.now(),
        role: 'user',
        hidden: false,
        content: userText
      })
    }
    messages.push({
      id: Date.now() + 1,
      role: 'assistant',
      hidden: false,
      content: result.reply
    })
    const incoming = parseListedSteps(result.reply)
    const steps = mergeSteps(latest.steps, incoming)
    const completedCount = Math.min(Number(latest.completedCount || 0), steps.length)
    return this.persist({
      messages: messages,
      steps: steps,
      completedCount: completedCount,
      followUps: result.followUps || [],
      conversationId: result.conversationId || latest.conversationId || '',
      chatId: result.chatId || latest.chatId || ''
    })
  },
  askZhixue(text) {
    const prompt = String(text || '').trim()
    if (!prompt || this.data.sending || this._busy) return Promise.resolve()
    this._busy = true
    const preview = readSession(this.data.id) || {}
    const pending = (preview.messages || []).concat([{
      id: Date.now(),
      role: 'user',
      hidden: false,
      content: prompt
    }])
    this.persist({ messages: pending, followUps: [] })
    this.setData({ sending: true, error: '', draft: '', planning: false })
    const account = app.globalData.account || {}
    const userId = 'learn-' + (account.id || 'guest') + '-c' + this.data.id
    return chatWithCoze(prompt, userId, preview.conversationId || '', app.getToken()).then((result) => {
      const latest = readSession(this.data.id) || {}
      const withoutDup = (latest.messages || pending).slice()
      if (withoutDup.length && withoutDup[withoutDup.length - 1].role === 'user') {
        withoutDup.pop()
      }
      this.persist({ messages: withoutDup })
      this.applyReply(result, prompt)
      this.setData({ sending: false })
      this._busy = false
    }).catch((err) => {
      const latest = readSession(this.data.id) || {}
      this.persist({
        messages: (latest.messages || pending).concat([{
          id: Date.now() + 1,
          role: 'assistant',
          hidden: false,
          failed: true,
          content: this.friendlyError(err)
        }])
      })
      this.setData({ sending: false, error: this.friendlyError(err) })
      this._busy = false
    })
  },
  ensureStarted() {
    const existing = readSession(this.data.id)
    if (existing && hasAssistant(existing.messages)) {
      this.paintSession(existing)
      return Promise.resolve(existing)
    }
    this.setData({ planning: true })
    return this.askZhixue(startPrompt(this.data.course))
  },
  scrollBottom() {
    const thread = this.data.thread || []
    const last = thread[thread.length - 1]
    this.setData({ scrollInto: last ? 'm-' + last.id : '' })
  },
  onDraft(e) {
    this.setData({ draft: e.detail.value })
  },
  onSend() {
    const text = (this.data.draft || '').trim()
    if (!text || this.data.sending) return
    this.askZhixue(text)
  },
  onFollow(e) {
    const text = e.currentTarget.dataset.text
    if (!text || this.data.sending) return
    this.askZhixue(text)
  },
  onStepBar(e) {
    const i = Number(e.detail.index)
    if (isNaN(i)) return
    if (i > this.data.completedCount) {
      wx.showToast({ title: '请先走完当前智学环节', icon: 'none' })
      return
    }
    this.setData({ currentIndex: i, currentStep: this.data.steps[i] || null })
  },
  onRetry() {
    this.setData({ error: '' })
    const session = readSession(this.data.id) || {}
    const messages = session.messages || []
    let lastUser = ''
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user' && !messages[i].hidden) {
        lastUser = messages[i].content
        break
      }
    }
    this.askZhixue(lastUser || startPrompt(this.data.course))
  },
  onComplete() {
    if (this.data.sending || this._busy) return
    const session = readSession(this.data.id) || {}
    const steps = session.steps || []
    if (!steps.length) {
      wx.showToast({ title: '等智学给出环节后再标记', icon: 'none' })
      return
    }
    if (!hasAssistant(session.messages)) {
      wx.showToast({ title: '等智学回复后再标记', icon: 'none' })
      return
    }
    const completedCount = Math.min(this.data.completedCount + 1, steps.length)
    this.persist({ completedCount: completedCount })
    this.saveProgress(completedCount, steps.length)
    wx.showToast({
      title: completedCount >= steps.length ? '本课环节已走完' : '已标记完成，继续按智学回复学习',
      icon: 'none'
    })
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
  onPpt() {
    const title = this.data.displayTitle || ''
    wx.setStorageSync('pptSeed', '课程《' + title + '》')
    wx.navigateTo({
      url: '/pages/ppt/index?title=' + encodeURIComponent(title) + '&courseId=' + this.data.id
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
