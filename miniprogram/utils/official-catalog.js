const FALLBACK = require('../data/course-catalog-60.js')

function sortRows(rows) {
  return (rows || []).slice().sort((a, b) => {
    const ca = Number(a.category_sort) || 0
    const cb = Number(b.category_sort) || 0
    if (ca !== cb) return ca - cb
    return (Number(a.seq) || 0) - (Number(b.seq) || 0)
  })
}

function normalizeRow(item) {
  if (!item) return null
  const title = String(item.title || item.课程标题 || '').trim()
  const lessonCode = String(item.lesson_code || item.课号 || '').trim()
  const category = String(item.category || item.类别 || '').trim()
  if (!title) return null
  return {
    id: item.id || lessonCode || title,
    dbId: item.id || '',
    category: category,
    category_sort: Number(item.category_sort || item.类别排序 || 0),
    lesson_code: lessonCode,
    seq: Number(item.seq || item.序号 || 0),
    title: title,
    displayTitle: title
  }
}

function listOfficialRows(rows) {
  const source = (rows && rows.length) ? rows : FALLBACK
  return sortRows(source.map(normalizeRow).filter(Boolean))
}

function listOfficialCategories(rows) {
  const seen = {}
  const cats = []
  listOfficialRows(rows).forEach((item) => {
    if (!item.category || seen[item.category]) return
    seen[item.category] = true
    cats.push({
      id: item.category,
      name: item.category,
      sort: item.category_sort
    })
  })
  return cats
}

function buildOfficialCatalog(rows, activeCategory) {
  const list = listOfficialRows(rows)
  const filter = activeCategory || ''
  const sections = []
  const map = {}
  list.forEach((item) => {
    if (filter && item.category !== filter) return
    const key = item.category || 'uncat'
    if (!map[key]) {
      map[key] = {
        id: key,
        name: key,
        sort: item.category_sort,
        courses: []
      }
      sections.push(map[key])
    }
    map[key].courses.push(item)
  })
  return {
    sections: sections,
    catalogCount: list.length,
    categoryCount: listOfficialCategories(rows).length,
    rows: list
  }
}

function findLessonCode(title) {
  const want = String(title || '').trim()
  if (!want) return ''
  const hit = listOfficialRows().find((item) => item.title === want)
  return hit ? hit.lesson_code : ''
}

module.exports = {
  FALLBACK: FALLBACK,
  listOfficialRows: listOfficialRows,
  listOfficialCategories: listOfficialCategories,
  buildOfficialCatalog: buildOfficialCatalog,
  findLessonCode: findLessonCode
}
