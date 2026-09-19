const { formatAnalysis, matchCategory } = require('./analysis.js')
const { buildStudySteps, readCursor, furthestFromRatio, ratioFromFurthest } = require('./study.js')

function resolveCategory(course, view, categories) {
  if (course && course.category_id && course.category_id.id) {
    return {
      id: course.category_id.id,
      name: course.category_id.name || '未分类'
    }
  }
  const matched = matchCategory(categories, view)
  if (matched) return { id: matched.id, name: matched.name }
  if (view && view.direction) return { id: 'dir-' + view.direction, name: view.direction }
  return { id: 'uncat', name: '未分类' }
}

function decorateCourse(course, categories) {
  const item = course || {}
  const view = formatAnalysis(item.ai_analysis)
  const built = buildStudySteps(item, view)
  const category = resolveCategory(item, view, categories)
  const agentTitle = (view && view.courseName) || ''
  const displayTitle = agentTitle || item.title || '未命名课程'
  const cursor = readCursor(item.id)
  return Object.assign({}, item, {
    view: view || { summaryText: '', chapters: [], tags: [], topics: [], direction: '', courseName: '' },
    agentTitle: agentTitle,
    displayTitle: displayTitle,
    originalTitle: item.title || '',
    showOriginal: !!(agentTitle && item.title && agentTitle !== item.title),
    categoryKey: String(category.id),
    categoryName: category.name,
    stepCount: built.steps.length,
    cursorStep: cursor ? cursor.stepIndex : 0
  })
}

function decorateStudyRow(row, categories) {
  const course = decorateCourse((row && row.course) || {}, categories)
  const total = course.stepCount || 1
  const ratio = Number(row.progress || 0) <= 1 ? Number(row.progress || 0) : Number(row.progress || 0) / 100
  const furthest = furthestFromRatio(ratio, total)
  const percent = Math.round(ratioFromFurthest(furthest, total) * 100)
  const cursor = readCursor(course.id)
  const currentIndex = cursor && String(cursor.studyId) === String(row.id)
    ? (typeof cursor.stepIndex === 'number' ? cursor.stepIndex : furthest)
    : furthest
  const built = buildStudySteps(course, course.view)
  const current = built.steps[currentIndex] || built.steps[0]
  const stepTitle = current ? current.title : '课程导读'
  return Object.assign({}, row, {
    course: course,
    displayTitle: course.displayTitle,
    categoryKey: course.categoryKey,
    categoryName: course.categoryName,
    stepCount: total,
    percent: percent,
    currentIndex: currentIndex,
    furthest: furthest,
    stepTitle: stepTitle,
    coverUrl: row.coverUrl || ''
  })
}

function groupByCategory(items, categories, activeCategory, keepEmpty) {
  const cats = categories || []
  const map = {}
  const sections = []
  const filterId = Number(activeCategory) || 0
  cats.forEach((cat) => {
    if (!cat || !cat.id) return
    if (filterId && Number(cat.id) !== filterId) return
    const key = String(cat.id)
    map[key] = { id: cat.id, name: cat.name, courses: [] }
    sections.push(map[key])
  })
  function ensure(key, name) {
    if (map[key]) return map[key]
    const section = { id: key, name: name || '未分类', courses: [] }
    map[key] = section
    sections.push(section)
    return section
  }
  ;(items || []).forEach((item) => {
    const key = String(item.categoryKey || 'uncat')
    if (filterId && Number(key) !== filterId) return
    ensure(key, item.categoryName).courses.push(item)
  })
  if (keepEmpty === false) {
    return sections.filter((section) => section.courses && section.courses.length)
  }
  return sections
}

module.exports = {
  decorateCourse: decorateCourse,
  decorateStudyRow: decorateStudyRow,
  groupByCategory: groupByCategory,
  resolveCategory: resolveCategory
}
