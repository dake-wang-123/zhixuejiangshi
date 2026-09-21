const COURSES = require('../data/coze-courses.js')

function normalizeTitle(text) {
  return String(text || '')
    .replace(/[“”"‘’'«»《》]/g, '')
    .replace(/[：:]/g, ':')
    .replace(/[，,]/g, ',')
    .replace(/[（(]/g, '(')
    .replace(/[）)]/g, ')')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase()
}

const INDEX = COURSES.map((item) => ({
  item: item,
  key: normalizeTitle(item.title)
}))

function listCanonical() {
  return COURSES.slice()
}

function listCategories() {
  const names = []
  COURSES.forEach((item) => {
    if (item.category && names.indexOf(item.category) < 0) names.push(item.category)
  })
  return names
}

function matchCanonical() {
  const values = Array.prototype.slice.call(arguments)
  for (let i = 0; i < values.length; i++) {
    const key = normalizeTitle(values[i])
    if (!key) continue
    for (let j = 0; j < INDEX.length; j++) {
      if (INDEX[j].key === key) return INDEX[j].item
    }
  }
  return null
}

module.exports = {
  CANONICAL_COUNT: COURSES.length,
  listCanonical: listCanonical,
  listCategories: listCategories,
  matchCanonical: matchCanonical,
  normalizeTitle: normalizeTitle
}
