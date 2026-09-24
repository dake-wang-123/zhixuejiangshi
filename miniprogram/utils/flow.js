const { shortTitle } = require('./study.js')
const { matchCanonical } = require('./coze-catalog.js')
const { packPersonalStart, sourceOf } = require('./personal-plan.js')

const FLOW_VERSION = 15
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

const CN_GATE = {
  一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10
}

function parseGateNum(raw) {
  const token = String(raw || '').trim()
  if (!token) return 0
  if (/^\d{1,2}$/.test(token)) return clampStep(token, 12)
  if (CN_GATE[token]) return CN_GATE[token]
  return 0
}

function stripGateMarkers(text) {
  return String(text || '')
    .replace(/\[\s*下一关\s*[:：]\s*[^\]]+\]/g, '')
    .replace(/\[\s*当前关\s*[:：]\s*[^\]]+\]/g, '')
    .replace(/\[\s*等待确认\s*[:：]\s*[^\]]+\]/g, '')
    .replace(/\[\s*检验进度\s*[:：]\s*[^\]]+\]/g, '')
    .replace(/\[\s*全部通关\s*\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function extractInspect(text) {
  const src = String(text || '')
  return {
    waitExam1: /\[\s*等待确认\s*[:：]\s*检验\s*\]/.test(src) || /是否进入(?:实战)?检验环节/.test(src),
    waitExam2: /\[\s*等待确认\s*[:：]\s*检验2\s*\]/.test(src) || /是否进入检验2|是否进入说课/.test(src),
    inspect1: /\[\s*检验进度\s*[:：]\s*1\s*\/\s*2\s*\]/.test(src),
    inspect2: /\[\s*检验进度\s*[:：]\s*2\s*\/\s*2\s*\]/.test(src),
    exam1Done: /【检验1完成】/.test(src),
    exam2Done: /【检验2完成】/.test(src),
    allClear: /\[\s*全部通关\s*\]/.test(src)
  }
}

function isConfirmText(text) {
  return /^(好的?|是的?|确认(进入)?|开始(检验)?|进入检验|进入实战|继续)$/.test(String(text || '').trim())
}

function extractNextStep(text) {
  const src = String(text || '')
  const result = {
    nextStep: 0,
    completedStep: 0,
    cleared: false,
    allTenDone: /【十步完成】/.test(src) || /10\s*步已完成/.test(src)
  }
  const marker = src.match(/\[\s*下一关\s*[:：]\s*(\d{1,2}|[一二三四五六七八九十两])\s*\]/)
  if (marker) {
    result.nextStep = parseGateNum(marker[1])
    result.cleared = true
    if (result.nextStep >= 2) result.completedStep = Math.min(10, result.nextStep - 1)
    if (result.nextStep >= 11) result.allTenDone = true
  }
  const taggedDone = src.match(/【步骤完成[:：]\s*(\d{1,2})\s*】/)
  if (taggedDone) {
    result.completedStep = clampStep(taggedDone[1], 10)
    result.cleared = true
    if (!result.nextStep) result.nextStep = Math.min(11, result.completedStep + 1)
  }
  const taggedCur = src.match(/【当前步骤[:：]\s*(\d{1,2})\s*】/)
  if (taggedCur && !result.nextStep) result.nextStep = clampStep(taggedCur[1], 12)
  if (result.allTenDone && !result.nextStep) result.nextStep = 11
  if (result.nextStep >= 11) result.allTenDone = true
  return result
}

function startStepPrompt(n) {
  const meta = stepMeta(n)
  return '请开始第' + meta.n + '步的内容。本步是「' + meta.title + '」。只讲这一步并提问，不要跳步，不要写【步骤完成】，不要写[下一关]。第一行写【当前步骤：' + meta.n + '】。'
}

function detectProgress(text, currentStep) {
  const src = String(text || '')
  const gate = extractNextStep(src, currentStep)
  const inspect = extractInspect(src)
  const result = {
    currentStep: gate.nextStep || 0,
    completedStep: gate.completedStep || 0,
    allTenDone: gate.allTenDone || inspect.waitExam1,
    exam1Done: inspect.exam1Done,
    exam2Done: inspect.exam2Done,
    waitExam1: inspect.waitExam1,
    waitExam2: inspect.waitExam2,
    inspect1: inspect.inspect1,
    inspect2: inspect.inspect2,
    allClear: inspect.allClear
  }
  if (/【检验1】|command=exam1/.test(src)) result.currentStep = 11
  if (/【检验2】|command=exam2/.test(src)) result.currentStep = 12
  if (result.allTenDone && !result.currentStep) result.currentStep = 10
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
  }
  let exam1Done = !!(prev && prev.exam1Done) || !!hit.exam1Done
  let exam2Done = !!(prev && prev.exam2Done) || !!hit.exam2Done
  let currentPhase = (prev && prev.currentPhase) || 'learning'
  let inspectionStep = Number((prev && prev.inspectionStep) || 0)
  let inspectWait = (prev && prev.inspectWait) || ''
  const inspecting = currentPhase === 'inspection' || command === 'exam1' || command === 'exam2'
  if (command === 'exam1' || hit.inspect1) {
    currentPhase = 'inspection'
    inspectionStep = 1
    inspectWait = ''
    current = 11
    for (let i = 1; i <= 10; i++) done[i] = true
    if (hit.exam1Done) exam1Done = true
  }
  if (command === 'exam2' || hit.inspect2) {
    currentPhase = 'inspection'
    inspectionStep = 2
    inspectWait = ''
    current = 12
    if (hit.exam2Done) exam2Done = true
  }
  if (hit.exam1Done) {
    exam1Done = true
    currentPhase = 'inspection'
    inspectionStep = Math.max(inspectionStep, 1)
    if (!exam2Done) inspectWait = 'exam2'
  }
  if (hit.exam2Done || hit.allClear) {
    exam2Done = true
    inspectWait = ''
    currentPhase = 'inspection'
    inspectionStep = 2
  }
  if (hit.waitExam1 && !exam1Done) inspectWait = 'exam1'
  if (hit.waitExam2 && exam1Done && !exam2Done) inspectWait = 'exam2'
  const completedSteps = []
  for (let i = 1; i <= 10; i++) {
    if (done[i]) completedSteps.push(i)
  }
  const finished = completedSteps.length >= 10
  if (finished && !inspecting && currentPhase !== 'inspection') {
    current = 10
    if (!exam1Done) inspectWait = inspectWait || 'exam1'
  }
  if (inspecting && hit.currentStep >= 11) current = hit.currentStep
  return {
    currentStep: current,
    completedSteps: completedSteps,
    exam1Done: exam1Done,
    exam2Done: exam2Done,
    finished: finished,
    currentPhase: currentPhase,
    inspectionStep: inspectionStep,
    inspectWait: inspectWait
  }
}

function inferProgress(messages) {
  let state = {
    currentStep: 1,
    completedSteps: [],
    exam1Done: false,
    exam2Done: false,
    finished: false,
    currentPhase: 'learning',
    inspectionStep: 0,
    inspectWait: ''
  }
  ;(messages || []).forEach((item) => {
    if (!item || item.hidden || item.failed) return
    const tagged = Number(item.step) || 0
    const detected = item.role === 'assistant' ? detectProgress(item.content, state.currentStep) : {}
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

function rawUserMessage(text) {
  const src = String(text || '')
  if (src.indexOf('【进度上下文】') === 0) {
    const idx = src.indexOf('\n---\n')
    if (idx >= 0) return src.slice(idx + 5)
  }
  return src
}

function packTurn(text) {
  return rawUserMessage(text)
}

function replayPrompt(step) {
  const meta = stepMeta(step)
  return '请回到第' + meta.n + '步「' + meta.title + '」重新引导。不要跳到后面的步骤。按排版规范输出本步目标、核心逻辑、场景话术、下一步提问，并在开头写【当前步骤：' + meta.n + '】。'
}

function exam1ConfirmPrompt() {
  return '讲师已确认，请开始检验1的内容。\n' + exam1Prompt()
}

function exam2ConfirmPrompt() {
  return '讲师已确认，请开始检验2的内容。\n' + exam2Prompt()
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
  parseGateNum: parseGateNum,
  extractNextStep: extractNextStep,
  extractInspect: extractInspect,
  isConfirmText: isConfirmText,
  stripGateMarkers: stripGateMarkers,
  startStepPrompt: startStepPrompt,
  exam1ConfirmPrompt: exam1ConfirmPrompt,
  exam2ConfirmPrompt: exam2ConfirmPrompt,
  detectProgress: detectProgress,
  applyProgress: applyProgress,
  inferProgress: inferProgress,
  paintStepViews: paintStepViews,
  rawUserMessage: rawUserMessage,
  packTurn: packTurn,
  stepMeta: stepMeta,
  replayPrompt: replayPrompt,
  exam1Prompt: exam1Prompt,
  exam2Prompt: exam2Prompt
}
