const config = require('../config.js')
const { graphqlRequest } = require('./graphql.js')

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

function invokeAsyncFlow(args, token) {
  const query = `mutation RunAsync($args: Json!, $actionFlowId: String!) {
    fz_create_action_flow_task(actionFlowId: $actionFlowId, args: $args)
  }`
  return graphqlRequest(query, { args: args, actionFlowId: config.asyncFlowId }, token)
    .then((data) => data.fz_create_action_flow_task)
}

function pollFlowTask(taskId, token) {
  const query = `query FlowResult($taskId: Long!) {
    fz_action_flow_result(taskId: $taskId) { output status }
  }`
  const max = 80
  let attempts = 0
  function once() {
    attempts += 1
    return graphqlRequest(query, { taskId: taskId }, token).then((data) => {
      const row = data.fz_action_flow_result || {}
      if (row.status === 'COMPLETED' || row.status === 'FAILED') return row
      if (attempts >= max) throw new Error('智学任务超时。请确认 Zion 已同步「智学对话」流程，且 Coze Bot 可响应。')
      return new Promise((resolve) => setTimeout(() => resolve(once()), 1500))
    })
  }
  return once()
}

function extractReply(row) {
  let output = row && row.output
  if (output == null) return { reply: '', conversationId: '' }
  if (typeof output === 'string') {
    try {
      output = JSON.parse(output)
    } catch (e) {
      return { reply: output, conversationId: '' }
    }
  }
  const data = output.data || output
  const messages = data.messages || data.additional_messages || []
  let reply = output.reply_content || output.reply || data.content || ''
  if (reply === 'Success' || reply === 'success') reply = ''
  if (!reply && Array.isArray(messages)) {
    const assistant = messages.filter((item) => item && (item.role === 'assistant' || item.type === 'answer'))
    const last = assistant[assistant.length - 1] || messages[messages.length - 1]
    if (last) reply = last.content || last.text || ''
    if (reply && typeof reply === 'object') reply = JSON.stringify(reply)
  }
  if (!reply && typeof data === 'string' && data !== 'Success') reply = data
  if (!reply && output.msg && output.code && output.code !== 0) {
    reply = '智学错误：' + output.msg
  }
  const conversationId = output.conversation_id || data.conversation_id || ''
  const chatId = output.raw || data.id || output.id || ''
  if (!reply && (conversationId || chatId)) {
    reply = '智学已受理，但还没有拿到助手文本。请稍后再发「继续」。'
  }
  return {
    reply: reply || '',
    conversationId: conversationId,
    chatId: chatId
  }
}

function chatWithCoze(message, userId, conversationId, token) {
  if (!config.cozeBotId) {
    return Promise.reject(new Error('尚未配置 Coze Bot ID。请打开 miniprogram/config.js，把 cozeBotId 换成控制台里的 Bot ID。'))
  }
  const args = {
    user_message: message,
    user_id: String(userId || ''),
    conversation_id: conversationId || '',
    bot_id: config.cozeBotId
  }
  return invokeAsyncFlow(args, token).then((taskId) => pollFlowTask(taskId, token)).then((row) => {
    if (row.status === 'FAILED') {
      throw new Error('智学流程失败。请在 Zion 检查 Actionflow「智学对话」是否已同步，以及智学 / 智学消息 TPA 的 Authorization。')
    }
    const extracted = extractReply(row)
    if (!extracted.reply) {
      throw new Error('智学流程已跑完，但没有解析到回复。TPA 请求体需要包含 bot_id、user_id 和 additional_messages。')
    }
    return extracted
  })
}

module.exports = {
  runAgent: runAgent,
  parseLessonPlan: parseLessonPlan,
  chatWithCoze: chatWithCoze,
  parseJson: parseJson
}
