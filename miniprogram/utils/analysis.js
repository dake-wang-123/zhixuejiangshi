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
    if (typeof value === 'string' && value) return value
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
  if (!item) return '第 ' + (index + 1) + ' 章'
  if (typeof item === 'string') return item
  return item.title || item.name || item.heading || item.chapter || ('第 ' + (index + 1) + ' 章')
}

function tagLabel(item) {
  if (!item) return ''
  if (typeof item === 'string') return item
  return item.name || item.tag || item.label || item.topic || ''
}

function formatAnalysis(raw) {
  const analysis = asObject(raw)
  if (!analysis) return null
  const structure = asObject(analysis.structure) || analysis
  const summary = asObject(analysis.summary) || analysis
  const tags = asObject(analysis.tags) || analysis
  const chapters = toList(
    summary.chapter_summaries || structure.chapters || structure.sections || structure.outline
  )
  const tagItems = toList(tags.tags || tags.labels || tags.recommended_tags)
  const topicItems = toList(tags.topics)
  return {
    summaryText: firstText(summary, ['summary', 'abstract', 'overview', 'text', 'content', 'raw']),
    chapters: chapters.map((item, index) => ({
      title: chapterTitle(item, index),
      detail: typeof item === 'object' ? (item.summary || item.description || item.content || (item.sections ? item.sections.join(' / ') : '')) : ''
    })),
    tags: tagItems.map(tagLabel).filter(Boolean),
    topics: topicItems.map((item) => ({
      name: tagLabel(item) || (typeof item === 'object' ? item.name : '') || '',
      reason: typeof item === 'object' ? (item.reason || item.description || '') : ''
    })).filter((item) => item.name),
    direction: firstText(tags, ['direction', 'major', 'field']) || firstText(summary, ['direction']) || '',
    rawPreview: typeof raw === 'string' ? raw : JSON.stringify(analysis, null, 2)
  }
}

module.exports = {
  asObject: asObject,
  formatAnalysis: formatAnalysis
}
