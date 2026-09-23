const config = require('../config.js')

const ADMIN_FLAG = 'zhixue_admin_ok'

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '')
}

function isAdmin(account) {
  const phones = (config.adminPhones || []).map(normalizePhone).filter(Boolean)
  const ids = (config.adminAccountIds || []).map(String)
  const phone = normalizePhone(account && account.phoneNumber)
  if (phone && phones.indexOf(phone) >= 0) return true
  if (account && account.id != null && ids.indexOf(String(account.id)) >= 0) return true
  try {
    if (typeof wx !== 'undefined' && wx.getStorageSync && wx.getStorageSync(ADMIN_FLAG)) return true
  } catch (e) {}
  return false
}

function unlockAdmin(code) {
  const phones = (config.adminPhones || []).map(normalizePhone).filter(Boolean)
  const key = normalizePhone(code)
  if (!key || phones.indexOf(key) < 0) return false
  try {
    if (typeof wx !== 'undefined' && wx.setStorageSync) wx.setStorageSync(ADMIN_FLAG, true)
  } catch (e) {}
  return true
}

function lockAdmin() {
  try {
    if (typeof wx !== 'undefined' && wx.removeStorageSync) wx.removeStorageSync(ADMIN_FLAG)
  } catch (e) {}
}

module.exports = {
  ADMIN_FLAG: ADMIN_FLAG,
  isAdmin: isAdmin,
  unlockAdmin: unlockAdmin,
  lockAdmin: lockAdmin,
  normalizePhone: normalizePhone
}
