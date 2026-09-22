const { shortTitle } = require('./study.js')
const { matchCanonical } = require('./coze-catalog.js')

const FLOW_VERSION = 5
const OPEN_SESSION_ID = 'open'
const PENDING_TOPIC_KEY = 'zhixue_pending_topic'
const TOPIC_DRAFT_KEY = 'zhixue_topic_draft'

const RAW_STEPS = [
  { key: 'pick', mark: '0', title: '选择课题', shortTitle: '选题', group: '开场', skipIfCourse: true },
  { key: 'intro', mark: '1', title: '自我介绍', shortTitle: '介绍', group: '模块一' },
  { key: 'break', mark: '2', title: '破题', shortTitle: '破题', group: '模块二' },
  { key: 'value', mark: '3', title: '目标与价值', shortTitle: '目标', group: '模块三' },
  { key: 'empathy', mark: '4', title: '同理家长', shortTitle: '同理', group: '模块四' },
  { key: 'align-collect', mark: '5a', title: '收集认知', shortTitle: '收集', group: '模块五 对齐认知' },
  { key: 'align-explain', mark: '5b', title: '专业解释', shortTitle: '解释', group: '模块五 对齐认知' },
  { key: 'align-mentalize', mark: '5c', title: '心智化', shortTitle: '心智', group: '模块五 对齐认知' },
  { key: 'method', mark: '6', title: '方法与策略', shortTitle: '方法', group: '模块六' },
  { key: 'case', mark: '7', title: '案例萃取', shortTitle: '案例', group: '模块七' },
  { key: 'interact', mark: '8', title: '互动设计', shortTitle: '互动', group: '模块八' },
  { key: 'faq', mark: '9', title: '误区与答疑', shortTitle: '答疑', group: '模块九' },
  { key: 'close', mark: '10', title: '总结收尾', shortTitle: '收尾', group: '模块十' },
  { key: 'rehearse', mark: '11', title: '模拟讲课', shortTitle: '模拟', group: '演练' },
  { key: 'diagnose', mark: '12', title: '诊断评价', shortTitle: '诊断', group: '演练' },
  { key: 'lecture-script', mark: '13', title: '输出讲课逐字稿', shortTitle: '讲稿', group: '输出' },
  { key: 'shuoke', mark: '14', title: '说课训练', shortTitle: '说课', group: '说课' },
  { key: 'shuoke-script', mark: '15', title: '输出说课逐字稿', shortTitle: '说稿', group: '说课' }
]

function listFlowSteps() {
  return RAW_STEPS.map((item, index) => ({
    key: item.key,
    mark: item.mark,
    title: item.title,
    shortTitle: item.shortTitle || shortTitle(item.title, 4),
    group: item.group,
    goal: '',
    skipIfCourse: !!item.skipIfCourse,
    kind: 'flow',
    index: index
  }))
}

function firstLiveIndex(hasCourse) {
  return hasCourse ? 1 : 0
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
  return topicTitleOf(course, fallback)
}

function detectAdvance(text, steps, completedCount) {
  const list = steps || []
  const current = Math.max(0, Number(completedCount) || 0)
  const next = list[current + 1]
  if (!next || !next.title) return current
  if (String(text || '').indexOf(next.title) >= 0) return current + 1
  return current
}

module.exports = {
  FLOW_VERSION: FLOW_VERSION,
  OPEN_SESSION_ID: OPEN_SESSION_ID,
  PENDING_TOPIC_KEY: PENDING_TOPIC_KEY,
  TOPIC_DRAFT_KEY: TOPIC_DRAFT_KEY,
  listFlowSteps: listFlowSteps,
  firstLiveIndex: firstLiveIndex,
  topicTitleOf: topicTitleOf,
  startPrompt: startPrompt,
  detectAdvance: detectAdvance
}
