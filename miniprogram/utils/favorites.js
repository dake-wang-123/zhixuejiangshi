const KEY = 'zhixue_favorites_v1'
let memory = []

function load() {
  try {
    if (typeof wx === 'undefined' || !wx.getStorageSync) return memory.slice()
    const rows = wx.getStorageSync(KEY) || []
    return Array.isArray(rows) ? rows : []
  } catch (e) {
    return memory.slice()
  }
}

function save(rows) {
  memory = (rows || []).slice()
  try {
    if (typeof wx !== 'undefined' && wx.setStorageSync) wx.setStorageSync(KEY, memory)
  } catch (e) {}
  return memory
}

function listFavorites() {
  return load().slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
}

function hasFavorite(lessonCode) {
  const code = String(lessonCode || '')
  return load().some((item) => item.lessonCode === code)
}

function toggleFavorite(item) {
  const code = String((item && item.lessonCode) || '')
  if (!code) return { on: false, list: load() }
  const rows = load()
  const index = rows.findIndex((row) => row.lessonCode === code)
  if (index >= 0) {
    rows.splice(index, 1)
    return { on: false, list: save(rows) }
  }
  rows.unshift({
    lessonCode: code,
    topicTitle: String((item && item.topicTitle) || code),
    updatedAt: Date.now()
  })
  return { on: true, list: save(rows.slice(0, 80)) }
}

module.exports = {
  KEY: KEY,
  listFavorites: listFavorites,
  hasFavorite: hasFavorite,
  toggleFavorite: toggleFavorite
}
