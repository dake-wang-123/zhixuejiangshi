function avatarUrl(account) {
  const raw = account && (account.profileImageUrl || account.avatarUrl || account.用户头像)
  if (!raw) return ''
  if (typeof raw === 'string') return raw
  return raw.url || raw.src || ''
}

function displayName(account) {
  const name = account && (account.username || account.用户名 || account.nickName)
  return String(name || '').trim() || '家庭教育讲师'
}

function formatDate(value) {
  if (!value) return ''
  const d = new Date(value)
  if (isNaN(d.getTime())) return String(value).slice(0, 16)
  return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日'
}

function membershipView(row) {
  if (!row) {
    return {
      active: false,
      label: '未开通',
      sub: '开通后可免费学习会员课',
      expireText: ''
    }
  }
  const expire = row.expire_time || row.到期时间 || ''
  const status = String(row.status || row.状态 || '')
  const expired = (expire && Date.parse(expire) < Date.now()) || status === '已过期' || status === '失效'
  if (expired) {
    return {
      active: false,
      label: '已过期',
      sub: expire ? ('有效期至 ' + formatDate(expire)) : '会员已到期',
      expireText: formatDate(expire)
    }
  }
  return {
    active: true,
    label: row.level || row.等级 || '会员',
    sub: expire ? ('有效期至 ' + formatDate(expire)) : (status || '已开通'),
    expireText: formatDate(expire)
  }
}

function accountView(account) {
  return {
    name: displayName(account),
    avatar: avatarUrl(account),
    phone: (account && (account.phoneNumber || account.电话号码)) || ''
  }
}

module.exports = {
  avatarUrl: avatarUrl,
  displayName: displayName,
  formatDate: formatDate,
  membershipView: membershipView,
  accountView: accountView
}
