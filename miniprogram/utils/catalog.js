const { formatAnalysis, matchCategory } = require('./analysis.js')
const { buildStudySteps, progressToRatio } = require('./study.js')
const { readSession } = require('./session.js')
const { firstLiveIndex } = require('./flow.js')
const { matchCanonical, listCanonical, listCategories } = require('./coze-catalog.js')

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
  const canonical = matchCanonical(item.title, view && view.courseName)
  const displayTitle = canonical ? canonical.title : (item.title || '未命名课程')
  const session = readSession(item.id)
  const sessionSteps = (session && session.steps) || []
  const stepCount = sessionSteps.length
  const completedCount = session ? Number(session.completedCount || 0) : firstLiveIndex()
  const cursorStep = stepCount ? Math.min(completedCount, Math.max(0, stepCount - 1)) : 0
  return Object.assign({}, item, {
    view: view || { summaryText: '', chapters: [], tags: [], topics: [], direction: '', courseName: '' },
    canonical: canonical,
    matched: !!canonical,
    agentTitle: canonical ? canonical.title : '',
    displayTitle: displayTitle,
    originalTitle: item.title || '',
    showOriginal: false,
    categoryKey: String(category.id),
    categoryName: (canonical && canonical.category) || category.name,
    analysisStepCount: (built.steps && built.steps.length) || 0,
    stepCount: stepCount,
    completedCount: completedCount,
    cursorStep: cursorStep
  })
}

function decorateStudyRow(row, categories) {
  const course = decorateCourse((row && row.course) || {}, categories)
  const total = course.stepCount || 0
  const completedCount = course.completedCount || 0
  const percent = total ? Math.round((completedCount / total) * 100) : Math.round(progressToRatio(row.progress) * 100)
  const currentIndex = total ? Math.min(completedCount, Math.max(0, total - 1)) : 0
  const session = readSession(course.id)
  const steps = (session && session.steps) || []
  const current = steps[currentIndex]
  const stepTitle = current
    ? current.title
    : (completedCount >= total && total ? '已学完' : (course.matched ? '智学伴练' : '未匹配智学目录'))
  return Object.assign({}, row, {
    course: course,
    displayTitle: course.displayTitle,
    matched: course.matched,
    categoryKey: course.categoryKey,
    categoryName: course.categoryName,
    stepCount: total,
    percent: Math.min(100, percent),
    currentIndex: currentIndex,
    completedCount: completedCount,
    furthest: Math.max(0, completedCount - 1),
    stepTitle: stepTitle,
    matchedFlag: course.matched ? 1 : 0,
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

function buildCozeCatalog(dbCourses, activeCategory) {
  const decorated = (dbCourses || []).map((item) => decorateCourse(item, []))
  const byTitle = {}
  decorated.forEach((item) => {
    if (!item.canonical) return
    byTitle[item.canonical.title] = item
  })
  const filter = activeCategory || ''
  const sections = []
  listCategories().forEach((name) => {
    if (filter && filter !== name) return
    const courses = listCanonical().filter((item) => item.category === name).map((canon) => {
      const db = byTitle[canon.title]
      return {
        id: db ? db.id : '',
        dbId: db ? db.id : '',
        inLibrary: !!db,
        canonical: canon,
        matched: !!db,
        displayTitle: canon.title,
        description: canon.description || '',
        categoryName: name,
        is_recommended: db ? db.is_recommended : false,
        coverUrl: db ? db.coverUrl : '',
        stepCount: db ? db.stepCount : 0
      }
    })
    sections.push({ id: name, name: name, courses: courses })
  })
  const loose = listCanonical().filter((item) => !item.category)
  if (loose.length && !filter) {
    const courses = loose.map((canon) => {
      const db = byTitle[canon.title]
      return {
        id: db ? db.id : '',
        dbId: db ? db.id : '',
        inLibrary: !!db,
        canonical: canon,
        matched: !!db,
        displayTitle: canon.title,
        description: canon.description || '',
        categoryName: '',
        is_recommended: db ? db.is_recommended : false,
        coverUrl: db ? db.coverUrl : '',
        stepCount: db ? db.stepCount : 0
      }
    })
    sections.push({ id: 'uncat', name: '未标注分类', courses: courses })
  }
  return {
    sections: sections,
    matchedCount: decorated.filter((item) => item.matched).length,
    catalogCount: listCanonical().length,
    categoryCount: listCategories().length
  }
}

module.exports = {
  decorateCourse: decorateCourse,
  decorateStudyRow: decorateStudyRow,
  groupByCategory: groupByCategory,
  resolveCategory: resolveCategory,
  buildCanonicalCatalog: buildCozeCatalog,
  buildCozeCatalog: buildCozeCatalog
}
