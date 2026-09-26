const { lessonCodeOf } = require('./learn-history.js')

const BIND_KEY = 'zhixue_conv_bind_v2'

let memoryBinds = {}

function isCozeId(value) {
  return /^\d{10,}$/.test(String(value || ''))
}

function loadBinds() {
  try {
    if (typeof wx !== 'undefined' && wx.getStorageSync) {
      return wx.getStorageSync(BIND_KEY) || {}
    }
  } catch (e) {}
  return memoryBinds
}

function saveBinds(all) {
  memoryBinds = all || {}
  try {
    if (typeof wx !== 'undefined' && wx.setStorageSync) {
      wx.setStorageSync(BIND_KEY, memoryBinds)
    }
  } catch (e) {}
}

function bindConversation(lessonCode, conversationId) {
  const code = lessonCodeOf(lessonCode, 'open')
  const cid = String(conversationId || '')
  if (!isCozeId(cid) || !code) return ''
  const all = loadBinds()
  if (all[cid] && all[cid] !== code) return ''
  all[cid] = code
  saveBinds(all)
  return cid
}

function conversationForLesson(lessonCode, candidate) {
  const code = lessonCodeOf(lessonCode, 'open')
  const cid = String(candidate || '')
  if (!isCozeId(cid)) return ''
  const all = loadBinds()
  if (all[cid] && all[cid] !== code) return ''
  return bindConversation(code, cid)
}

function unbindLesson(lessonCode) {
  const code = lessonCodeOf(lessonCode, 'open')
  const all = loadBinds()
  Object.keys(all).forEach((cid) => {
    if (all[cid] === code) delete all[cid]
  })
  saveBinds(all)
}

function nextTurnId(page) {
  page._turnId = (Number(page._turnId) || 0) + 1
  return page._turnId
}

function isLiveTurn(page, turnId, sessionKey) {
  if (!page) return false
  if (Number(page._turnId) !== Number(turnId)) return false
  if (typeof page.sessionKey === 'function' && page.sessionKey() !== sessionKey) return false
  return true
}

function switchedLesson(prevCode, nextCode) {
  return lessonCodeOf(prevCode, 'open') !== lessonCodeOf(nextCode, 'open')
}

function localSlotKey(account, lessonCode) {
  const uid = (account && (account.id || account.userId)) || 'guest'
  const code = lessonCodeOf(lessonCode, 'open')
  return [uid, code, Date.now()].join('+')
}

function resetBindsForTest() {
  memoryBinds = {}
}

module.exports = {
  BIND_KEY: BIND_KEY,
  isCozeId: isCozeId,
  bindConversation: bindConversation,
  conversationForLesson: conversationForLesson,
  unbindLesson: unbindLesson,
  nextTurnId: nextTurnId,
  isLiveTurn: isLiveTurn,
  switchedLesson: switchedLesson,
  localSlotKey: localSlotKey,
  resetBindsForTest: resetBindsForTest
}
