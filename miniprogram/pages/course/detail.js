const app = getApp()
const { graphqlRequest, eqBigint, andWhere } = require('../../utils/graphql.js')
const { chatWithCoze } = require('../../utils/agent.js')
const {
  readSession,
  writeSession,
  fallbackSteps,
  parseGuideSteps,
  clampSteps,
  planPrompt,
  teachPrompt,
  nextPrompt,
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
    draft: '',
    scrollInto: '',
    conversationId: ''
  },
  onLoad(query) {
    this.setData({ id: query.id })
    this.boot()
  },
  boot() {
    const id = this.data.id
    this.setData({ loading: true, error: '', hint: '正在打开智学课堂…' })
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
        this.data.displayTitle = course.title
        this.data.enrolled = !!study
        this.data.studyId = study ? study.id : ''
        const existing = readSession(id)
        this.setData({
          course: course,
          displayTitle: course.title,
          enrolled: !!study,
          studyId: study ? study.id : '',
          loading: false,
          planning: !(existing && existing.steps && existing.steps.length),
          hint: '智学正在排出本课学习环节…'
        })
        wx.setNavigationBarTitle({ title: '智学 · ' + String(course.title || '课程').slice(0, 10) })
        return this.ensureEnrolled().then(() => this.ensurePlan())
      })
    }).then(() => {
      this.setData({ loading: false })
      return this.ensureTeaching()
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
    const currentIndex = finished
      ? Math.max(0, steps.length - 1)
      : Math.min(completedCount, Math.max(0, steps.length - 1))
    const viewIndex = typeof (session && session.viewIndex) === 'number' ? session.viewIndex : currentIndex
    const safeView = Math.min(Math.max(0, viewIndex), Math.max(0, steps.length - 1))
    const currentStep = steps[safeView] || null
    const thread = visibleMessages(session && session.messages, safeView)
    this.setData({
      steps: steps,
      completedCount: completedCount,
      finished: finished,
      currentIndex: safeView,
      currentStep: currentStep,
      conversationId: (session && session.conversationId) || '',
      thread: thread,
      hint: finished
        ? '六节都已走完。可点绿色环节回看，或去学习页看总进度。'
        : (currentStep ? ('正在智学第 ' + (safeView + 1) + ' 节：' + currentStep.title) : '智学正在排出学习环节…')
    })
    this.scrollBottom()
    return {
      steps: steps,
      completedCount: completedCount,
      finished: finished,
      teachIndex: currentIndex,
      viewIndex: safeView,
      session: session
    }
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
  ensurePlan() {
    const existing = readSession(this.data.id)
    if (existing && existing.steps && existing.steps.length) {
      this.paintSession(existing)
      return Promise.resolve(existing)
    }
    this.setData({ planning: true, hint: '智学正在排出本课学习环节…' })
    const account = app.globalData.account || {}
    const userId = 'learn-' + (account.id || 'guest') + '-c' + this.data.id
    return chatWithCoze(planPrompt(this.data.course), userId, '', app.getToken()).then((result) => {
      const parsed = parseGuideSteps(result.reply)
      const usedFallback = !parsed.length
      const steps = clampSteps(parsed, this.data.course)
      const session = this.persist({
        steps: steps,
        completedCount: 0,
        viewIndex: 0,
        conversationId: usedFallback ? '' : (result.conversationId || ''),
        chatId: usedFallback ? '' : (result.chatId || ''),
        messages: [{
          id: Date.now(),
          role: 'system',
          stepIndex: 0,
          hidden: false,
          content: usedFallback
            ? '智学目录没有按 JSON 返回，先按讲师六步走。红格未完成，绿格已完成，必须按顺序学完当前节。'
            : ('智学排出 ' + steps.length + ' 个环节。红格未完成，绿格已完成。必须按顺序走完当前节。')
        }]
      })
      this.setData({ planning: false })
      return session
    }).catch((err) => {
      const steps = fallbackSteps(this.data.course)
      const session = this.persist({
        steps: steps,
        completedCount: 0,
        viewIndex: 0,
        conversationId: '',
        messages: [{
          id: Date.now(),
          role: 'system',
          stepIndex: 0,
          hidden: false,
          content: '智学目录暂时没排出来，先按讲师六步走。原因：' + this.friendlyError(err)
        }]
      })
      this.setData({ planning: false })
      return session
    })
  },
  ensureTeaching() {
    const painted = this.paintSession(readSession(this.data.id) || {})
    if (!painted.steps.length || painted.finished) return Promise.resolve()
    if (painted.viewIndex !== painted.teachIndex) return Promise.resolve()
    if (hasAssistant(painted.session && painted.session.messages, painted.teachIndex)) return Promise.resolve()
    return this.askZhixue(teachPrompt(
      this.data.course,
      painted.steps[painted.teachIndex],
      painted.teachIndex,
      painted.steps.length,
      false
    ), painted.teachIndex, true)
  },
  askZhixue(prompt, stepIndex, hidden) {
    if (this.data.sending || this._busy) return Promise.resolve()
    this._busy = true
    const session = readSession(this.data.id) || {}
    const messages = (session.messages || []).slice()
    const userMsg = {
      id: Date.now(),
      role: 'user',
      stepIndex: stepIndex,
      hidden: !!hidden,
      content: hidden ? ('开始第 ' + (stepIndex + 1) + ' 节') : prompt
    }
    messages.push(userMsg)
    this.persist({ messages: messages, viewIndex: stepIndex })
    this.setData({ sending: true, error: '', draft: hidden ? this.data.draft : '' })
    const account = app.globalData.account || {}
    const userId = 'learn-' + (account.id || 'guest') + '-c' + this.data.id
    return chatWithCoze(prompt, userId, session.conversationId || '', app.getToken()).then((result) => {
      const latest = readSession(this.data.id) || session
      const next = (latest.messages || messages).concat([{
        id: Date.now() + 1,
        role: 'assistant',
        stepIndex: stepIndex,
        hidden: false,
        content: result.reply
      }])
      this.persist({
        messages: next,
        conversationId: result.conversationId || latest.conversationId || '',
        chatId: result.chatId || latest.chatId || ''
      })
      this.setData({ sending: false })
      this._busy = false
    }).catch((err) => {
      const latest = readSession(this.data.id) || session
      const next = (latest.messages || messages).concat([{
        id: Date.now() + 1,
        role: 'assistant',
        stepIndex: stepIndex,
        hidden: false,
        failed: true,
        content: this.friendlyError(err)
      }])
      this.persist({ messages: next })
      this.setData({ sending: false, error: this.friendlyError(err) })
      this._busy = false
    })
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
    if (!text || this.data.sending || this.data.finished) return
    if (this.data.currentIndex !== this.data.completedCount) {
      wx.showToast({ title: '回到当前红格再提问', icon: 'none' })
      return
    }
    this.setData({ draft: '' })
    this.askZhixue(text, this.data.currentIndex, false)
  },
  onStepBar(e) {
    this.onPickStep(e.detail.index)
  },
  onPickStep(index) {
    const i = Number(index)
    if (isNaN(i)) return
    const session = readSession(this.data.id) || {}
    const completedCount = Number(session.completedCount || 0)
    if (i > completedCount) {
      wx.showToast({ title: '请先完成本节智学引导', icon: 'none' })
      return
    }
    this.persist({ viewIndex: i })
  },
  onRetry() {
    this.setData({ error: '' })
    this.ensureTeaching()
  },
  onBackCurrent() {
    const session = readSession(this.data.id) || {}
    const completedCount = Number(session.completedCount || 0)
    const steps = session.steps || []
    const teachIndex = Math.min(completedCount, Math.max(0, steps.length - 1))
    this.persist({ viewIndex: teachIndex })
    this.ensureTeaching()
  },
  onComplete() {
    if (this.data.sending || this._busy) return
    const session = readSession(this.data.id) || {}
    const steps = session.steps || []
    if (!steps.length) return
    if (this.data.currentIndex !== this.data.completedCount) {
      wx.showToast({ title: '请先回到当前红格', icon: 'none' })
      return
    }
    if (!hasAssistant(session.messages, this.data.completedCount)) {
      wx.showToast({ title: '等智学讲完本节再勾完', icon: 'none' })
      return
    }
    const completedCount = this.data.completedCount + 1
    const finished = completedCount >= steps.length
    const viewIndex = finished ? steps.length - 1 : completedCount
    this.persist({
      completedCount: completedCount,
      viewIndex: viewIndex,
      messages: (session.messages || []).concat([{
        id: Date.now(),
        role: 'system',
        stepIndex: viewIndex,
        hidden: false,
        content: finished
          ? '本节完成，课程智学路径已走完。进度条已全部变绿。'
          : ('第 ' + completedCount + ' 节完成，进度条已变绿。开始下一节。')
      }])
    })
    this.saveProgress(completedCount, steps.length)
    if (finished) {
      wx.showToast({ title: '本课智学完成' })
      return
    }
    const next = steps[completedCount]
    this.askZhixue(nextPrompt(this.data.course, next, completedCount, steps.length), completedCount, true)
  },
  onPpt() {
    const title = this.data.displayTitle || ''
    wx.setStorageSync('pptSeed', '课程《' + title + '》的讲师自学课件，请按智学环节展开。')
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
