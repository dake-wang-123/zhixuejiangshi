# Zion 对接 Coze v3：会话记忆与完整回复

Coze 官方 H5 自带会话。Zion 每次点「发送」都是一次独立 HTTP 调用。不把 **同一个** `conversation_id` 传回去、不设 `auto_save_history: true`、不去 `/v3/chat/retrieve` 等 `completed`，就会出现：智能体失忆、10 步流程断裂、回复被截成半截。

`conversation_id` **必须是 Coze 返回的数字 ID**（约 19 位）。不能拿 `用户ID+课程ID` 当 conversation_id 发给 Coze，否则接口会报会话不存在，下一轮等于新建对话。正确做法：用「用户ID+课程ID」做 **本地存储键**，把 Coze 返回的 `conversation_id` 存进去，之后每一轮原样传回。

当前项目已按下面清单配好，并同步到后端。

| 用途 | TPA id | 方法 | URL |
| --- | --- | --- | --- |
| 发起一轮对话 | `mu6ckpzl` | POST | `https://api.coze.cn/v3/chat` |
| 查本轮是否写完 | `y88cn638j` | GET | `https://api.coze.cn/v3/chat/retrieve` |
| 拉本轮消息 | `r43leo7de` | GET | `https://api.coze.cn/v3/chat/message/list` |

密钥：项目密钥 `coze_api_key`（`mu6ctbb0`），Header `Authorization` 绑 Secret，不要写进页面变量。

智学 Actionflow：`8e640419-2243-41b5-92c4-0dd349b97f2d`（同步，超时 60 秒）。前端不要直连 Coze，走这个流程，避免把 PAT 下发到小程序。

---

## 第一部分：Zion API 节点精确配置

### 1. 页面 / 全局变量（前端，先做）

在智学页建这些变量（页面变量即可；多页共用就放到全局状态）：

| 变量名 | 类型 | 初值 | 用途 |
| --- | --- | --- | --- |
| `user_id` | 文本 | 登录用户 id，缺省 `guest` | 传给 Coze `user_id`，同一学员保持不变 |
| `course_id` | 文本 | 课号如 `A01`，未选课用 `open` | **只做本地键**，不是 Coze conversation_id |
| `conversation_id` | 文本 | 空 | 存 Coze 返回的会话 ID，之后每轮带回 |
| `chat_id` | 文本 | 空 | 本轮 chat id，用来 retrieve / 拉消息 |
| `user_message` | 文本 | 绑定输入框 | 当前这一轮用户输入 |
| `reply_content` | 文本 | 空 | 流程输出：`{"items":[...],"status":"..."}` |
| `reply_text` | 文本 | 空 | 从 `items` 里抽出的 assistant 正文 |
| `chat_status` | 文本 | 空 | `in_progress` / `completed` / `failed` |

本地键（不要发给 Coze）：

```
storageKey = user_id + ':' + course_id
```

例如 `1000000000000006:A01`。从本地读出上次的 `conversation_id`，填进请求。

Coze `user_id` 建议：

```
learn-{用户ID}-{course_id}
```

同一课始终同一个 `user_id` + 同一个 `conversation_id`，10 步才接得上。

换课：换 `course_id`，读另一个键；没有就留空 `conversation_id`，让 Coze 新建。点「重新开始」：清掉当前键里的 `conversation_id`。

### 2. TPA「智学」`mu6ckpzl`（POST `/v3/chat`）

Zion：API 管理 → 智学。

**接口**

- URL：`https://api.coze.cn/v3/chat`
- 方法：POST
- 操作：mutation
- Content-Type：`application/json`

**请求**

| 位置 | 字段 | 类型 | 必填 | 绑定 / 值 |
| --- | --- | --- | --- | --- |
| HEADER | `Authorization` | TEXT | 是 | Secret `coze_api_key`，运行时加 `Bearer ` |
| HEADER | `Content-Type` | TEXT | 否 | `application/json` |
| BODY 根名必须是 `body` | OBJECT | 是 | 整段 JSON |

`body` 子字段：

| 字段 | 类型 | 必填 | 值 |
| --- | --- | --- | --- |
| `bot_id` | TEXT | 是 | `7683760370368380964`（**文本**，不要数字） |
| `user_id` | TEXT | 是 | 页面变量 `user_id` |
| `stream` | BOOLEAN | 否 | **`false`**。Zion 解析不了 SSE |
| `auto_save_history` | BOOLEAN | 否 | **`true`**。关掉服务端就不记上下文 |
| `additional_messages` | ARRAY\<OBJECT\> | 是 | 见下表 |

**关键：`conversation_id` 走 URL Query，不要放进 JSON body。** Coze 官方 curl 是 `POST /v3/chat?conversation_id=...`。写在 body 里会被忽略，每一轮都新建会话，这就是「失忆」。

| 位置 | 字段 | 类型 | 必填 | 值 |
| --- | --- | --- | --- | --- |
| QUERY | `conversation_id` | TEXT | 否 | 已有 Coze 数字 ID 才传；第一轮 **不要** 建这个参数，也不要传空字符串 |

`additional_messages[]`：

| 字段 | 类型 | 必填 | 值 |
| --- | --- | --- | --- |
| `role` | TEXT | 是 | 固定 `user` |
| `content` | TEXT | 是 | 页面变量 `user_message`（输入框） |
| `content_type` | TEXT | 否 | 固定 `text` |

拼出来的 body 只能是：

```json
{
  "bot_id": "7683760370368380964",
  "user_id": "learn-1000000000000006-lesson_A01",
  "stream": false,
  "auto_save_history": true,
  "additional_messages": [
    { "role": "user", "content": "{{输入框}}", "content_type": "text" }
  ]
}
```

第一轮没有会话时，整段不要带 `conversation_id`。

**成功响应（2xx）** 至少建这些字段，后面才能绑：

```
body.code                  INTEGER
body.msg                   TEXT
body.data                  OBJECT
body.data.id               TEXT     ← 本轮 chat_id
body.data.conversation_id  TEXT     ← 存进页面变量
body.data.status           TEXT     ← 通常是 in_progress
```

绑定回写：

- `conversation_id` ← `body.data.conversation_id`
- `chat_id` ← `body.data.id`

**不要**把 `body.msg` 或 `body.data` 整段当回复。POST 在 `stream: false` 时仍然是「先建 chat」，正文在消息列表里。

### 3. TPA「智学会话状态」`y88cn638j`（GET `/v3/chat/retrieve`）

没有这个节点，就只能靠「消息列表有没有变」猜写没写完，半截答案会被当成终稿。

| 位置 | 字段 | 类型 | 必填 | 绑定 |
| --- | --- | --- | --- | --- |
| HEADER | `Authorization` | TEXT | 是 | 同上 Secret |
| QUERY | `conversation_id` | TEXT | 是 | 页面变量 `conversation_id` |
| QUERY | `chat_id` | TEXT | 是 | 页面变量 `chat_id` |

成功响应：

```
body.code                  INTEGER
body.msg                   TEXT
body.data.id               TEXT
body.data.conversation_id  TEXT
body.data.bot_id           TEXT
body.data.status           TEXT     ← completed | in_progress | failed | canceled
```

`status !== completed` 时继续轮询（建议 1.2 秒一次）。不要在 `in_progress` 时把当前半截当终稿。

### 4. TPA「智学消息」`r43leo7de`（GET `/v3/chat/message/list`）

| 位置 | 字段 | 类型 | 必填 | 绑定 |
| --- | --- | --- | --- | --- |
| HEADER | `Authorization` | TEXT | 是 | 同上 Secret |
| QUERY | `conversation_id` | TEXT | 是 | 页面变量 `conversation_id` |
| QUERY | `chat_id` | TEXT | 是 | **必须带**。不带会返回整段历史，前端再拼上去就是「失忆 / 前言不搭后语」 |
| QUERY | 不要加 `additional_messages` | — | — | 这是 GET，只读本轮 |

成功响应：

```
body.code                 INTEGER
body.msg                  TEXT
body.data                 ARRAY
body.data[].id            TEXT
body.data[].chat_id       TEXT
body.data[].role          TEXT     user | assistant
body.data[].type          TEXT     question | answer | follow_up | verbose | function_call | tool_response
body.data[].content       TEXT
body.data[].content_type  TEXT
```

**展示路径（不要绑 `data[0].content`）**

正确：

1. `body.data` 整表
2. 只保留 `chat_id` 等于本轮的项（接口漏过滤时靠这一步）
3. 丢掉 `verbose` / `function_call` / `tool_response` / `tool_output`
4. 助手正文：`type === "answer"` 且 `role === "assistant"` 的 `content`，多条用 `\n\n` 拼
5. 建议问题：`type === "follow_up"` 的 `content`

错误路径（会残缺或串台）：

- `body.msg`
- `body.data[0].content`（第一条经常是 `verbose` 调试 JSON）
- 不带 `chat_id` 的整表 `body.data[].content`

### 5. Actionflow「智学对话」输入 / 输出

不要在页面上直接调三个 TPA（Authorization 必填，小程序拿不到密钥）。页面只调 Actionflow：

**输入**

| 参数 | 类型 | 绑定 |
| --- | --- | --- |
| `user_message` | TEXT | 输入框。轮询时由前端改成 `__POLL_CHAT__|{conversation_id}|{chat_id}`，**不要**再 POST 用户原话 |
| `user_id` | TEXT | `learn-{用户ID}-{课号}` |
| `conversation_id` | TEXT | 本地存的 Coze ID，没有就空 |
| `bot_id` | TEXT | `7683760370368380964` |

**输出**

| 字段 | 绑定来源 | 前端用法 |
| --- | --- | --- |
| `reply_content` | 节点 `pgp0heuzq.reply` | JSON：`{ items, status }` |
| `conversation_id` | 节点 `gye3v53ah.conversation_id` | 立刻写回页面变量 / 本地存储 |
| `raw` | 节点 `gye3v53ah.chat_id` | 本轮 `chat_id`，供下一轮 retrieve |

组装节点密钥入参 `api_key` 绑 Secret `coze_api_key`，不要出现在流程输出里。

---

## 第二部分：Run Code（完整代码）

节点 `gye3v53ah`「发送或读取智学原文」。Zion Run Code 不能 `await` / `setTimeout`，所以：

- 用户发言：POST 一次，若已是 `completed` 就顺手 retrieve + list；否则返回 `status: in_progress`
- 轮询：`user_message` 以 `__POLL_CHAT__|` 开头时 **禁止 POST**，只 GET retrieve + list，并且按 `chat_id` 过滤

```javascript
var fallbackBotId = '7683760370368380964';
var rawBot = context.getArg('bot_id');
var botId = (rawBot === 0 || rawBot) ? String(rawBot) : fallbackBotId;
if (!/^\d{10,}$/.test(botId)) {
  botId = fallbackBotId;
}
var userId = String(context.getArg('user_id') || 'lecturer');
var message = String(context.getArg('user_message') || '');
var conv = String(context.getArg('conversation_id') || '');
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
    status = chatStatus(payloadOf(retrieved));
    var listRes = context.callThirdPartyApi(LIST_TPA, {
      Authorization: auth,
      conversation_id: convId,
      chat_id: chatId
    });
    listed = messageList(payloadOf(listRes));
  }
  return packReply(packItems(listed, chatId), status || 'in_progress');
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
  tpaMsg = (convId && chatId) ? readChat(auth, convId, chatId) : '智学未返回会话，请稍后重试。';
} else {
  var fzBody = {
    bot_id: botId,
    user_id: userId,
    stream: false,
    auto_save_history: true,
    additional_messages: [
      { role: 'user', content: message, content_type: 'text' }
    ]
  };
  var postArgs = {
    fz_body: fzBody,
    Authorization: auth,
    'Content-Type': 'application/json'
  };
  if (convId) postArgs.conversation_id = convId;
  var posted = payloadOf(context.callThirdPartyApi(POST_TPA, postArgs));
  tpaCode = posted.code;
  var data = posted.data || {};
  chatId = data.id ? String(data.id) : '';
  if (data.conversation_id) convId = String(data.conversation_id);
  if (!isCozeId(convId) || !isCozeId(chatId) || (tpaCode && Number(tpaCode) !== 0)) {
    tpaMsg = failMsg(posted);
  } else {
    var postedStatus = data.status ? String(data.status) : 'in_progress';
    tpaMsg = (postedStatus === 'completed' || postedStatus === 'failed' || postedStatus === 'canceled')
      ? readChat(auth, convId, chatId)
      : packReply([], postedStatus);
  }
}

context.setReturn('authorization', auth);
context.setReturn('bot_id', botId);
context.setReturn('user_id', userId);
context.setReturn('user_message', message);
context.setReturn('conversation_id', convId);
context.setReturn('chat_id', chatId);
context.setReturn('tpa_code', tpaCode);
context.setReturn('tpa_msg', tpaMsg);
context.setReturn('body', chatId);
```

下一节点 `pgp0heuzq` 只做：

```javascript
context.setReturn('reply', String(context.getArg('tpa_msg') || ''));
```

流程超时建议 ≥ 60 秒。真正等 Coze 写完是小程序每 1.2 秒再调一次流程（poll 文本），不是在 Run Code 里死等。

---

## 第三部分：前端绑定路径

### Actionflow 返回（小程序 / Zion 请求节点）

| 展示 | 路径 |
| --- | --- |
| 会话 ID（写回变量） | `conversation_id` |
| 本轮 chat id | `raw` |
| 消息包 | `reply_content` → `JSON.parse` → `{ items, status }` |
| 本轮是否结束 | `reply_content.status` 等于 `completed` |
| 助手回复 | `reply_content.items` 中 `role==="assistant"` 且 `type==="answer"` 的 `content`，多条 `\n\n` 连接 |
| 建议问题 | `items` 中 `type==="follow_up"` 的 `content` |

### 若在 Zion 画布里直接绑 TPA（不推荐）

| 组件 | 绑定 |
| --- | --- |
| 对话气泡（助手） | **不要** `data[0].content`。用循环：`智学消息.body.data`，过滤 `item.type == "answer"`，文本绑 `item.content` |
| 状态提示 | `智学会话状态.body.data.status` |
| 会话变量 | `智学.body.data.conversation_id` |
| 输入框 | 页面变量 `user_message` → POST `body.additional_messages[0].content` |

等价 JSON 路径：

```
POST  /v3/chat                 → data.id , data.conversation_id , data.status
GET   /v3/chat/retrieve        → data.status
GET   /v3/chat/message/list    → data[i].content  where type=="answer" && chat_id==本轮
```

`data[0]` 在 Coze 里经常是 `verbose`（`{"msg_type":...}`），这就是「内容残缺 / 像调试 JSON」的原因。

### 小程序已实现的绑定

- 会话存储键：`zhixue_sessions_v10` → `lesson:{课号}` 或 `topic:{课题}` 或 `open`
- `user_id`：`stableUserId(account, sessionKey)`
- 气泡：本地 `thread`，本轮只追加 **这一次** `items`，不再把历史 answer 整段拼回去
- 结束条件：只认 `status === "completed"`，不认「两次回复没变化」

---

## stream: false 与长教案

Zion 无法消费 `stream: true` 的 SSE。三个 TPA 都保持 `stream: false`。长教案不要指望一轮吐完 3000–5000 字。

在 Coze 智能体人设末尾追加（不要改 10 步本身）：

```
【输出节奏】
1. 每一轮只推进当前一步，等用户回复后再进入下一步。
2. 单轮回复控制在 800 字以内；需要展开的教案分段放到后续轮次，并明确「下一问」。
3. 不要在一轮里把 10 步全部说完，也不要重复已经完成的步骤。
4. 需要用户作答时，把问题放在正文最后。
```

这样非流式也不会超长截断，10 步仍按智能体原逻辑走。
