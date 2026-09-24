# 串台 / 脱轨：课号、会话、原文、回包隔离

Zion 前端只做搬运和展示。串台和脱轨来自页面变量被上一课污染，不是扣子「自己乱走」。

行为流「智学对话」入参仍然只有四个：`user_message` / `user_id` / `conversation_id` / `bot_id`。不要加 `lesson_code` / `current_step`。

---

## 第一部分：四个排查点（画布上点哪里）

### 1. `lesson_code` 有没有原样传到学习页

1. 打开 **页面 → 课程目录**。点任意一课的点击动作。
2. 看动作列表里有没有把当前行的 `lesson_code`（或「课号」）写入：
   - 页面变量 `lesson_code`
   - 或本地缓存 `zhixue_pending_lesson` = `{ lessonCode, title }`
3. 再打开 **页面 → 智学**。`onShow` / 页面加载动作必须先读这份待学课号，再写进本页 `lesson_code`。
4. 打开调试器 **AppData / 页面变量**：
   - 从目录点 B01，学习页 `lesson_code` 必须是 `B01`，标题是 B01 的课题。
   - 再回目录点 C02，学习页必须立刻变成 `C02`。如果还停在 B01，就是没覆盖。
5. 打开 **行为流 → 智学对话 → 发送或读取智学原文**。全文搜索 `getArg('lesson_code')`。有就删。课号只活在页面变量和 `learn_message.lesson_code`，不要进行为流入参。

污染信号：

- 目录点了 C02，学习页顶栏仍写「课号 B01」。
- 本地 `zhixue_sessions_v11` 里 `lesson:C02` 的 `topicTitle` 却是 B01 的标题。
- GraphQL `learn_message` 里同一条 `conversation_id` 同时出现在 B01 和 C02。

### 2. `conversation_id` 有没有按课隔离

这是串台的最高概率原因。

1. 学习页变量 `conversation_id` **禁止**绑成全局常量，也禁止绑「用户ID+课号」冒充。
2. 打开本地存储 `zhixue_conv_bind_v2`（原生）或画布里的「会话绑定」对象：键是 Coze 返回的 19 位数字，值是课号。同一个数字不能同时属于 B01 和 C02。
3. 换课动作必须按这个顺序：
   1. 停掉上一课还在飞的请求（否则回包会写进新课）。
   2. 页面 `conversation_id = ''`，`current_step = 1`，对话列表清空。
   3. 只按 **新课号** 去读 `learn_message`。
   4. 这一课以前有自己的数字会话，才填回去；没有就留空，让 Coze 新建。
4. 不要读「最后一条对话」全局行再写回页面。那会把刚学完的 C02 会话套到刚点开的 B01 上。
5. 行为流 POST `/v3/chat`：`conversation_id` 只放 Query。空字符串时 **不要建这个参数**。

对照：

| 场景 | 正确 | 错误 |
| --- | --- | --- |
| 第一次进 B01 | Query 不带会话，Coze 新建 `7371…`，绑定 B01 | 用固定 ID，或用 `learn-用户-B01` 当会话 |
| B01 学到一半退出再进 | 带回 B01 自己的 `7371…` | 带成全局 last 或 C02 的 ID |
| 从 B01 进 C02 | 页面会话清空；C02 没有历史就新建 `7372…` | 继续用 `7371…`，扣子还以为在上 B01 |
| B01 请求还没回来就点了 C02 | 丢掉 B01 回包，不准写入 C02 | 回包写进当前页，C02 气泡里出现 B01 正文 |

### 3. 发给扣子的 `content` 有没有被 Zion 加工

1. 打开行为流 **智学对话** 的 POST Body → `additional_messages[0].content`。
2. 它必须等于输入框原文，或开场时的课题原题（B01 就发「破解分离焦虑」这种标题）。
3. 下面这些 **一律不要** 拼进 `content`：
   - `【进度上下文】`
   - `current_step=8`
   - `请开始第X步的内容`
   - `当前是第X步`
   - `command=auto_next`
4. 画布如果有「进入下一步」自动动作，删掉。进度条只展示扣子自己写的 `【当前步骤：N】` / `【步骤完成：N】` / `[下一关: N]`。
5. 新进一课：页面 `current_step` 先重置为 **1**。有本课历史再按本课消息回放。不要沿用上一课的 8。
6. `current_step` 只是页面展示。不要加到行为流入参，也不要写进 `user_message`。

个人教案第一轮可以把教案正文放进 `user_message`（`【个人教案】` 块）。那是讲师自己的材料，不是 Zion 猜步号。

### 4. 回包有没有抽错正文

1. 行为流输出 `reply_content` 应是 `{ items, status }` JSON。
2. 展示组件只渲染 `items` 里 `role=assistant` 且 `type=answer` 的 `content`。
3. 用本轮 `chat_id` 过滤。`verbose` / `function_call` / `follow_up` / `role=user` 不要画进 AI 气泡。
4. 不要把整个 `output` 或上一轮缓存直接绑到文本组件。
5. 若气泡里出现另一课的标题、或 Java 异常 `UnknownValueException: lesson_code`，先看是不是多传了入参，再看是不是会话 ID 串台。

---

## 第二部分：画布行为流和变量怎么改

### 页面变量（学习页）

| 变量 | 类型 | 规则 |
| --- | --- | --- |
| `lesson_code` | 文本 | 只接受目录 / 学习记录点进来的课号。换课先写新值 |
| `conversation_id` | 文本 | 只接受 Coze 数字 ID，且必须已绑定当前 `lesson_code`。换课先清空 |
| `current_step` | 数字 | 换课先置 1。之后只跟本课回复里的步骤标记走 |
| `thread` | 数组 | 换课先清空，再按新课号回读 |
| `_turn_id` | 数字 | 每次换课 +1。回包时若对不上，丢掉 |

### 目录 → 学习

1. 列表项点击：`待学课号 = 当前行.lesson_code`，`待学标题 = 当前行.title`。
2. 跳转智学。
3. 智学加载：若待学课号 ≠ 当前 `lesson_code`：
   - 停请求
   - `conversation_id=''`，`current_step=1`，`thread=[]`
   - `lesson_code=待学课号`
4. 查询「智学对话记录」：`课号 = 页面变量 lesson_code`（行权限已限当前用户）。
5. 有行：最后一行的 `会话ID` 写入 `conversation_id`，画对话，**不要**再发开场。
6. 无行：`conversation_id` 保持空，把课题原题原样发给扣子。

### 智学对话行为流

输入只留：

| 入参 | 绑定 |
| --- | --- |
| `user_message` | 输入框原文。开场才用课题标题 |
| `user_id` | `learn-{帐户id}-{lesson_code}`，按课区分 |
| `conversation_id` | 页面变量；空就传空，节点里不要带 Query |
| `bot_id` | 固定 Bot |

Run Code 里禁止 `getArg('lesson_code')` / `getArg('current_step')`。

POST：

- 已有合法数字会话：Query 带 `conversation_id`；`additional_messages` 只放本轮用户一句。
- 没有：不带 Query；只放本轮一句。不要打包上一课历史。

换课或「重新开始」：

1. 删除本课 `learn_message`（`课号 = 当前 lesson_code`）。
2. 页面 `conversation_id=''`。
3. 解除该课号与旧数字会话的绑定。
4. 不要去读「全表最后一条」再跳到别的课。

### 进度条

只认扣子标记：`【当前步骤：N】`、`【步骤完成：N】`、`[下一关: N]`、`【十步完成】`。  
正文里提到「后面第 8 步会讲方法」不要跳步。  
不要自动再发「请开始第 N 步」。

---

## 第三部分：原生代码里已经修掉的污染

| 污染点 | 后果 | 修复 |
| --- | --- | --- |
| `packTurn` 拼接 `current_step` / 进度块 | 扣子收到 Zion 猜的步号，脱轨 | 只发用户原文 |
| `maybeAutoAdvance` 自动发「请开始第 X 步」 | 流程被前端劫持 | 删除自动请求 |
| 把「第 N 步」「## 方法与策略」当进度 | 讲到后文就跳到第 8 步 | 只认明确标记 |
| `startOpenFlow` 读全局最后一条对话 | 进智学被拽到另一课 | 只恢复当前课号 |
| 换课不打断上一课请求 | B01 回包写入 C02 | `_turnId` + 会话键校验 |
| `conversation_id` 不绑课号 | A 课历史进 B 课请求 | `zhixue_conv_bind_v2` 一对一绑定 |
| 换课不重置 `current_step` | 新课直接从第 8 步开讲 | `applyLesson` 先置 1 再回读本课 |

本地会话键改为 `zhixue_sessions_v11`，按 `lesson:B01` 分桶。旧的 `v10` 不再读取，避免脏会话继续生效。
