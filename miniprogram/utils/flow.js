const { shortTitle } = require('./study.js')
const { formatAnalysis } = require('./analysis.js')

const FLOW_VERSION = 3
const OPEN_SESSION_ID = 'open'

const RAW_STEPS = [
  {
    key: 'pick',
    mark: '0',
    title: '选择课题',
    shortTitle: '选题',
    group: '开场',
    skipIfCourse: true,
    goal: '讲师输入课题名称，系统调取对应教案。'
  },
  {
    key: 'intro',
    mark: '1',
    title: '自我介绍',
    shortTitle: '介绍',
    group: '模块一',
    goal: '帮讲师建立“我凭什么能讲这节课”的专业自信。'
  },
  {
    key: 'break',
    mark: '2',
    title: '破题',
    shortTitle: '破题',
    group: '模块二',
    goal: '说清楚这节课讲什么、为什么讲。'
  },
  {
    key: 'value',
    mark: '3',
    title: '目标与价值',
    shortTitle: '目标',
    group: '模块三',
    goal: '让家长知道听完这节课能带走什么（只给承诺，不剧透）。'
  },
  {
    key: 'empathy',
    mark: '4',
    title: '同理家长',
    shortTitle: '同理',
    group: '模块四',
    goal: '让家长觉得老师懂他，建立情感连接。'
  },
  {
    key: 'align-collect',
    mark: '5a',
    title: '收集认知',
    shortTitle: '收集',
    group: '模块五 对齐认知',
    goal: '分三个小块逐块推进的第一块：收集认知。'
  },
  {
    key: 'align-explain',
    mark: '5b',
    title: '专业解释',
    shortTitle: '解释',
    group: '模块五 对齐认知',
    goal: '分三个小块逐块推进的第二块：专业解释。'
  },
  {
    key: 'align-mentalize',
    mark: '5c',
    title: '心智化',
    shortTitle: '心智',
    group: '模块五 对齐认知',
    goal: '分三个小块逐块推进的第三块：心智化。'
  },
  {
    key: 'method',
    mark: '6',
    title: '方法与策略',
    shortTitle: '方法',
    group: '模块六',
    goal: '把具体操作方法讲清楚、讲具体、可落地。'
  },
  {
    key: 'case',
    mark: '7',
    title: '案例萃取',
    shortTitle: '案例',
    group: '模块七',
    goal: '萃取讲师自己的真实案例，打磨后放到合适位置。'
  },
  {
    key: 'interact',
    mark: '8',
    title: '互动设计',
    shortTitle: '互动',
    group: '模块八',
    goal: '设计课堂互动，明确在哪里问、问什么、为什么问。'
  },
  {
    key: 'faq',
    mark: '9',
    title: '误区与答疑',
    shortTitle: '答疑',
    group: '模块九',
    goal: '预判家长可能存在的误区，提前准备好回应。'
  },
  {
    key: 'close',
    mark: '10',
    title: '总结收尾',
    shortTitle: '收尾',
    group: '模块十',
    goal: '用一句金句收束全课，给家长一个最小可执行行动。'
  },
  {
    key: 'rehearse',
    mark: '11',
    title: '模拟讲课',
    shortTitle: '模拟',
    group: '演练',
    goal: '讲师把整堂课从头到尾完整讲一遍，案例和互动已自然融入。'
  },
  {
    key: 'diagnose',
    mark: '12',
    title: '诊断评价',
    shortTitle: '诊断',
    group: '演练',
    goal: '从逻辑链、教案呈现度、专业度、案例、互动、讲师姿态等维度打分并点评。'
  },
  {
    key: 'lecture-script',
    mark: '13',
    title: '输出讲课逐字稿',
    shortTitle: '讲稿',
    group: '输出',
    goal: '根据模拟讲课和诊断补充，生成完整讲课逐字稿。'
  },
  {
    key: 'shuoke',
    mark: '14',
    title: '说课训练',
    shortTitle: '说课',
    group: '说课',
    goal: '讲师讲清楚“为什么这样设计”，而不是复述课程内容。'
  },
  {
    key: 'shuoke-script',
    mark: '15',
    title: '输出说课逐字稿',
    shortTitle: '说稿',
    group: '说课',
    goal: '生成精简版说课逐字稿，用于向同行或评委介绍课程设计思路。'
  }
]

function listFlowSteps() {
  return RAW_STEPS.map((item, index) => ({
    key: item.key,
    mark: item.mark,
    title: item.title,
    shortTitle: item.shortTitle || shortTitle(item.title, 4),
    group: item.group,
    goal: item.goal,
    detail: item.goal,
    skipIfCourse: !!item.skipIfCourse,
    kind: 'flow',
    index: index
  }))
}

function firstLiveIndex(hasCourse) {
  return hasCourse ? 1 : 0
}

function lessonMaterial(course) {
  const item = course || {}
  const view = formatAnalysis(item.ai_analysis) || {}
  const lines = []
  const title = item.title || view.courseName || ''
  if (title) lines.push('课题名称：' + title)
  if (item.category_id && item.category_id.name) lines.push('分类：' + item.category_id.name)
  if (item.description) lines.push(item.description)
  if (view.summaryText) lines.push(view.summaryText)
  if (view.direction) lines.push('专业方向：' + view.direction)
  if (view.chapters && view.chapters.length) {
    lines.push('教案结构：')
    view.chapters.forEach((chapter, index) => {
      lines.push((index + 1) + '. ' + (chapter.title || '') + (chapter.detail ? '：' + String(chapter.detail).slice(0, 120) : ''))
    })
  }
  return lines.join('\n').slice(0, 3500)
}

function courseLabel(course, fallback) {
  if (course && course.title) return '《' + course.title + '》'
  if (fallback) return '《' + fallback + '》'
  return '当前课题'
}

function skipGreetingRules() {
  return [
    '课题已经选定，用户从课程目录点进本课。',
    '请立刻调取对应教案，直接进入学习流程，不要再确认课题。',
    '严禁打招呼或寒暄，不要说「你好呀宝爸」「你好呀宝妈」这类开场。',
    '严禁询问「请问你是要学习这个课题吗」或任何是否开始学习的确认句。'
  ].join('\n')
}

function openGreetingRules() {
  return [
    '用户直接进入智学伴练，还没有选择任何课程。',
    '请按你惯常的方式打招呼并引导讲师说出课题名称，确认后再调取对应教案。',
    '在选定课题之前，只停留在「选择课题」，不要进入模块一。'
  ].join('\n')
}

function stageCoach(step) {
  if (!step) return ''
  return '当前环节：' + (step.group ? step.group + ' · ' : '') + step.title + '\n目标：' + (step.goal || '')
}

function openStartPrompt() {
  return [
    '开始「智学伴练」完整学习流程（从自我介绍到输出说课逐字稿）。',
    openGreetingRules(),
    stageCoach(listFlowSteps()[0])
  ].join('\n')
}

function courseStartPrompt(course) {
  const steps = listFlowSteps()
  const first = steps[1]
  const label = courseLabel(course)
  const material = lessonMaterial(course)
  const lines = [
    '开始「智学伴练」完整学习流程。',
    '选定课题：' + label + (course && course.category_id && course.category_id.name ? '（' + course.category_id.name + '）' : '') + '。',
    skipGreetingRules(),
    stageCoach(first),
    '请现在开始模块一：自我介绍，帮讲师建立“我凭什么能讲这节课”的专业自信。'
  ]
  if (material) {
    lines.push('教案材料：')
    lines.push(material)
  }
  return lines.join('\n')
}

function stageEnterPrompt(step, course, topicTitle) {
  const label = courseLabel(course, topicTitle)
  const lines = [
    '课题' + label + '进入下一环节。不要重新确认课题，不要打招呼。',
    stageCoach(step),
    '只进行这一环节。完成后等讲师点「完成本环节」再继续，不要跳步。'
  ]
  if (step && step.key === 'rehearse') {
    lines.push('请引导讲师把整堂课从头到尾完整讲一遍，此前打磨的案例和互动要自然融入。')
  }
  if (step && step.key === 'diagnose') {
    lines.push('请从逻辑链、教案呈现度、专业度、案例、互动、讲师姿态等维度打分并点评。')
  }
  if (step && step.key === 'lecture-script') {
    lines.push('请根据模拟讲课和诊断补充，生成完整讲课逐字稿。')
  }
  if (step && step.key === 'shuoke') {
    lines.push('请让讲师讲清楚“为什么这样设计”，而不是复述课程内容。')
  }
  if (step && step.key === 'shuoke-script') {
    lines.push('请生成精简版说课逐字稿，用于向同行或评委介绍课程设计思路。')
  }
  return lines.join('\n')
}

function messagesForStage(messages, stageIndex) {
  return (messages || []).filter((item) => !item.hidden && Number(item.stageIndex) === Number(stageIndex))
}

module.exports = {
  FLOW_VERSION: FLOW_VERSION,
  OPEN_SESSION_ID: OPEN_SESSION_ID,
  listFlowSteps: listFlowSteps,
  firstLiveIndex: firstLiveIndex,
  lessonMaterial: lessonMaterial,
  openStartPrompt: openStartPrompt,
  courseStartPrompt: courseStartPrompt,
  stageEnterPrompt: stageEnterPrompt,
  messagesForStage: messagesForStage,
  skipGreetingRules: skipGreetingRules
}
