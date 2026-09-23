var fallbackBotId = '7683760370368380964';
var rawBot = context.getArg('bot_id');
var botId = (rawBot === 0 || rawBot) ? String(rawBot) : fallbackBotId;
if (!/^\d{10,}$/.test(botId)) {
  botId = fallbackBotId;
}
var userId = String(context.getArg('user_id') || 'lecturer');
var message = String(context.getArg('user_message') || '');
var conv = String(context.getArg('conversation_id') || '');
var lessonCode = String(context.getArg('lesson_code') || 'open') || 'open';
var topicTitle = String(context.getArg('topic_title') || '');
var POST_TPA = 'mu6ckpzl';
var LIST_TPA = 'r43leo7de';
var RETRIEVE_TPA = 'y88cn638j';

function normalizeAuth(raw) {
  var token = String(raw || '').replace(/^\s+|\s+$/g, '').replace(/^["']|["']$/g, '');
  if (!token) return '';
  while (token.toLowerCase().indexOf('bearer ') === 0) {
    token = token.substring(7).replace(/^\s+/, '');
  }
  return 'Bearer ' + token;
}
function isCozeId(v) {
  return /^\d{10,}$/.test(String(v || ''));
}
function asObj(v) {
  if (!v) return {};
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch (e) { return { raw: v }; }
  }
  return v;
}
function unwrap(payload) {
  var root = asObj(payload);
  if (root && root.body && (root.code === undefined || root.data === undefined)) {
    root = asObj(root.body);
  }
  return root;
}
function payloadOf(res) {
  return unwrap(res && res.data !== undefined ? res.data : res);
}
function messageList(payload) {
  var root = unwrap(payload);
  var list = root;
  if (root && root.data !== undefined) list = root.data;
  if (list && !Array.isArray(list) && list.data !== undefined) list = list.data;
  return Array.isArray(list) ? list : [];
}
function chatStatus(payload) {
  var root = unwrap(payload);
  if (root && root.data && root.data.status) return String(root.data.status);
  if (root && root.status) return String(root.status);
  return '';
}
function packItems(list, chatId) {
  var items = [];
  var want = String(chatId || '');
  for (var i = 0; i < list.length; i++) {
    var item = list[i] || {};
    var itemChat = item.chat_id ? String(item.chat_id) : '';
    if (want && itemChat && itemChat !== want) continue;
    var content = item.content;
    if (typeof content !== 'string') content = content ? JSON.stringify(content) : '';
    items.push({
      id: item.id ? String(item.id) : '',
      chat_id: itemChat || want,
      role: item.role || '',
      type: item.type || '',
      content: content,
      content_type: item.content_type || 'text'
    });
  }
  return items;
}
function packReply(items, status) {
  return JSON.stringify({ items: items || [], status: status || '' });
}
function failMsg(posted) {
  var tpaCode = posted && posted.code;
  var msgText = posted && posted.msg ? String(posted.msg) : '';
  if (String(tpaCode) === '4101' || String(tpaCode) === '4100' || msgText.indexOf('token') >= 0) {
    return '智学令牌被 Coze 拒绝（' + tpaCode + '）。请到 coze.cn 新建个人访问令牌。';
  }
  if (msgText.indexOf('Agent As API') >= 0 || msgText.indexOf('has not been published') >= 0) {
    return '智学 Bot 还没有发布到 API 渠道。请打开 coze.cn 该智能体 → 发布 → 勾选「Agent As API」。';
  }
  return msgText ? ('智学接口返回：' + msgText) : (tpaCode ? ('智学接口失败，错误码 ' + tpaCode) : '智学未返回会话，请稍后重试。');
}
function readChat(auth, convId, chatId) {
  var status = '';
  var listed = [];
  if (convId && chatId) {
    var retrieved = context.callThirdPartyApi(RETRIEVE_TPA, {
      Authorization: auth,
      conversation_id: convId,
      chat_id: chatId
    });
    var retrievedPayload = payloadOf(retrieved);
    status = chatStatus(retrievedPayload);
    var listRes = context.callThirdPartyApi(LIST_TPA, {
      Authorization: auth,
      conversation_id: convId,
      chat_id: chatId
    });
    listed = messageList(payloadOf(listRes));
  }
  return packReply(packItems(listed, chatId), status || 'in_progress');
}
function accountId() {
  var raw = context.getArg('account_id');
  if (raw === 0 || raw) return String(raw);
  try {
    var info = context.getSsoUserInfo();
    if (info && info.id) return String(info.id);
    if (info && info.userId) return String(info.userId);
    if (info && info.account && info.account.id) return String(info.account.id);
  } catch (e) {}
  return '';
}
function asAccountId(raw) {
  var n = Number(raw);
  if (isFinite(n) && n > 0) return n;
  return raw;
}
function historyMessages() {
  var raw = context.getArg('history_json');
  var list = [];
  try {
    list = JSON.parse(String(raw || '[]'));
  } catch (e) {
    list = [];
  }
  if (!Array.isArray(list)) list = [];
  var out = [];
  var start = list.length > 16 ? list.length - 16 : 0;
  for (var i = start; i < list.length; i++) {
    var item = list[i] || {};
    var role = item.role === 'assistant' ? 'assistant' : 'user';
    var content = String(item.content || '').trim();
    if (!content) continue;
    if (content.indexOf('__POLL_CHAT__|') === 0) continue;
    out.push({ role: role, content: content, content_type: 'text' });
  }
  return out;
}
function persistTurn(convId, chatId, packed, userText) {
  if (!isCozeId(convId)) return;
  var blob = asObj(packed);
  if (String(blob.status || '') !== 'completed') return;
  var uid = accountId();
  if (!uid) return;
  var listed = Array.isArray(blob.items) ? blob.items : [];
  var objects = [];
  var seen = {};
  function add(role, content, typ, mid) {
    var text = String(content || '').trim();
    if (!text) return;
    if (role !== 'user' && role !== 'assistant') return;
    if (typ === 'verbose' || typ === 'function_call' || typ === 'tool_response' || typ === 'tool_output' || typ === 'follow_up') return;
    if (text.indexOf('__POLL_CHAT__|') === 0) return;
    var key = String(mid || (convId + '|' + chatId + '|' + role + '|' + objects.length));
    if (seen[key]) return;
    seen[key] = true;
    objects.push({
      lesson_code: lessonCode,
      topic_title: topicTitle,
      role: role,
      content: text,
      content_type: 'text',
      conversation_id: convId,
      chat_id: String(chatId || ''),
      message_key: key,
      account_id: asAccountId(uid)
    });
  }
  for (var i = 0; i < listed.length; i++) {
    var item = listed[i] || {};
    add(item.role, item.content, item.type, item.id);
  }
  if (userText && userText.indexOf('__POLL_CHAT__|') !== 0) {
    add('user', userText, 'question', convId + '|' + chatId + '|user|prompt');
  }
  if (!objects.length) return;
  try {
    context.runGql(
      'InsertLearnMessages',
      'mutation InsertLearnMessages($objects: [learn_message_insert_input!]!) { insert_learn_message(objects: $objects, on_conflict: { constraint: learn_message_key_key, update_columns: [] }) { affected_rows } }',
      { objects: objects },
      { role: 'admin' }
    );
  } catch (e) {
    context.log('learn_message persist failed: ' + String(e && e.message ? e.message : e));
  }
}

var auth = normalizeAuth(context.getArg('api_key'));
var tpaCode = 0;
var tpaMsg = '';
var chatId = '';
var convId = isCozeId(conv) ? conv : '';

if (message.indexOf('__POLL_CHAT__|') === 0) {
  var parts = message.split('|');
  var pollConv = String(parts[1] || convId || '');
  var pollChat = String(parts[2] || '');
  if (isCozeId(pollConv)) convId = pollConv;
  if (isCozeId(pollChat)) chatId = pollChat;
  if (convId && chatId) {
    tpaMsg = readChat(auth, convId, chatId);
  } else {
    tpaMsg = '智学未返回会话，请稍后重试。';
  }
} else {
  var additional = [];
  if (!convId) additional = historyMessages();
  additional.push({ role: 'user', content: message, content_type: 'text' });
  var fzBody = {
    bot_id: botId,
    user_id: userId,
    stream: false,
    auto_save_history: true,
    additional_messages: additional
  };
  var postArgs = {
    fz_body: fzBody,
    Authorization: auth,
    'Content-Type': 'application/json'
  };
  if (convId) postArgs.conversation_id = convId;
  var res = context.callThirdPartyApi(POST_TPA, postArgs);
  var posted = payloadOf(res);
  tpaCode = posted.code;
  var data = posted.data || {};
  chatId = data.id ? String(data.id) : '';
  if (data.conversation_id) convId = String(data.conversation_id);
  if (!isCozeId(convId) || !isCozeId(chatId) || (tpaCode && Number(tpaCode) !== 0)) {
    tpaMsg = failMsg(posted);
  } else {
    var postedStatus = data.status ? String(data.status) : 'in_progress';
    if (postedStatus === 'completed' || postedStatus === 'failed' || postedStatus === 'canceled') {
      tpaMsg = readChat(auth, convId, chatId);
    } else {
      tpaMsg = packReply([], postedStatus);
    }
  }
}

persistTurn(convId, chatId, tpaMsg, message);

context.setReturn('authorization', auth);
context.setReturn('bot_id', botId);
context.setReturn('user_id', userId);
context.setReturn('user_message', message);
context.setReturn('conversation_id', convId);
context.setReturn('chat_id', chatId);
context.setReturn('tpa_code', tpaCode);
context.setReturn('tpa_msg', tpaMsg);
context.setReturn('body', chatId);
