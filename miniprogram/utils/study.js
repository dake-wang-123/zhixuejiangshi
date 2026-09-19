const { formatAnalysis } = require('./analysis.js')

const CURSOR_KEY = 'study_cursors_v2'

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function shortTitle(title, limit) {
  const text = String(title || '').trim()
  const max = limit || 6
  if (text.length <= max) return text || '步骤'
  return text.slice(0, max)
}

function progressToRatio(progress) {
  const n = Number(progress || 0)
  if (!isFinite(n) || n < 0) return 0
  return n <= 1 ? n : n / 100
}

function ratioFromFurthest(furthest, total) {
  if (!total) return 0
  return clamp((Number(furthest) + 1) / total, 0, 1)
}

function furthestFromRatio(ratio, total) {
  if (!total || ratio <= 0) return 0
  return clamp(Math.round(progressToRatio(ratio) * total) - 1, 0, total - 1)
}

function loadCursors() {
  try {
    if (typeof wx === 'undefined' || !wx.getStorageSync) return {}
    return wx.getStorageSync(CURSOR_KEY) || {}
  } catch (e) {
    return {}
  }
}

function saveCursor(courseId, payload) {
  const all = loadCursors()
  all[String(courseId)] = payload
  if (typeof wx !== 'undefined' && wx.setStorageSync) {
    wx.setStorageSync(CURSOR_KEY, all)
  }
}

function readCursor(courseId) {
  const all = loadCursors()
  return all[String(courseId)] || null
}

function buildStudySteps(course, analysis) {
  const item = course || {}
  const view = analysis || formatAnalysis(item.ai_analysis) || {
    courseName: '',
    summaryText: '',
    chapters: [],
    tags: [],
    topics: [],
    direction: ''
  }
  const steps = []
  const overviewDetail = [
    view.summaryText || item.description || '先看课程导读，再按智能体拆出的步骤逐段学习。',
    view.direction ? '专业方向：' + view.direction : '',
    (view.tags && view.tags.length) ? '标签：' + view.tags.join('、') : '',
    (view.topics && view.topics.length)
      ? '推荐课题：' + view.topics.map((topic) => topic.name).join('、')
      : ''
  ].filter(Boolean).join('\n\n')
  steps.push({
    key: 'overview',
    title: (view.courseName || item.title || '课程导读'),
    shortTitle: '导读',
    detail: overviewDetail,
    group: '课程导读',
    kind: 'overview'
  })
  ;(view.chapters || []).forEach((chapter, index) => {
    steps.push({
      key: chapter.key || ('ch-' + index + '-' + chapter.title),
      title: chapter.title,
      shortTitle: shortTitle(chapter.title, 6),
      detail: chapter.detail || '这一步还没有正文。可回到教案页重新解析，或先看相邻步骤。',
      group: chapter.group || '章节学习',
      kind: 'chapter'
    })
  })
  return {
    view: view,
    steps: steps,
    courseName: view.courseName || item.title || '未命名课程'
  }
}

function isolateStep(steps, index) {
  const list = steps || []
  const i = clamp(Number(index) || 0, 0, Math.max(0, list.length - 1))
  const step = list[i]
  if (!step) {
    return {
      key: 'empty',
      title: '暂无步骤',
      detail: '这门课还没有智能体解析出的学习步骤。',
      group: '课程导读',
      kind: 'empty',
      index: 0,
      ordinal: 1,
      shortTitle: '空'
    }
  }
  return {
    key: step.key,
    title: step.title,
    shortTitle: step.shortTitle,
    detail: step.detail,
    group: step.group,
    kind: step.kind,
    index: i,
    ordinal: i + 1
  }
}

function groupSteps(steps) {
  const groups = []
  const map = {}
  ;(steps || []).forEach((step, index) => {
    const name = step.group || '章节学习'
    if (!map[name]) {
      map[name] = { name: name, items: [] }
      groups.push(map[name])
    }
    map[name].items.push({
      key: step.key,
      title: step.title,
      index: index,
      ordinal: index + 1
    })
  })
  return groups
}

function resumePosition(serverProgress, cursor, steps, studyId) {
  const total = (steps || []).length
  const serverFurthest = furthestFromRatio(serverProgress, total)
  let furthest = serverFurthest
  let current = serverFurthest
  if (cursor && String(cursor.studyId || '') === String(studyId || '')) {
    if (typeof cursor.furthest === 'number') {
      furthest = Math.max(furthest, clamp(cursor.furthest, 0, Math.max(0, total - 1)))
    }
    let byKey = -1
    if (cursor.stepKey) {
      byKey = (steps || []).findIndex((step) => step.key === cursor.stepKey)
    }
    if (byKey >= 0) current = byKey
    else if (typeof cursor.stepIndex === 'number') current = clamp(cursor.stepIndex, 0, Math.max(0, total - 1))
  }
  const percent = Math.round(ratioFromFurthest(furthest, total) * 100)
  return {
    current: clamp(current, 0, Math.max(0, total - 1)),
    furthest: clamp(furthest, 0, Math.max(0, total - 1)),
    percent: total ? percent : 0,
    total: total
  }
}

function persistCursor(courseId, studyId, step, furthest, total) {
  if (!courseId) return
  saveCursor(courseId, {
    studyId: studyId || '',
    stepIndex: step.index,
    stepKey: step.key,
    furthest: furthest,
    totalSteps: total,
    updatedAt: Date.now()
  })
}

module.exports = {
  clamp: clamp,
  shortTitle: shortTitle,
  progressToRatio: progressToRatio,
  ratioFromFurthest: ratioFromFurthest,
  furthestFromRatio: furthestFromRatio,
  readCursor: readCursor,
  saveCursor: saveCursor,
  persistCursor: persistCursor,
  buildStudySteps: buildStudySteps,
  isolateStep: isolateStep,
  groupSteps: groupSteps,
  resumePosition: resumePosition
}
