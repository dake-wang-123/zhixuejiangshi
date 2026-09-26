const config = require('../config.js')
const { graphqlRequest } = require('./graphql.js')
const { stripFollowUps } = require('./session.js')

function createConversation(zaiConfigId, inputArgs, token) {
  const query = `mutation CreateZai($inputArgs: Map_String_ObjectScalar!, $zaiConfigId: String!) {
    fz_zai_create_conversation(inputArgs: $inputArgs, zaiConfigId: $zaiConfigId)
  }`
  return graphqlRequest(query, { inputArgs: inputArgs, zaiConfigId: zaiConfigId }, token)
    .then((data) => data.fz_zai_create_conversation)
}

function pollConversation(conversationId, token, onTick) {
  const query = `query ZaiResult($conversationId: Long!) {
    fz_zai_conversation_result(conversationId: $conversationId) {
      conversationId status data reasoningContent
    }
  }`
  const max = 40
  let attempts = 0
  function once() {
    attempts += 1
    return graphqlRequest(query, { conversationId: conversationId }, token).then((data) => {
      const row = data.fz_zai_conversation_result || {}
      if (typeof onTick === 'function') onTick(row)
      if (row.status === 'COMPLETED' || row.status === 'FAILED') return row
      if (attempts >= max) throw new Error('智能体响应超时')
      return new Promise((resolve) => {
        setTimeout(() => resolve(once()), 1500)
      })
    })
  }
  return once()
}

function runAgent(zaiConfigId, inputArgs, token, onTick) {
  return createConversation(zaiConfigId, inputArgs, token).then((conversationId) => {
    return pollConversation(conversationId, token, onTick)
  })
}

function parseLessonPlan(fullText, token, onProgress) {
  const agents = config.agents
  function note(msg) {
    if (typeof onProgress === 'function') onProgress(msg)
  }
  note('正在提取章节结构…')
  const structureArgs = {}
  structureArgs[agents.structure.args.fullText] = fullText
  return runAgent(agents.structure.id, structureArgs, token).then((structureRow) => {
    if (structureRow.status === 'FAILED') throw agentFail(structureRow, '结构提取')
    const structure = parseJson(structureRow.data)
    note('正在生成摘要…')
    const summaryArgs = {}
    summaryArgs[agents.summary.args.fullText] = fullText
    summaryArgs[agents.summary.args.chaptersJson] = JSON.stringify(structure)
    return runAgent(agents.summary.id, summaryArgs, token).then((summaryRow) => {
      if (summaryRow.status === 'FAILED') throw agentFail(summaryRow, '摘要生成')
      const summary = parseJson(summaryRow.data)
      note('正在推荐课题标签…')
      const tagArgs = {}
      tagArgs[agents.tags.args.fullText] = fullText
      tagArgs[agents.tags.args.summariesJson] = JSON.stringify(summary)
      return runAgent(agents.tags.id, tagArgs, token).then((tagRow) => {
        if (tagRow.status === 'FAILED') throw agentFail(tagRow, '标签推荐')
        const tags = parseJson(tagRow.data)
        return {
          structure: structure,
          summary: summary,
          tags: tags
        }
      })
    })
  })
}

function agentFail(row, name) {
  const data = parseJson(row && row.data)
  if (data.code === 'INSUFFICIENT_AI_TOKEN' || (data.message && String(data.message).indexOf('AI points') >= 0)) {
    throw new Error('Zion AI 积分已用完，教案解析暂时无法运行。请到 Zion 控制台充值后再试。')
  }
  const extra = data.message || data.raw || ''
  throw new Error(name + '失败' + (extra ? '：' + extra : ''))
}

function parseJson(raw) {
  if (raw && typeof raw === 'object') return raw
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch (e) {
    return { raw: raw }
  }
}

function invokeAsyncFlow(args, token, flowId) {
  const query = `mutation RunAsync($args: Json!, $actionFlowId: String!) {
    fz_create_action_flow_task(actionFlowId: $actionFlowId, args: $args)
  }`
  return graphqlRequest(query, { args: args, actionFlowId: flowId || config.asyncFlowId }, token)
    .then((data) => data.fz_create_action_flow_task)
}

function invokeSyncFlow(args, token, flowId) {
  const query = `mutation RunSync($args: Json!, $actionFlowId: String!) {
    fz_invoke_action_flow_default_by_latest_version(actionFlowId: $actionFlowId, args: $args)
  }`
  return graphqlRequest(query, { args: args, actionFlowId: flowId || config.asyncFlowId }, token)
    .then((data) => data.fz_invoke_action_flow_default_by_latest_version)
}

function pollFlowTask(taskId, token, options) {
  const opts = options || {}
  const query = `query FlowResult($taskId: Long!) {
    fz_action_flow_result(taskId: $taskId) { output status }
  }`
  const max = opts.maxAttempts || 80
  const interval = opts.intervalMs || 1500
  const timeoutMessage = opts.timeoutMessage || '智学任务超时。请确认 Zion 已同步「智学对话」流程，且 Coze Bot 可响应。'
  let attempts = 0
  function once() {
    attempts += 1
    return graphqlRequest(query, { taskId: taskId }, token).then((data) => {
      const row = data.fz_action_flow_result || {}
      if (typeof opts.onTick === 'function') opts.onTick(row, attempts)
      if (row.status === 'COMPLETED' || row.status === 'FAILED') return row
      if (attempts >= max) throw new Error(timeoutMessage)
      return new Promise((resolve) => setTimeout(() => resolve(once()), interval))
    })
  }
  return once()
}

function isDebugJson(text) {
  const raw = String(text || '').trim()
  return raw.charAt(0) === '{' && raw.indexOf('msg_type') >= 0
}

function isHiddenType(typ) {
  return typ === 'verbose' || typ === 'function_call' || typ === 'tool_response' || typ === 'tool_output'
}

function parseBundle(text) {
  const raw = String(text || '').trim()
  if (!raw || raw.charAt(0) !== '{') return null
  try {
    const obj = JSON.parse(raw)
    if (obj && Array.isArray(obj.items)) return obj
  } catch (e) {}
  return null
}

function visibleItems(items) {
  const list = []
  ;(items || []).forEach((item) => {
    if (!item) return
    const typ = item.type || 'answer'
    const content = String(item.content || '').trim()
    if (!content || isDebugJson(content) || isHiddenType(typ)) return
    if (typ !== 'answer') return
    if (item.role && item.role !== 'assistant') return
    list.push({
      role: 'assistant',
      type: typ,
      content: content
    })
  })
  return list
}

function extractReply(row) {
  let output = row && row.output !== undefined ? row.output : row
  if (output == null) return { reply: '', items: [], followUps: [], status: '', conversationId: '', chatId: '' }
  if (typeof output === 'string') {
    try {
      output = JSON.parse(output)
    } catch (e) {
      return { reply: output, items: [], followUps: [], status: '', conversationId: '', chatId: '' }
    }
  }
  const data = output.data || output
  let reply = output.reply_content || output.reply || data.content || ''
  if (reply === 'Success' || reply === 'success') reply = ''
  const conversationId = output.conversation_id || data.conversation_id || ''
  const chatId = output.raw || data.id || output.id || output.chat_id || ''
  const bundle = parseBundle(reply)
  if (bundle) {
    const items = bundle.items || []
    const shown = visibleItems(items)
    const followUps = []
    items.forEach((item) => {
      if (item && item.type === 'follow_up' && String(item.content || '').trim()) {
        followUps.push(String(item.content).trim())
      }
    })
    const status = bundle.status || ''
    const settled = status === 'completed' || status === 'failed' || status === 'canceled'
    return {
      reply: shown.map((item) => item.content).join('\n\n'),
      items: shown,
      followUps: followUps,
      status: status,
      conversationId: conversationId,
      chatId: chatId,
      pending: !settled
    }
  }
  const split = stripFollowUps(reply || '')
  return {
    reply: split.reply || '',
    items: split.reply ? [{ role: 'assistant', type: 'answer', content: split.reply }] : [],
    followUps: split.followUps || [],
    status: '',
    conversationId: conversationId,
    chatId: chatId,
    pending: false
  }
}

function chatSettled(current) {
  const status = String((current && current.status) || '')
  return status === 'completed' || status === 'failed' || status === 'canceled'
}

function isFlowCrash(text) {
  const raw = String(text || '')
  return raw.indexOf('UnknownValueException') >= 0
    || raw.indexOf('com.zion.backend') >= 0
    || raw.indexOf('is not specified in the schema') >= 0
}

function runCoze(message, userId, conversationId, token) {
  const args = {
    user_message: message,
    user_id: String(userId || ''),
    conversation_id: conversationId || '',
    bot_id: config.cozeBotId
  }
  return invokeSyncFlow(args, token).then((output) => {
    const extracted = extractReply(output)
    if (isFlowCrash(extracted.reply)) {
      throw new Error(extracted.reply)
    }
    return extracted
  })
}

function chatWithCoze(message, userId, conversationId, token, onTick) {
  if (!config.cozeBotId) {
    return Promise.reject(new Error('尚未配置 Coze Bot ID。请打开 miniprogram/config.js，把 cozeBotId 换成控制台里的 Bot ID。'))
  }
  function emit(extracted) {
    if (typeof onTick === 'function') onTick(extracted)
    return extracted
  }
  function once(text, conv, attempt, previous) {
    return runCoze(text, userId, conv, token).then((extracted) => {
      if (!extracted.conversationId && previous && previous.conversationId) {
        extracted.conversationId = previous.conversationId
      }
      if (!extracted.chatId && previous && previous.chatId) {
        extracted.chatId = previous.chatId
      }
      emit(extracted)
      if (!extracted.conversationId || !extracted.chatId) {
        if (!extracted.pending && extracted.reply) return extracted
        throw new Error(extracted.reply || '智学未返回会话，请稍后重试。')
      }
      if (chatSettled(extracted)) {
        if (extracted.status === 'failed' || extracted.status === 'canceled') {
          throw new Error(extracted.reply || '智学本轮对话失败，请稍后重试。')
        }
        if (extracted.reply || extracted.followUps.length || attempt >= 6) return extracted
      }
      if (attempt >= 80) {
        if (extracted.reply) return extracted
        throw new Error('智学还在生成回复，请稍后再试。')
      }
      const pollMsg = '__POLL_CHAT__|' + extracted.conversationId + '|' + extracted.chatId
      return new Promise((resolve) => {
        setTimeout(() => resolve(once(pollMsg, extracted.conversationId, attempt + 1, extracted)), 800)
      })
    })
  }
  return once(message, conversationId || '', 0, null)
}

function parseFlowOutput(row) {
  let output = row && row.output
  if (output == null) return {}
  if (typeof output === 'string') {
    try {
      output = JSON.parse(output)
    } catch (e) {
      return { raw: output }
    }
  }
  return output.data || output
}

function generatePpt(payload, token, onProgress) {
  const args = {
    lecture_content: String((payload && payload.lecture_content) || '').slice(0, 16000),
    title: String((payload && payload.title) || '家庭教育课件').slice(0, 80),
    course_id: payload && payload.course_id ? String(payload.course_id) : '',
    user_id: payload && payload.user_id ? String(payload.user_id) : '',
    bot_id: config.cozeBotId
  }
  if (!args.lecture_content.trim()) {
    return Promise.reject(new Error('请先填写讲课稿或选择一门有内容的课程'))
  }
  if (typeof onProgress === 'function') onProgress('正在提交 PPT 任务…')
  return invokeAsyncFlow(args, token, config.pptFlowId).then((taskId) => {
    if (typeof onProgress === 'function') onProgress('智学正在写大纲，随后会调用 PPT 接口…')
    return pollFlowTask(taskId, token, {
      maxAttempts: 90,
      intervalMs: 2000,
      timeoutMessage: 'PPT 生成超时。流程包含智学大纲和智谱出片，通常需要一两分钟。',
      onTick: function (row) {
        if (typeof onProgress !== 'function') return
        if (row.status === 'PROCESSING' || row.status === 'CREATED') {
          onProgress('正在生成课件，请稍候…')
        }
      }
    })
  }).then((row) => {
    if (row.status === 'FAILED') {
      throw new Error('PPT 流程失败。请确认 Zion 已同步「PPT生成」，且 coze_api_key、ppt-api-key 有效。')
    }
    const output = parseFlowOutput(row)
    const status = output.status || ''
    const errorMessage = output.error_message || output.errorMessage || ''
    if (status === '失败' || (errorMessage && !output.file_url)) {
      throw new Error(errorMessage || 'PPT 生成失败')
    }
    return {
      fileUrl: output.file_url || output.fileUrl || '',
      recordId: output.record_id || output.recordId || '',
      status: status || '已完成',
      outline: output.outline || '',
      errorMessage: errorMessage,
      glmConversationId: output.glm_conversation_id || '',
      cozeConversationId: output.coze_conversation_id || ''
    }
  })
}

function openPptUrl(url) {
  if (!url) {
    wx.showToast({ title: '还没有可下载的文件', icon: 'none' })
    return
  }
  wx.setClipboardData({
    data: url,
    success: () => wx.showToast({ title: '链接已复制', icon: 'none' })
  })
  wx.downloadFile({
    url: url,
    success: (res) => {
      if (res.statusCode === 200 && res.tempFilePath) {
        wx.openDocument({
          filePath: res.tempFilePath,
          showMenu: true,
          fail: () => {}
        })
      }
    }
  })
}

module.exports = {
  runAgent: runAgent,
  parseLessonPlan: parseLessonPlan,
  chatWithCoze: chatWithCoze,
  generatePpt: generatePpt,
  openPptUrl: openPptUrl,
  parseJson: parseJson,
  extractReply: extractReply,
  visibleItems: visibleItems,
  chatSettled: chatSettled,
  isFlowCrash: isFlowCrash
}
