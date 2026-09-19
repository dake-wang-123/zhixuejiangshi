function asObject(value) {
  if (!value) return null
  if (typeof value === 'object') return value
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch (e) {
      return { raw: value }
    }
  }
  return { raw: String(value) }
}

function firstText(obj, keys) {
  if (!obj) return ''
  if (typeof obj === 'string') return obj
  for (let i = 0; i < keys.length; i++) {
    const value = obj[keys[i]]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function toList(value) {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch (e) {
      return value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean)
    }
  }
  return []
}

function chapterTitle(item, index) {
  if (!item) return '第 ' + (index + 1) + ' 步'
  if (typeof item === 'string') return item
  return item.title || item.name || item.heading || item.chapter || item.step || ('第 ' + (index + 1) + ' 步')
}

function chapterDetail(item) {
  if (!item || typeof item !== 'object') return typeof item === 'string' ? '' : ''
  if (item.summary || item.description || item.content || item.detail || item.text) {
    return item.summary || item.description || item.content || item.detail || item.text || ''
  }
  if (Array.isArray(item.points)) return item.points.filter(Boolean).join('\n')
  if (Array.isArray(item.sections)) {
    return item.sections.map((section) => {
      if (typeof section === 'string') return section
      return (section && (section.title || section.name) || '') + (section && section.content ? '\n' + section.content : '')
    }).filter(Boolean).join('\n\n')
  }
  return ''
}

function chapterGroup(item) {
  if (!item || typeof item !== 'object') return '章节学习'
  return item.category || item.module || item.part || item.group || item.section_group || item.type_name || '章节学习'
}

function tagLabel(item) {
  if (!item) return ''
  if (typeof item === 'string') return item
  return item.name || item.tag || item.label || item.topic || ''
}

function extractCourseName(structure, summary, tags, analysis) {
  const preferred = [
    'course_name', 'courseName', 'course_title', 'courseTitle',
    'lesson_name', 'lessonName', '课程名称', '课程名', '课题名称'
  ]
  return firstText(structure, preferred)
    || firstText(summary, preferred)
    || firstText(tags, preferred)
    || firstText(analysis, preferred)
    || firstText(summary, ['title', 'name'])
    || firstText(tags, ['title', 'name'])
}

function formatAnalysis(raw) {
  const analysis = asObject(raw)
  if (!analysis) return null
  const structure = asObject(analysis.structure) || analysis
  const summary = asObject(analysis.summary) || analysis
  const tags = asObject(analysis.tags) || analysis
  const chapters = toList(
    summary.chapter_summaries || structure.chapters || structure.sections || structure.outline || structure.steps
  )
  const tagItems = toList(tags.tags || tags.labels || tags.recommended_tags)
  const topicItems = toList(tags.topics || tags.recommended_topics)
  return {
    courseName: extractCourseName(structure, summary, tags, analysis),
    summaryText: firstText(summary, ['summary', 'abstract', 'overview', 'text', 'content', 'raw']),
    chapters: chapters.map((item, index) => ({
      title: chapterTitle(item, index),
      detail: chapterDetail(item),
      group: chapterGroup(item),
      key: 'ch-' + index + '-' + chapterTitle(item, index)
    })),
    tags: tagItems.map(tagLabel).filter(Boolean),
    topics: topicItems.map((item) => ({
      name: tagLabel(item) || (typeof item === 'object' ? item.name : '') || '',
      reason: typeof item === 'object' ? (item.reason || item.description || '') : ''
    })).filter((item) => item.name),
    direction: firstText(tags, ['direction', 'major', 'field', '专业方向']) || firstText(summary, ['direction']) || '',
    rawPreview: typeof raw === 'string' ? raw : JSON.stringify(analysis, null, 2)
  }
}

function lectureTextFromCourse(course, analysis) {
  const item = course || {}
  const view = analysis || formatAnalysis(item.ai_analysis) || {}
  const parts = []
  const title = view.courseName || item.title
  if (title) parts.push('课程标题：' + title)
  if (item.description) parts.push(item.description)
  if (view.summaryText) parts.push('摘要：' + view.summaryText)
  if (view.direction) parts.push('专业方向：' + view.direction)
  ;(view.chapters || []).forEach((chapter, index) => {
    const heading = chapter.title || ('第 ' + (index + 1) + ' 章')
    parts.push(heading + (chapter.detail ? '\n' + chapter.detail : ''))
  })
  if (view.tags && view.tags.length) parts.push('标签：' + view.tags.join('、'))
  ;(view.topics || []).forEach((topic) => {
    if (topic && topic.name) parts.push('课题：' + topic.name + (topic.reason ? '（' + topic.reason + '）' : ''))
  })
  return parts.join('\n\n').slice(0, 16000)
}

function matchCategory(categories, view) {
  const list = categories || []
  const direction = (view && view.direction) || ''
  const tags = ((view && view.tags) || []).concat(((view && view.topics) || []).map((item) => item.name))
  const needles = [direction].concat(tags).filter(Boolean)
  for (let i = 0; i < list.length; i++) {
    const name = list[i].name || ''
    if (!name) continue
    for (let j = 0; j < needles.length; j++) {
      const needle = String(needles[j])
      if (needle.indexOf(name) >= 0 || name.indexOf(needle) >= 0) return list[i]
    }
  }
  return null
}

module.exports = {
  asObject: asObject,
  firstText: firstText,
  formatAnalysis: formatAnalysis,
  lectureTextFromCourse: lectureTextFromCourse,
  extractCourseName: extractCourseName,
  matchCategory: matchCategory
}
