const { parseCozeCatalog, cleanTitle, cleanCategory, normalizeTitle } = require('./coze-catalog.js')

function stripExt(name) {
  return String(name || '').replace(/\.[A-Za-z0-9]{1,8}$/, '')
}

function splitFileMeta(name) {
  const raw = stripExt(name).replace(/[_]+/g, ' ').trim()
  const seps = ['／', '/', '—', '–', ' - ']
  for (let i = 0; i < seps.length; i++) {
    const sep = seps[i]
    const idx = raw.indexOf(sep)
    if (idx > 0) {
      return { category: raw.slice(0, idx).trim(), title: raw.slice(idx + sep.length).trim() }
    }
  }
  const idx = raw.lastIndexOf('-')
  if (idx > 0) {
    const left = raw.slice(0, idx).trim()
    if (/课程|类|指导|修养/.test(left)) {
      return { category: left, title: raw.slice(idx + 1).trim() }
    }
  }
  return { category: '', title: raw }
}

function titleFromSource(name, text) {
  const body = String(text || '')
  const lines = body.split(/\n/).map((line) => line.trim()).filter(Boolean)
  for (let i = 0; i < Math.min(lines.length, 8); i++) {
    const line = lines[i]
      .replace(/^#+\s+/, '')
      .replace(/^课题[:：]\s*/, '')
      .replace(/^课程[:：]\s*/, '')
      .replace(/^标题[:：]\s*/, '')
    const title = cleanTitle(line)
    if (title && title.length <= 80 && title.indexOf('分类') < 0) return title
  }
  return cleanTitle(splitFileMeta(name).title)
}

function categoryFromSource(name, text, fallback) {
  const labeled = String(text || '').match(/(?:课程分类|所属分类|分类)[:：]\s*([^\n]{1,40})/)
  if (labeled) {
    const cat = cleanCategory(labeled[1])
    if (cat) return cat
  }
  const fromName = cleanCategory(splitFileMeta(name).category)
  if (fromName) return fromName
  return cleanCategory(fallback || '')
}

function parseUploadCatalog(text) {
  return parseCozeCatalog(text)
}

function looksLikeCatalog(text) {
  const parsed = parseCozeCatalog(text)
  return !!(parsed && parsed.courses && parsed.courses.length >= 2)
}

function uniqueCourses(items) {
  const out = []
  const seen = {}
  ;(items || []).forEach((item) => {
    const title = cleanTitle(item && item.title)
    if (!title) return
    const key = normalizeTitle(title) + '|' + normalizeTitle(item.category)
    if (seen[key]) return
    seen[key] = true
    out.push({
      title: title,
      category: cleanCategory((item && item.category) || ''),
      description: String((item && item.description) || '').trim()
    })
  })
  return out
}

module.exports = {
  titleFromSource: titleFromSource,
  categoryFromSource: categoryFromSource,
  parseUploadCatalog: parseUploadCatalog,
  looksLikeCatalog: looksLikeCatalog,
  uniqueCourses: uniqueCourses
}
