const { shortTitle } = require('./study.js')
const { matchCanonical } = require('./coze-catalog.js')
const { packPersonalStart, sourceOf } = require('./personal-plan.js')

const FLOW_VERSION = 12
const OPEN_SESSION_ID = 'open'
const PENDING_TOPIC_KEY = 'zhixue_pending_topic'
const PENDING_LESSON_KEY = 'zhixue_pending_lesson'
const TOPIC_DRAFT_KEY = 'zhixue_topic_draft'
const OPEN_GUIDE_PROMPT = '你好'

const DELIVERY_STEPS = [
  { n: 1, key: 'intro', title: '自我介绍', short: '介绍' },
  { n: 2, key: 'break', title: '破题', short: '破题' },
  { n: 3, key: 'value', title: '目标价值', short: '价值' },
  { n: 4, key: 'empathy', title: '同理家长', short: '同理' },
  { n: 5, key: 'align', title: '对齐认知', short: '对齐' },
  { n: 6, key: 'method', title: '方法与策略', short: '方法' },
  { n: 7, key: 'case', title: '案例萃取', short: '案例' },
  { n: 8, key: 'interact', title: '互动设计', short: '互动' },
  { n: 9, key: 'pitfall', title: '误区与答疑', short: '误区' },
  { n: 10, key: 'close', title: '总结收尾', short: '收尾' }
]

function clampStep(n, max) {
  const v = Number(n)
  if (!isFinite(v)) return 0
  return Math.max(1, Math.min(max || 12, Math.round(v)))
}

function stepMeta(n) {
  const index = clampStep(n, 12) - 1
  if (index === 10) return { n: 11, key: 'drill', title: '实战演练', short: '讲稿' }
  if (index === 11) return { n: 12, key: 'talk', title: '说课训练', short: '说课' }
  return DELIVERY_STEPS[index] || DELIVERY_STEPS[0]
}

function listFlowSteps() {
  return DELIVERY_STEPS.map((item, index) => ({
    key: item.key,
    mark: String(item.n),
    title: item.title,
    shortTitle: item.short,
    goal: item.title,
    detail: item.title,
    group: '10步交付',
    kind: 'guide',
    index: index,
    n: item.n
  }))
}

function detectProgress(text) {
  const src = String(text || '')
  const result = {
    currentStep: 0,
    completedStep: 0,
    allTenDone: /【十步完成】/.test(src) || /10\s*步已完成/.test(src),
    exam1Done: /【检验1完成】/.test(src),
    exam2Done: /【检验2完成】/.test(src)
  }
  const done = src.match(/【步骤完成[:：]\s*(\d{1,2})\s*】/)
  if (done) result.completedStep = clampStep(done[1], 10)
  const cur = src.match(/【当前步骤[:：]\s*(\d{1,2})\s*】/)
    || src.match(/(?:^|\n)\s*current_step\s*=\s*(\d{1,2})/)
    || src.match(/第\s*(\d{1,2})\s*步/)
  if (cur) result.currentStep = clampStep(cur[1], 12)
  if (!result.currentStep) {
    DELIVERY_STEPS.forEach((step) => {
      if (src.indexOf('## ' + step.title) >= 0) result.currentStep = step.n
    })
  }
  if (/【检验1】|command=exam1/.test(src)) result.currentStep = 11
  if (/【检验2】|command=exam2/.test(src)) result.currentStep = 12
  if (result.allTenDone && !result.currentStep) result.currentStep = 11
  return result
}

function applyProgress(prev, detected, command) {
  const done = {}
  ;((prev && prev.completedSteps) || []).forEach((n) => { done[n] = true })
  let current = (prev && prev.currentStep) || 1
  const hit = detected || {}
  if (hit.completedStep) {
    done[hit.completedStep] = true
    current = Math.min(11, hit.completedStep + 1)
  }
  if (hit.currentStep && hit.currentStep <= 10) {
    current = hit.currentStep
    for (let i = 1; i < current; i++) done[i] = true
  }
  if (hit.allTenDone) {
    for (let i = 1; i <= 10; i++) done[i] = true
    current = Math.max(current, 11)
  }
  let exam1Done = !!(prev && prev.exam1Done) || !!hit.exam1Done
  let exam2Done = !!(prev && prev.exam2Done) || !!hit.exam2Done
  if (command === 'exam1') {
    current = 11
    for (let i = 1; i <= 10; i++) done[i] = true
    if (hit.exam1Done) exam1Done = true
  }
  if (command === 'exam2') {
    current = 12
    if (hit.exam2Done) exam2Done = true
  }
  if (hit.currentStep >= 11) current = hit.currentStep
  const completedSteps = []
  for (let i = 1; i <= 10; i++) {
    if (done[i]) completedSteps.push(i)
  }
  return {
    currentStep: current,
    completedSteps: completedSteps,
    exam1Done: exam1Done,
    exam2Done: exam2Done,
    finished: completedSteps.length >= 10
  }
}

function inferProgress(messages) {
  let state = {
    currentStep: 1,
    completedSteps: [],
    exam1Done: false,
    exam2Done: false,
    finished: false
  }
  ;(messages || []).forEach((item) => {
    if (!item || item.hidden || item.failed) return
    const tagged = Number(item.step) || 0
    const detected = item.role === 'assistant' ? detectProgress(item.content) : {}
    if (tagged >= 11) detected.currentStep = tagged
    else if (tagged && !detected.currentStep) detected.currentStep = tagged
    state = applyProgress(state, detected, item.command || '')
  })
  return state
}

function paintStepViews(progress) {
  const current = (progress && progress.currentStep) || 1
  const done = {}
  ;((progress && progress.completedSteps) || []).forEach((n) => { done[n] = true })
  return DELIVERY_STEPS.map((item, index) => {
    const isDone = !!done[item.n]
    const isCurrent = item.n === current && current <= 10
    return {
      key: item.key,
      n: item.n,
      mark: String(item.n),
      title: item.title,
      shortTitle: item.short,
      index: index,
      status: isDone ? 'done' : (isCurrent ? 'current' : 'todo'),
      done: isDone,
      current: isCurrent
    }
  })
}

function packTurn(text, progress, command, extra) {
  const step = (progress && progress.currentStep) || 1
  const meta = stepMeta(step)
  const source = (extra && extra.source) || (progress && progress.source) || 'catalog'
  const lines = [
    '【进度上下文】',
    'current_step=' + step,
    'step_name=' + meta.title,
    'completed=' + ((progress && progress.completedSteps) || []).join(','),
    'command=' + (command || 'reply'),
    'source=' + source,
    'lesson_kind=' + (source === 'personal' ? 'personal' : 'builtin')
  ]
  if (source === 'personal' && extra && extra.planTitle) {
    lines.push('plan_title=' + extra.planTitle)
  }
  lines.push('---')
  lines.push(String(text || ''))
  return lines.join('\n')
}

function replayPrompt(step) {
  const meta = stepMeta(step)
  return '请回到第' + meta.n + '步「' + meta.title + '」重新引导。不要跳到后面的步骤。按排版规范输出本步目标、核心逻辑、场景话术、下一步提问，并在开头写【当前步骤：' + meta.n + '】。'
}

function exam1Prompt() {
  return [
    '请进入检验1：实战演练。根据本课题已学的10步，分两段输出，标题必须原样使用：',
    '## 讲课逐字稿',
    '完整可上场讲的逐字稿，分段、加粗重点。',
    '## 诊断报告',
    '从结构、节奏、话术、风险四块评价，每块先给结论再给依据。',
    '开头写【当前步骤：11】【检验1】，结束写【检验1完成】。'
  ].join('\n')
}

function exam2Prompt() {
  return [
    '请进入检验2：说课训练。分两段输出，标题必须原样使用：',
    '## 说课逐字稿',
    '讲师向教研说明「为什么这样上」的逐字稿。',
    '## PPT大纲',
    '只给文本大纲：第N页标题 + 3到5条要点。不要输出 pptx，不要给下载链接。',
    '开头写【当前步骤：12】【检验2】，结束写【检验2完成】。'
  ].join('\n')
}

function normalizeStep(item, index) {
  const title = String((item && (item.title || item.name || item.环节 || item.标题)) || '').trim()
  const goal = String((item && (item.goal || item.aim || item.目标 || item.description || item.desc)) || '').trim()
  if (!title) return null
  return {
    key: 'coze-' + index + '-' + title,
    mark: String(index + 1),
    title: title,
    shortTitle: shortTitle(title, 4),
    goal: goal,
    detail: goal,
    group: (item && (item.group || item.模块)) || '智学环节',
    kind: 'guide',
    index: index
  }
}

function parseJsonSteps(text) {
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
    return []
  }
  if (!Array.isArray(data)) return []
  return data.map(normalizeStep).filter(Boolean)
}

function cleanStepTitle(text) {
  return String(text || '')
    .replace(/[*_`#]+/g, '')
    .replace(/^\s*[\d一二三四五六七八九十]+[\.、．\)]\s*/, '')
    .replace(/^第\s*\d+\s*[节步环节章]\s*[:：]?\s*/, '')
    .trim()
}

function parseListedSteps(text) {
  const fromJson = parseJsonSteps(text)
  if (fromJson.length >= 2) return fromJson
  const lines = String(text || '').split(/\n/)
  const steps = []
  const seen = {}
  const numbered = /^\s*(?:(?:\d{1,2}|[一二三四五六七八九十]+)[\.、．\)]|（\d{1,2}）|\(\d{1,2}\)|第\s*\d{1,2}\s*[节步环节章]|环节\s*\d{1,2}|模块\s*[一二三四五六七八九十\d]+)\s*[:：.\s]?\s*(.+)\s*$/
  lines.forEach((line) => {
    const match = line.match(numbered)
    if (!match) return
    const title = cleanStepTitle(match[1])
    if (!title || title.length > 36 || seen[title]) return
    seen[title] = true
    const step = normalizeStep({ title: title }, steps.length)
    if (step) steps.push(step)
  })
  return steps
}

function mergeSteps(current, incoming) {
  const have = current || []
  const extra = incoming || []
  if (!have.length) return extra
  if (!extra.length) return have
  const seen = {}
  have.forEach((item) => { seen[item.title] = true })
  const next = have.slice()
  extra.forEach((item) => {
    if (!item || !item.title || seen[item.title]) return
    seen[item.title] = true
    next.push(normalizeStep(item, next.length))
  })
  return next
}

function firstLiveIndex() {
  return 0
}

function topicTitleOf(course, fallback) {
  const hit = matchCanonical(
    course && course.title,
    course && course.displayTitle,
    fallback
  )
  if (hit) return hit.title
  return String((course && (course.displayTitle || course.title)) || fallback || '').trim()
}

function startPrompt(course, fallback) {
  const title = topicTitleOf(course, fallback)
  if (sourceOf(course) === 'personal' && course && course.planText) {
    return packPersonalStart(title, course.planText)
  }
  return title
}

function detectAdvance(text, steps, completedCount) {
  const hit = detectProgress(text)
  if (hit.completedStep) return hit.completedStep
  if (hit.currentStep) return Math.max(0, hit.currentStep - 1)
  return Math.max(0, Number(completedCount) || 0)
}

module.exports = {
  FLOW_VERSION: FLOW_VERSION,
  OPEN_SESSION_ID: OPEN_SESSION_ID,
  PENDING_TOPIC_KEY: PENDING_TOPIC_KEY,
  PENDING_LESSON_KEY: PENDING_LESSON_KEY,
  TOPIC_DRAFT_KEY: TOPIC_DRAFT_KEY,
  OPEN_GUIDE_PROMPT: OPEN_GUIDE_PROMPT,
  DELIVERY_STEPS: DELIVERY_STEPS,
  parseListedSteps: parseListedSteps,
  mergeSteps: mergeSteps,
  listFlowSteps: listFlowSteps,
  firstLiveIndex: firstLiveIndex,
  topicTitleOf: topicTitleOf,
  startPrompt: startPrompt,
  detectAdvance: detectAdvance,
  detectProgress: detectProgress,
  applyProgress: applyProgress,
  inferProgress: inferProgress,
  paintStepViews: paintStepViews,
  packTurn: packTurn,
  stepMeta: stepMeta,
  replayPrompt: replayPrompt,
  exam1Prompt: exam1Prompt,
  exam2Prompt: exam2Prompt
}
