const { shortTitle } = require('./study.js')

const SESSION_KEY = 'zhixue_sessions_v1'

function loadAll() {
  try {
    if (typeof wx === 'undefined' || !wx.getStorageSync) return {}
    return wx.getStorageSync(SESSION_KEY) || {}
  } catch (e) {
    return {}
  }
}

function readSession(courseId) {
  if (!courseId) return null
  return loadAll()[String(courseId)] || null
}

function writeSession(courseId, patch) {
  if (!courseId) return null
  const all = loadAll()
  const prev = all[String(courseId)] || {}
  const next = Object.assign({}, prev, patch || {}, { updatedAt: Date.now() })
  all[String(courseId)] = next
  if (typeof wx !== 'undefined' && wx.setStorageSync) {
    wx.setStorageSync(SESSION_KEY, all)
  }
  return next
}

function normalizeStep(item, index) {
  const title = String((item && (item.title || item.name || item.环节 || item.标题)) || '').trim() || ('第 ' + (index + 1) + ' 节')
  const goal = String((item && (item.goal || item.aim || item.目标 || item.description || item.desc)) || '').trim()
  return {
    key: 'guide-' + index + '-' + title,
    title: title,
    shortTitle: shortTitle(title, 4),
    goal: goal,
    detail: goal,
    group: '智学引导',
    kind: 'guide'
  }
}

function fallbackSteps(course) {
  const title = (course && (course.title || course.displayTitle)) || '本课'
  return [
    { title: '导入定向', goal: '讲清《' + title + '》给谁上、解决什么问题，以及讲师上场第一句话怎么说。' },
    { title: '核心观点', goal: '拆出本课必须讲透的 3 个观点，并给记忆钩子。' },
    { title: '讲师话术', goal: '给出可直接上场的导入语、过渡语和收尾语。' },
    { title: '案例示范', goal: '用一个家庭场景把观点讲完整，示范怎么互动。' },
    { title: '答疑应变', goal: '预演家长最可能问的 3 个问题及回应。' },
    { title: '复盘考核', goal: '用 3 道自测题检查能否独立讲完本课。' }
  ].map(normalizeStep)
}

function parseGuideSteps(text) {
  const raw = String(text || '').trim()
  if (!raw) return []
  let blob = raw
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) blob = fence[1]
  const start = blob.indexOf('[')
  const end = blob.lastIndexOf(']')
  if (start < 0 || end <= start) return []
  let data
  try {
    data = JSON.parse(blob.slice(start, end + 1))
  } catch (e) {
    try {
      data = JSON.parse(blob.slice(start, end + 1).replace(/,\s*]/g, ']'))
    } catch (e2) {
      return []
    }
  }
  if (!Array.isArray(data)) return []
  return data.map(normalizeStep).filter((item) => item.title)
}

function clampSteps(steps, course) {
  let list = (steps || []).slice(0, 8)
  if (list.length < 4) list = fallbackSteps(course)
  return list.map((item, index) => normalizeStep(item, index))
}

function planPrompt(course) {
  const title = (course && course.title) || '家庭教育课程'
  const category = (course && course.category_id && course.category_id.name) || ''
  const desc = (course && course.description) || ''
  return [
    '你是家庭教育讲师自学教练。请为下面这门课排出严格的自学环节，后面必须按这个顺序带学，不要跳步。',
    '课程：' + title,
    category ? '分类：' + category : '',
    desc ? '简介：' + desc : '',
    '只输出一个 JSON 数组，不要 markdown，不要解释。必须 6 节。每项字段：title（不超过10字）、goal（这一节要掌握什么，一两句）。',
    '顺序固定为讲师上场路径：导入定向 → 核心观点 → 讲师话术 → 案例示范 → 答疑应变 → 复盘考核。title 可以用更贴合本课的说法，但不要增减节数。'
  ].filter(Boolean).join('\n')
}

function teachPrompt(course, step, index, total, isResume) {
  const title = (course && course.title) || '本课'
  const head = isResume ? '学员回到这一节，请只从这一节继续，不要重开后面的环节。' : '现在开始这一节。'
  return [
    '【课程】' + title,
    '【当前环节】第 ' + (index + 1) + ' / ' + total + ' 节：' + (step && step.title),
    '【本节目标】' + ((step && step.goal) || '掌握这一节的讲师要点'),
    '【规则】' + head + '只讲这一节，禁止提前讲后面的环节，也不要回顾已经学完的细节除非学员问起。用家庭教育讲师备课口吻：先给要点，再给可上场的话术，再给一个小练习。讲完后问学员是否掌握，掌握后等学员点「完成本节」，你不要自行跳到下一节。'
  ].join('\n')
}

function nextPrompt(course, nextStep, index, total) {
  return [
    '学员已经完成本节。请立刻开始第 ' + (index + 1) + ' / ' + total + ' 节「' + (nextStep && nextStep.title) + '」。',
    '本节目标：' + ((nextStep && nextStep.goal) || '掌握这一节'),
    '只讲这一节，不要总结全书，不要跳步。'
  ].join('\n')
}

function visibleMessages(messages, stepIndex) {
  return (messages || []).filter((item) => {
    if (item.hidden) return false
    if (typeof stepIndex === 'number' && item.stepIndex !== stepIndex) return false
    return true
  })
}

function hasAssistant(messages, stepIndex) {
  return (messages || []).some((item) => {
    return item.role === 'assistant' && item.stepIndex === stepIndex && !item.hidden && !item.failed
  })
}

module.exports = {
  readSession: readSession,
  writeSession: writeSession,
  fallbackSteps: fallbackSteps,
  parseGuideSteps: parseGuideSteps,
  clampSteps: clampSteps,
  planPrompt: planPrompt,
  teachPrompt: teachPrompt,
  nextPrompt: nextPrompt,
  visibleMessages: visibleMessages,
  hasAssistant: hasAssistant,
  normalizeStep: normalizeStep
}
