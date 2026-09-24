const PENDING_PLAN_KEY = 'zhixue_pending_plan_v1'
const MAX_PLAN_CHARS = 8000

function inferTitle(text, fileName) {
  const first = String(text || '').replace(/\r\n/g, '\n').split('\n').map((line) => {
    return line.replace(/^\s*#+\s*/, '').replace(/[*`]/g, '').trim()
  }).filter(Boolean)[0] || ''
  if (first && first.length <= 40) return first
  const fromFile = String(fileName || '').replace(/\.[^.]+$/, '').trim()
  if (fromFile) return fromFile.slice(0, 40)
  return (first || '个人教案').slice(0, 40)
}

function personalLessonCode(title) {
  const slug = String(title || 'plan').replace(/\s+/g, '').replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '').slice(0, 12)
  return ('P:' + (slug || 'plan')).slice(0, 32)
}

function isPersonalCode(code) {
  return /^P:/i.test(String(code || ''))
}

function sourceOf(course, lessonCode) {
  if (course && course.source) return course.source
  if (isPersonalCode(lessonCode || (course && course.lessonCode))) return 'personal'
  return 'catalog'
}

function clipPlan(text) {
  const raw = String(text || '').replace(/\r\n/g, '\n').trim()
  if (raw.length <= MAX_PLAN_CHARS) return { text: raw, truncated: false }
  return {
    text: raw.slice(0, MAX_PLAN_CHARS) + '\n\n（后文已截断，智学先按前 ' + MAX_PLAN_CHARS + ' 字带你走 10 步。）',
    truncated: true
  }
}

function packPersonalStart(title, text) {
  const clipped = clipPlan(text)
  const topic = String(title || inferTitle(clipped.text) || '个人教案').trim()
  return [
    '【个人教案】',
    'source=personal',
    '课题：' + topic,
    '请只依据下面这份讲师自己的教案，按十步交付法从第1步「自我介绍」开始引导。不要改用知识库里的系统课，不要换成目录里的其他课题。',
    '',
    '## 个人教案正文',
    clipped.text,
    '',
    '开头写【当前步骤：1】。'
  ].join('\n')
}

function shortUserText(text) {
  const src = String(text || '')
  if (src.indexOf('【个人教案】') >= 0 || src.indexOf('## 个人教案正文') >= 0) {
    const title = ((src.match(/课题[:：]\s*(.+)/) || [])[1] || '').trim().split('\n')[0]
    return title ? ('开始自学这份个人教案 · ' + title) : '开始自学这份个人教案'
  }
  return src
}

function rememberPending(plan) {
  const title = String((plan && plan.title) || inferTitle(plan && plan.text) || '个人教案').trim()
  const text = String((plan && plan.text) || '').trim()
  const next = {
    title: title,
    text: text,
    lessonCode: personalLessonCode(title),
    source: 'personal',
    updatedAt: Date.now()
  }
  try {
    if (typeof wx !== 'undefined' && wx.setStorageSync) {
      wx.setStorageSync(PENDING_PLAN_KEY, next)
    }
  } catch (e) {}
  return next
}

function readPending() {
  try {
    if (typeof wx === 'undefined' || !wx.getStorageSync) return null
    const row = wx.getStorageSync(PENDING_PLAN_KEY) || null
    if (row) wx.removeStorageSync(PENDING_PLAN_KEY)
    return row && row.text ? row : null
  } catch (e) {
    return null
  }
}

function readPlainFile(filePath, name) {
  const lower = String(name || '').toLowerCase()
  if (!/\.(txt|md|markdown|text)$/.test(lower)) {
    return Promise.reject(new Error('Word/PDF 读不到正文。请把教案复制到文本框后再开始。'))
  }
  return new Promise((resolve, reject) => {
    try {
      if (typeof wx === 'undefined' || !wx.getFileSystemManager) {
        reject(new Error('当前环境不能读本地文件，请直接粘贴正文。'))
        return
      }
      const content = wx.getFileSystemManager().readFileSync(filePath, 'utf8')
      const text = String(content || '').trim()
      if (!text) {
        reject(new Error('这个文本文件是空的，请粘贴正文。'))
        return
      }
      resolve(text)
    } catch (e) {
      reject(new Error('这个文件读不成文本，请直接粘贴正文。'))
    }
  })
}

module.exports = {
  PENDING_PLAN_KEY: PENDING_PLAN_KEY,
  MAX_PLAN_CHARS: MAX_PLAN_CHARS,
  inferTitle: inferTitle,
  personalLessonCode: personalLessonCode,
  isPersonalCode: isPersonalCode,
  sourceOf: sourceOf,
  clipPlan: clipPlan,
  packPersonalStart: packPersonalStart,
  shortUserText: shortUserText,
  rememberPending: rememberPending,
  readPending: readPending,
  readPlainFile: readPlainFile
}
