const { graphqlRequest, eqText, andWhere } = require('./graphql.js')

const LAST_SCOPE_KEY = 'zhixue_last_scope_v1'

function lessonCodeOf(scope, fallback) {
  const raw = String(scope || fallback || '').trim()
  if (!raw || raw === 'open') return 'open'
  if (raw.indexOf('lesson:') === 0) return raw.slice(7) || 'open'
  if (raw.indexOf('topic:') === 0) return ('T:' + raw.slice(6)).slice(0, 32)
  if (raw.indexOf('personal:') === 0) return ('P:' + raw.slice(9)).slice(0, 32)
  if (/^P:/i.test(raw)) return raw.slice(0, 32)
  if (/^[A-G]\d{2}$/i.test(raw)) return raw.toUpperCase()
  return raw.slice(0, 32)
}

function rememberScope(patch) {
  const next = {
    lessonCode: lessonCodeOf(patch && patch.lessonCode, 'open'),
    topicTitle: String((patch && patch.topicTitle) || ''),
    conversationId: String((patch && patch.conversationId) || ''),
    updatedAt: Date.now()
  }
  try {
    if (typeof wx !== 'undefined' && wx.setStorageSync) {
      wx.setStorageSync(LAST_SCOPE_KEY, next)
    }
  } catch (e) {}
  return next
}

function readLastScope() {
  try {
    if (typeof wx === 'undefined' || !wx.getStorageSync) return null
    return wx.getStorageSync(LAST_SCOPE_KEY) || null
  } catch (e) {
    return null
  }
}

function rowToMessage(row, index) {
  const role = row && row.role === 'assistant' ? 'assistant' : 'user'
  const content = String((row && (row.content || row.内容)) || '').trim()
  if (!content) return null
  return {
    id: 'db-' + ((row && row.id) || index),
    role: role,
    hidden: false,
    content: content,
    conversationId: (row && (row.conversation_id || row.会话ID)) || '',
    chatId: (row && (row.chat_id || row.对话ID)) || ''
  }
}

function rowsToSession(rows, topicTitle) {
  const list = rows || []
  const messages = list.map(rowToMessage).filter(Boolean)
  let conversationId = ''
  let chatId = ''
  let topic = topicTitle || ''
  list.forEach((row) => {
    const cid = row && (row.conversation_id || row.会话ID)
    const hid = row && (row.chat_id || row.对话ID)
    const title = row && (row.topic_title || row.topic || row.课题)
    if (cid) conversationId = String(cid)
    if (hid) chatId = String(hid)
    if (title) topic = String(title)
  })
  return {
    messages: messages,
    conversationId: conversationId,
    chatId: chatId,
    topicTitle: topic,
    followUps: []
  }
}

function historyWhere(lessonCode, topicTitle) {
  const code = lessonCodeOf(lessonCode, 'open')
  const parts = [eqText('lesson_code', code)]
  if (code === 'open' && topicTitle) {
    parts.push(eqText('topic_title', String(topicTitle)))
  }
  return andWhere(parts)
}

function listMessages(lessonCode, topicTitle, token) {
  const query = `
    query LearnHistory($where: learn_message_bool_exp) {
      learn_message(where: $where, order_by: { created_at: asc }, limit: 200) {
        id
        lesson_code
        topic_title
        role
        content
        conversation_id
        chat_id
        created_at
      }
    }
  `
  return graphqlRequest(query, { where: historyWhere(lessonCode, topicTitle) }, token).then((data) => {
    return data.learn_message || []
  })
}

function listAllMessages(token) {
  const query = `
    query AllLearnMessages {
      learn_message(order_by: { created_at: asc }, limit: 400) {
        id
        lesson_code
        topic_title
        role
        content
        created_at
      }
    }
  `
  return graphqlRequest(query, {}, token).then((data) => data.learn_message || [])
}

function lastRow(token) {
  const query = `
    query LastLearnMessage {
      learn_message(order_by: { created_at: desc }, limit: 1) {
        id
        lesson_code
        topic_title
        conversation_id
        chat_id
      }
    }
  `
  return graphqlRequest(query, {}, token).then((data) => {
    return (data.learn_message || [])[0] || null
  })
}

function saveRows(rows, token) {
  const objects = (rows || []).map((row) => ({
    lesson_code: lessonCodeOf(row.lesson_code, 'open'),
    topic_title: String(row.topic_title || row.topic || ''),
    role: row.role === 'assistant' ? 'assistant' : 'user',
    content: String(row.content || ''),
    content_type: 'text',
    conversation_id: String(row.conversation_id || ''),
    chat_id: String(row.chat_id || ''),
    message_key: String(row.message_key || row.key || ''),
    account_id: row.account_id
  })).filter((row) => row.content && row.message_key && row.account_id)
  if (!objects.length) return Promise.resolve(0)
  const mutation = `
    mutation InsertLearnMessages($objects: [learn_message_insert_input!]!) {
      insert_learn_message(
        objects: $objects
        on_conflict: { constraint: learn_message_key_key, update_columns: [] }
      ) { affected_rows }
    }
  `
  return graphqlRequest(mutation, { objects: objects }, token).then((data) => {
    return (data.insert_learn_message && data.insert_learn_message.affected_rows) || 0
  }).catch(() => 0)
}

function clearLesson(lessonCode, topicTitle, token) {
  const mutation = `
    mutation ClearLearn($where: learn_message_bool_exp!) {
      delete_learn_message(where: $where) { affected_rows }
    }
  `
  return graphqlRequest(mutation, { where: historyWhere(lessonCode, topicTitle) }, token).then((data) => {
    return (data.delete_learn_message && data.delete_learn_message.affected_rows) || 0
  }).catch(() => 0)
}

function packAdditional(messages) {
  const list = []
  ;(messages || []).forEach((item) => {
    if (!item || item.hidden || item.failed) return
    if (item.role !== 'user' && item.role !== 'assistant') return
    const content = String(item.content || '').trim()
    if (!content) return
    list.push({ role: item.role, content: content })
  })
  return list.slice(-16)
}

module.exports = {
  LAST_SCOPE_KEY: LAST_SCOPE_KEY,
  lessonCodeOf: lessonCodeOf,
  rememberScope: rememberScope,
  readLastScope: readLastScope,
  rowsToSession: rowsToSession,
  listMessages: listMessages,
  listAllMessages: listAllMessages,
  lastRow: lastRow,
  saveRows: saveRows,
  clearLesson: clearLesson,
  packAdditional: packAdditional
}
