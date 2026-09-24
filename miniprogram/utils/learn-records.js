const history = require('./learn-history.js')
const results = require('./learn-results.js')
const { inferProgress, stepMeta } = require('./flow.js')

function recordKey(lessonCode, topicTitle) {
  const code = history.lessonCodeOf(lessonCode, 'open')
  if (code === 'open' && topicTitle) return 'open|' + String(topicTitle)
  return code
}

function progressLabel(progress) {
  const done = ((progress && progress.completedSteps) || []).length
  if (done >= 10) return '已完成10步'
  const n = (progress && progress.currentStep) || 1
  const meta = stepMeta(n)
  return '学习中：第' + n + '步 · ' + meta.title
}

function progressRatio(progress) {
  const done = ((progress && progress.completedSteps) || []).length
  return Math.min(100, Math.round((done / 10) * 100))
}

function mergeRecords(messageRows, resultRows) {
  const buckets = {}
  ;(messageRows || []).forEach((row) => {
    const code = history.lessonCodeOf(row.lesson_code || row.课号, 'open')
    const title = row.topic_title || row.课题 || ''
    const key = recordKey(code, title)
    if (!buckets[key]) {
      buckets[key] = {
        lessonCode: code,
        topicTitle: title || code,
        messages: [],
        updatedAt: '',
        resultGroup: null
      }
    }
    buckets[key].messages.push(row)
    const ts = row.created_at || row.更新时间 || ''
    if (ts && ts > buckets[key].updatedAt) buckets[key].updatedAt = ts
    if (title) buckets[key].topicTitle = title
  })
  results.groupByLesson(resultRows || []).forEach((group) => {
    const key = recordKey(group.lessonCode, group.topicTitle)
    if (!buckets[key]) {
      buckets[key] = {
        lessonCode: group.lessonCode,
        topicTitle: group.topicTitle,
        messages: [],
        updatedAt: group.updatedAt || '',
        resultGroup: group
      }
    } else {
      buckets[key].resultGroup = group
      if (group.updatedAt && group.updatedAt > buckets[key].updatedAt) {
        buckets[key].updatedAt = group.updatedAt
      }
      if (group.topicTitle) buckets[key].topicTitle = group.topicTitle
    }
  })
  return Object.keys(buckets).sort((a, b) => {
    return String(buckets[b].updatedAt || '').localeCompare(String(buckets[a].updatedAt || ''))
  }).map((key) => {
    const bucket = buckets[key]
    const session = history.rowsToSession(bucket.messages, bucket.topicTitle)
    const progress = inferProgress(session.messages)
    const finished = !!(progress.finished || (progress.completedSteps || []).length >= 10)
    const group = bucket.resultGroup
    return {
      key: key,
      lessonCode: bucket.lessonCode,
      topicTitle: bucket.topicTitle || bucket.lessonCode,
      updatedAt: bucket.updatedAt,
      currentStep: progress.currentStep || 1,
      completedCount: (progress.completedSteps || []).length,
      finished: finished,
      exam1Done: !!progress.exam1Done,
      exam2Done: !!progress.exam2Done,
      progressText: progressLabel(progress),
      percent: progressRatio(progress),
      resultSummary: (group && group.summary) || '',
      readyCount: (group && group.readyCount) || 0,
      chips: (group && group.chips) || []
    }
  })
}

function listStudyRecords(token) {
  return Promise.all([
    history.listAllMessages(token).catch(() => []),
    results.listResults(token).catch(() => [])
  ]).then((pair) => mergeRecords(pair[0], pair[1]))
}

module.exports = {
  recordKey: recordKey,
  progressLabel: progressLabel,
  progressRatio: progressRatio,
  mergeRecords: mergeRecords,
  listStudyRecords: listStudyRecords
}
