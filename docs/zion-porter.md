# Zion 只搬运：请求、进度条、换课、回包

Zion 只调取和展示。十步交付法的顺序只由扣子决定。

---

## 第一部分：越权清单（必须删）

| 位置 | 越权行为 | 处理 |
| --- | --- | --- |
| `packTurn` / 行为流 `additional_messages` | 拼接 `【进度上下文】`、`current_step=` | 已改为只发原文 |
| `startStepPrompt` / `maybeAutoAdvance` | 自动发「请开始第 X 步」 | 禁止调用，禁止自动请求 |
| `replayPrompt` | 点进度条就发「请回到第 N 步」 | 只回看，不发请求 |
| `exam1ConfirmPrompt` / `exam2ConfirmPrompt` | 前端替扣子写检验稿要求 | 按钮只发「确认进入」原文 |
| `onSend` + `isConfirmText` | 输入「好的」被拦截成检验请求 | 原样发给扣子 |
| `packPersonalStart` | 「从第1步自我介绍开始」「写【当前步骤：1】」 | 只发课题 + 教案正文 |
| 进智学自动发「你好」 | 前端替用户开口 | 未选课就等输入 |
| 本地 `item.step` / `session.currentStep` | 用 Zion 猜的步号覆盖扣子标记 | 只从回复提取 |
| 正文里出现「第8步」就跳步 | 把讲义当进度 | 只认 `[当前步骤: X]` |

行为流「智学对话」入参仍只有：`user_message` / `user_id` / `conversation_id` / `bot_id`。  
Run Code 禁止 `getArg('lesson_code')` / `getArg('current_step')`。

---

## 第二部分：正确配置

### 请求体

```
POST /v3/chat?conversation_id={仅当已有本课 Coze 数字 ID}
{
  "bot_id": "...",
  "user_id": "learn-{帐户id}-{lesson_code}",
  "stream": false,
  "auto_save_history": true,
  "additional_messages": [
    { "role": "user", "content": "输入框原文", "content_type": "text" }
  ]
}
```

开场：目录点课只发课题原题；个人教案只发「课题：标题」+ 正文。不要加步号。

### 进度条

页面变量 `current_step` 只读。从本轮 AI 回复提取 `[当前步骤: X]` 后赋值。

- `n < current_step` → 已完成
- `n == current_step` → 进行中
- `n > current_step` → 未开始

进度条点击只回看，不改 `current_step`，不发请求。

### 换课

1. 停掉上一课未完成请求
2. `lesson_code` 写成新课号
3. `current_step = 1`
4. `conversation_id = ''`（不要把上一课的 Coze 数字带过来）
5. 本地槽位键 = `用户ID+课号+时间戳`，只做隔离，**不要**发给 Coze
6. 按新课号回读 `learn_message`：有本课历史才填回本课自己的数字会话；没有就让 Coze 新建

Coze 的 `conversation_id` 必须是接口返回的约 19 位数字。`用户ID+课号+时间戳` 当 Query 会报会话不存在。

---

## 第三部分：扣子提示词片段

贴进智能体人设，要求每轮末尾带标记：

```
你是十步交付法的唯一裁判。顺序固定，禁止跳步、禁止改课题：
1 自我介绍 → 2 破题 → 3 目标价值 → 4 同理家长 → 5 对齐认知
→ 6 方法与策略 → 7 案例萃取 → 8 互动设计 → 9 误区与答疑 → 10 总结收尾

Zion 只转发讲师原话，不会告诉你当前第几步。你必须根据本会话历史继续，禁止每一轮从第 1 步重来。

每一轮回复最后一行必须单独输出（方括号、半角冒号、数字）：
[当前步骤: X]

X 是你此刻正在带的那一步（1–10）。用户还没回答本步提问之前，X 不要加一。
不要输出「请开始第X步」以外的前端指令。不要提到其他课号。
```

---

## 第四部分：提取与重置

原生实现：`miniprogram/utils/flow.js` 的 `extractCurrentStep`，`miniprogram/utils/isolation.js` 的换课绑定，`miniprogram/utils/classroom.js` 的 `applyLesson`。
