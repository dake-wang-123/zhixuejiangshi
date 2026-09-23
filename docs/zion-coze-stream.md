# Zion 对接 Coze：流式输出与等待体验

结论先说：**Zion 的「第三方 API」节点吃不了 Coze 的 SSE。`stream` 必须保持 `false`。** 真正让十几秒变成两三秒的，是扣子端强制分段；前端用「思考气泡 + 打字机」消除一次性蹦字。

`stream: true` 时 Coze 返回的是：

```
event: conversation.message.delta
data: {"content":"你","..."}
```

Zion TPA 的返回配置只有 `code / msg / data` 这种整段 JSON。SSE 的 `Content-Type` 是 `text/event-stream`，第一行不是 `{`，节点会当成失败或截成空。不要在 Zion 里开 `stream: true`。

Zion 自带智能体（ZAI）可以通过 WebSocket 流式，那是 Zion 模型，不是 `api.coze.cn`。

当前项目已按本页降级方案改好：POST 立刻返回 `in_progress` → 前端每 0.8 秒 GET retrieve → 正文到了用打字机渲染。

---

## 第一部分：Zion API 节点配置（stream 与异步）

### 1. TPA「智学」`mu6ckpzl` POST `/v3/chat`

| 位置 | 字段 | 必填 | 值 | 说明 |
| --- | --- | --- | --- | --- |
| QUERY | `conversation_id` | 否 | 已有 Coze 数字 ID | **只能放 Query**，放 body 会被丢掉 |
| BODY | `bot_id` | 是 | 文本 Bot ID | |
| BODY | `user_id` | 是 | `learn-{用户}-{课号}` | |
| BODY | **`stream`** | 否 | **`false`** | 不要改 true |
| BODY | `auto_save_history` | 否 | `true` | |
| BODY | `additional_messages` | 是 | `[{role:user,content:输入框,content_type:text}]` | 只带本轮一句 |

返回配置保持常规 JSON，**不要为 SSE 加字段**：

```
body.code
body.msg
body.data.id
body.data.conversation_id
body.data.status          ← 一般是 in_progress
```

`status === in_progress` 时 **没有正文**。不要把这次响应的 `msg` 或 `data` 当回复。

### 2. 不要在同一个同步节点里死等写完

Actionflow「智学对话」保持 **同步**，但 Run Code 只做两件事之一：

- 用户发言：POST，立刻把 `conversation_id` / `chat_id` / `status: in_progress` 交出去（约 1–2 秒）
- 轮询：`user_message` = `__POLL_CHAT__|{conversation_id}|{chat_id}`，GET retrieve + list

**不要**把流程改成「同步等 Coze 写完 3000 字再返回」。那会卡满 30–60 秒超时，页面像死了。

Zion 画布里如果用「请求节点」：

1. 发送后立刻关按钮、开加载动画（不要用「同步等待直到有正文」）
2. 用「循环 / 定时器 / 再次请求」每 0.8–1.2 秒调 retrieve
3. `body.data.status === completed` 再调 message/list
4. 超时 60 秒提示「还在生成，点再问一次」

### 3. 轮询两个 GET

| TPA | URL | 看哪个字段 |
| --- | --- | --- |
| 智学会话状态 `y88cn638j` | GET `/v3/chat/retrieve` | `body.data.status` |
| 智学消息 `r43leo7de` | GET `/v3/chat/message/list` | `body.data` 里 `type==answer` 的 `content` |

Authorization 都绑密钥 `coze_api_key`。两个 QUERY：`conversation_id`、`chat_id`。

### 4. Zion 页面变量（加载态）

| 变量 | 用途 |
| --- | --- |
| `sending` | 布尔，发送中禁用按钮 |
| `thinking` | 布尔，显示思考气泡 |
| `thinkHint` | 文本，轮换提示 |
| `waitSec` | 数字，已等待秒数 |
| `reply_text` | 打字机当前已显示的字 |
| `reply_full` | 本轮完整正文（到了再打字） |

---

## 第二部分：前端 JS（打字机 + 轮询）

小程序已接在 `miniprogram/utils/typewriter.js` 和 `classroom.js`。Zion 自定义代码 / 页面 JS 可直接用下面这一份（无小程序 API 依赖的核心）：

```javascript
function stepSize(len) {
  var n = Number(len) || 0;
  if (n <= 0) return 1;
  if (n <= 48) return 2;
  if (n <= 160) return 4;
  return Math.max(6, Math.ceil(n / 28));
}

function typewrite(setShown, fullText, done) {
  var text = String(fullText || '');
  var shown = 0;
  function tick() {
    shown = Math.min(text.length, shown + stepSize(text.length));
    setShown(text.slice(0, shown), shown >= text.length);
    if (shown < text.length) setTimeout(tick, 24);
    else if (done) done();
  }
  tick();
}

// Zion 页面：发送后
page.setData({ sending: true, thinking: true, thinkHint: '智学正在翻这一课的教案…', waitSec: 0 });
// 1) 调 Actionflow / POST，拿到 conversation_id、chat_id
// 2) 每 800ms 调 retrieve；status 不是 completed 就只更新 waitSec
// 3) completed 后读 message/list，过滤 type===answer
// 4) thinking=false，对正文跑 typewrite，写入 reply_text
```

小程序绑定：

- 思考气泡：`wx:if="{{thinking}}"` 绑 `thinkHint`、`waitSec`
- 助手气泡：`{{item.content}}` + `item.streaming` 时显示光标 `▍`
- 发送按钮：`disabled="{{sending}}"`

不要在 Zion 里用 `wx.request` 直连 `api.coze.cn` 开 `stream: true`：PAT 会进小程序包，而且微信 `request` 对 SSE 分片支持不稳定。

---

## 第三部分：扣子「分段输出」提示词（整段粘贴）

打开 Coze 智能体 → **人设与回复逻辑**，贴在现有 10 步设定的**最后**（不要删原来的十步，只加约束）：

```
【输出节奏｜必须遵守，优先级高于展开教案】
你的知识库教案有 3000～5000 字。用户在微信小程序里等你，接口不能流式推字。你必须把长教案拆到多轮，绝对禁止一轮写完整篇教案。

每一轮只做三件事，按这个顺序，不要增加第四段长文：
1. 用不超过 100 字，说明「现在进行到十步里的第几步、这一步要达成什么」。
2. 最多再补 200 字的关键要点或示范（只服务当前这一步，不要把后面步骤的内容提前讲完）。
3. 用 1 个明确的问题收尾，等用户回答后再进入下一步。问题单独成段，放在回复最后。

硬性限制：
- 单轮正文（含标点）不超过 400 字。超过就删，宁可少讲，下一轮再补。
- 不要输出完整教案、不要罗列 10 步清单、不要把未进行到的步骤写成正文。
- 用户还没回答当前问题之前，不要自行跳步，也不要重复已经完成的步骤。
- 用户说「继续 / 下一步 / 展开」时，只展开当前步还没讲完的那一小块，仍然遵守 400 字和「一个问题收尾」。
- 需要引用教案原句时，只引与当前步直接相关的几句，不要整节粘贴。

开场（用户只打招呼、还没给课题）时：用不超过 80 字欢迎，并请用户给出课题原题或上传教案，不要开始讲十步正文。
用户给出课题后：承认课题名称，从你内定的第一步开始，仍按上面的「100 字说明 + 要点 + 一个问题」。
```

贴完后在 Coze 里发「你好」试一轮：应只有短欢迎；再发一个课题，应只进入第一步并提问。若仍出现长文，把「不超过 400 字」改成「不超过 250 字」再试。

这是缩短等待的主开关。前端打字机只能改善「到了之后怎么出现」，不能减少 Coze 生成 3000 字的时间。
