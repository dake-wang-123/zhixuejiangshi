const CACHE_KEY = 'zhixue_coze_catalog_v2'
const ARCHIVE = require('../data/zhixue-catalog.json')
const CATALOG_QUERY = [
  '请只列出你知识库里已经上传的课程分类，以及每个分类下的课题原题。',
  '分类名和课题名必须与知识库一致，不要改写，不要开始上课，不要自我介绍。'
].join('')

let CATALOG = {
  categories: [],
  courses: [],
  fetchedAt: 0,
  conversationId: '',
  raw: ''
}

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

function cleanTitle(text) {
  return String(text || '')
    .replace(/^[\s·•\-\*、]+/, '')
    .replace(/^\d{1,2}[\.、．\)]\s*/, '')
    .replace(/^（\d{1,2}）\s*/, '')
    .replace(/^课题原标题[:：]\s*/, '')
    .replace(/^课题[:：]\s*/, '')
    .replace(/^[“”"《》]+|[“”"《》]+$/g, '')
    .trim()
}

function cleanCategory(text) {
  return cleanTitle(text)
    .replace(/^分类文件夹\s*\d+[:：]\s*/, '')
    .replace(/^[一二三四五六七八九十]+、\s*/, '')
    .replace(/^第\s*\d+\s*类[:：]?\s*/, '')
    .trim()
}

function emptyCatalog() {
  return {
    categories: [],
    courses: [],
    fetchedAt: 0,
    conversationId: '',
    raw: ''
  }
}

function setCatalog(data) {
  const next = data || emptyCatalog()
  CATALOG = {
    categories: next.categories || [],
    courses: next.courses || [],
    fetchedAt: next.fetchedAt || 0,
    conversationId: next.conversationId || '',
    raw: next.raw || ''
  }
  return CATALOG
}

function getCatalog() {
  return CATALOG
}

function archiveCatalog() {
  const packed = ARCHIVE && typeof ARCHIVE === 'object' ? ARCHIVE : {}
  return {
    categories: packed.categories || [],
    courses: packed.courses || [],
    fetchedAt: packed.fetchedAt || 0,
    conversationId: '',
    raw: packed.source || 'archive'
  }
}

function loadCachedCatalog() {
  try {
    if (typeof wx !== 'undefined' && wx.getStorageSync) {
      const cached = wx.getStorageSync(CACHE_KEY)
      if (cached && ((cached.courses && cached.courses.length) || (cached.categories && cached.categories.length))) {
        return setCatalog(cached)
      }
    }
  } catch (e) {}
  if (CATALOG.courses.length || CATALOG.categories.length) return getCatalog()
  return setCatalog(archiveCatalog())
}

function saveCatalog(data) {
  const next = setCatalog(data)
  try {
    if (typeof wx !== 'undefined' && wx.setStorageSync) {
      wx.setStorageSync(CACHE_KEY, next)
    }
  } catch (e) {}
  return next
}

function pushCourse(courses, categories, title, category, description) {
  const topic = cleanTitle(title)
  const cat = cleanTitle(category)
  if (!topic || topic.length > 80) return
  if (cat && categories.indexOf(cat) < 0) categories.push(cat)
  const exists = courses.some((item) => {
    return normalizeTitle(item.title) === normalizeTitle(topic) && normalizeTitle(item.category) === normalizeTitle(cat)
  })
  if (exists) return
  courses.push({
    title: topic,
    category: cat,
    description: String(description || '').trim()
  })
}

function parseJsonValue(value, courses, categories, currentCategory) {
  if (!value) return
  if (typeof value === 'string') {
    if (currentCategory) pushCourse(courses, categories, value, currentCategory, '')
    else if (value.length <= 40 && categories.indexOf(value) < 0) categories.push(value)
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item) => parseJsonValue(item, courses, categories, currentCategory))
    return
  }
  if (typeof value !== 'object') return
  const children = value.courses || value.lessons || value.topics || value.items || value.课题列表 || value.课程列表
  const explicitTitle = value.title || value.课题 || value.课程名称 || value.course_name || value.courseName
  const named = value.name || value.课程 || value.course
  const cat = value.category || value.分类 || value.category_name || value.categoryName || currentCategory || ''
  if (children && !explicitTitle) {
    const folder = cat || named || ''
    if (folder && categories.indexOf(folder) < 0) categories.push(folder)
    parseJsonValue(children, courses, categories, folder)
    return
  }
  if (cat && !explicitTitle && !named && !children && categories.indexOf(cat) < 0) categories.push(cat)
  if (explicitTitle || named) {
    pushCourse(courses, categories, explicitTitle || named, cat, value.description || value.desc || value.简介 || '')
  }
  Object.keys(value).forEach((key) => {
    if (['category', '分类', 'category_name', 'categoryName', 'title', 'name', '课题', '课程', 'course', 'course_name', '课程名称', 'description', 'desc', '简介', 'courses', 'lessons', 'topics', 'items', '课题列表', '课程列表', 'categories'].indexOf(key) >= 0) {
      if (key === 'categories') parseJsonValue(value[key], courses, categories, currentCategory)
      return
    }
    const child = value[key]
    if (Array.isArray(child) || (child && typeof child === 'object')) {
      parseJsonValue(child, courses, categories, key)
    }
  })
}

function parseJsonCatalog(text) {
  const raw = String(text || '')
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const blob = fence ? fence[1] : raw
  const startObj = blob.indexOf('{')
  const startArr = blob.indexOf('[')
  let start = -1
  let end = -1
  if (startArr >= 0 && (startObj < 0 || startArr < startObj)) {
    start = startArr
    end = blob.lastIndexOf(']')
  } else if (startObj >= 0) {
    start = startObj
    end = blob.lastIndexOf('}')
  }
  if (start < 0 || end <= start) return null
  try {
    const data = JSON.parse(blob.slice(start, end + 1))
    const courses = []
    const categories = []
    parseJsonValue(data, courses, categories, '')
    if (!categories.length && !courses.length) return null
    return { categories: categories, courses: courses }
  } catch (e) {
    return null
  }
}

function parseListedCatalog(text) {
  const courses = []
  const categories = []
  let current = ''
  String(text || '').split(/\n/).forEach((line) => {
    const raw = String(line || '').trim()
    if (!raw) return
    const heading = raw.match(/^(?:#{1,3}\s+|【|分类[:：]\s*)(.+?)(?:】)?$/)
    const labeled = raw.match(/^(?:课程分类|分类名称|所属分类|分类文件夹\s*\d+)[:：]\s*(.+)$/)
    if ((heading || labeled) && raw.length <= 60) {
      const name = cleanCategory((heading && heading[1]) || (labeled && labeled[1]))
      if (name && name.indexOf('课题') < 0 && name.indexOf('目录') < 0 && name.indexOf('知识库') < 0) {
        current = name
        if (categories.indexOf(name) < 0) categories.push(name)
        return
      }
    }
    const item = raw.match(/^(?:[-*•·]|\d{1,2}[\.、．\)]|（\d{1,2}）)\s*(.+)$/)
    if (item) {
      const title = cleanTitle(item[1].replace(/[（(][^）)]{0,20}[）)]$/, '').trim())
      if (title) pushCourse(courses, categories, title, current, '')
    }
  })
  if (!categories.length && !courses.length) return null
  return { categories: categories, courses: courses }
}

function parseCozeCatalog(reply) {
  const fromJson = parseJsonCatalog(reply)
  if (fromJson && (fromJson.courses.length || fromJson.categories.length)) return fromJson
  const fromList = parseListedCatalog(reply)
  if (fromList) return fromList
  return { categories: [], courses: [] }
}

function listCanonical() {
  return (CATALOG.courses || []).slice()
}

function listCategories() {
  const names = (CATALOG.categories || []).slice()
  ;(CATALOG.courses || []).forEach((item) => {
    if (item.category && names.indexOf(item.category) < 0) names.push(item.category)
  })
  return names
}

function matchCanonical() {
  const values = Array.prototype.slice.call(arguments)
  const courses = CATALOG.courses || []
  for (let i = 0; i < values.length; i++) {
    const key = normalizeTitle(values[i])
    if (!key) continue
    for (let j = 0; j < courses.length; j++) {
      if (normalizeTitle(courses[j].title) === key) return courses[j]
    }
  }
  return null
}

function fetchCozeCatalog(token, userId, options) {
  const { chatWithCoze } = require('./agent.js')
  const opts = options || {}
  const preview = loadCachedCatalog()
  const conversationId = opts.fresh ? '' : (preview.conversationId || '')
  return chatWithCoze(CATALOG_QUERY, userId || 'catalog', conversationId, token).then((result) => {
    const parsed = parseCozeCatalog(result.reply)
    if (!parsed.categories.length && !parsed.courses.length) {
      const fallback = loadCachedCatalog()
      if (fallback.courses.length || fallback.categories.length) return fallback
      throw new Error('智学没有返回课程分类。请确认 Coze 知识库已上传分类后下拉刷新。')
    }
    return saveCatalog({
      categories: parsed.categories,
      courses: parsed.courses,
      fetchedAt: Date.now(),
      conversationId: result.conversationId || '',
      raw: result.reply
    })
  })
}

module.exports = {
  CACHE_KEY: CACHE_KEY,
  CATALOG_QUERY: CATALOG_QUERY,
  normalizeTitle: normalizeTitle,
  parseCozeCatalog: parseCozeCatalog,
  archiveCatalog: archiveCatalog,
  setCatalog: setCatalog,
  getCatalog: getCatalog,
  loadCachedCatalog: loadCachedCatalog,
  saveCatalog: saveCatalog,
  listCanonical: listCanonical,
  listCategories: listCategories,
  matchCanonical: matchCanonical,
  fetchCozeCatalog: fetchCozeCatalog
}
