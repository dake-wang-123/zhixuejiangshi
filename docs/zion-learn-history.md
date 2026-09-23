# 学习记录持久化（Zion 数据表 + 行为流）

讲师学完退出再进，对话和 10 步进度不能只靠手机本地缓存。本地键会在清缓存、换机、`FLOW_VERSION` 升级后丢光。正确做法：每条问答写入 Zion「智学对话记录」表，进页按 **登录用户 + 课号** 回读，并把 Coze 的 `conversation_id` 原样带回去。

当前项目已经按下面清单建好并同步。小程序智学页会自动读写这张表。

---

## 第一部分：数据表字段（编辑器：数据 → 新建数据表）

表显示名：**智学对话记录**  
表 API 名：`learn_message`（创建后不可改，必须用英文蛇形）

系统自带、不要手建：`id`、`created_at`、`updated_at`。

| 显示名 | API 名 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| 课号 | `lesson_code` | 文本 | 是 | `A01` 这类课号；未选课用 `open` |
| 课题 | `topic_title` | 文本 | 否 | 课题原题，只作展示和未选课时的过滤 |
| 角色 | `role` | 文本 | 是 | 只存 `user` 或 `assistant` |
| 内容 | `content` | 文本 | 是 | 这一条的原文 |
| 内容类型 | `content_type` | 文本 | 否 | 固定 `text` |
| 会话ID | `conversation_id` | 文本 | 否 | Coze 返回的数字会话 ID，约 19 位 |
| 对话ID | `chat_id` | 文本 | 否 | 本轮 `chat_id`，用来去重 |
| 幂等键 | `message_key` | 文本 | 是 | `会话ID\|对话ID\|角色\|消息id`，防止轮询重复写入 |

关系（不要手写外键列）：

1. 数据 → 智学对话记录 → 添加关系  
2. 类型：一对多  
3. 源表：帐户；目标表：智学对话记录  
4. 帐户侧字段显示名 **智学对话**，API 名 `learn_messages`  
5. 记录侧字段显示名 **学员**，API 名 `account`  
6. 平台会自动生成不可编辑的 `学员_id` / `account_id`

唯一约束：

- 名称：`learn_message_key_key`  
- 字段：幂等键  

行权限（设置 → 权限管理 → Logged-in User → 智学对话记录）：

| 操作 | 条件左值 | 条件右值 |
| --- | --- | --- |
| 查询 | 被查询数据 / 学员_id | 登录用户 / id |
| 新增 | 被插入数据 / 学员_id | 登录用户 / id |
| 删除 | 被删除数据 / 学员_id | 登录用户 / id |

查询、删除的左值菜单分别叫「Queried data / Deleted data」，不要混用。Anonymous 全部关掉。count / aggregate 关掉，避免被人扫全表行数。管理员角色保持全开。改完后必须 **同步后端**。

---

## 第二部分：行为流写入与读取

智学行为流：`智学对话`（id `8e640419-2243-41b5-92c4-0dd349b97f2d`，同步，超时 60 秒）。

```
Input
  │
  ▼
发送或读取智学原文   ← Run Code：调 Coze，completed 后写入「智学对话记录」
  │
  ▼
交出智学原文
  │
  ▼
Output  reply_content / conversation_id / raw
```

### 入参（行为流 → 输入参数）

| 参数 | 类型 | 谁传 | 用途 |
| --- | --- | --- | --- |
| `user_message` | 文本 | 聊天框 | 本轮用户原文；轮询时是 `__POLL_CHAT__\|cid\|chatId` |
| `user_id` | 文本 | 前端 | 传给 Coze 的 `user_id`，形如 `learn-{帐户id}-{课号}` |
| `conversation_id` | 文本 | 前端 | 上次存下的 Coze 会话 ID；没有就留空 |
| `bot_id` | 文本 | 前端 / 默认 | Bot ID |
| `account_id` | 文本 | 前端 | Zion 帐户 id，写入 `学员_id` |
| `lesson_code` | 文本 | 前端 | `A01` 或 `open` |
| `topic_title` | 文本 | 前端 | 课题原题 |
| `history_json` | 文本 | 前端 | 仅当没有 `conversation_id` 时传入最近 16 条 `[{role,content}]` |

在编辑器里：行为流 → 智学对话 → 输入参数 → 添加上述四个新参数。Run Code 里用 `context.getArg('lesson_code')` 读取，不必再给节点单独加插槽。

### 写入（Coze 成功之后）

不要单独再拖一个「新增数据」节点去写两行。轮询会把同一轮打很多次，节点插入会重复。用组装节点在 `status === completed` 时 `runGql` 插入，并靠幂等键 `on_conflict do nothing`：

1. API 节点 POST `/v3/chat` 返回 `conversation_id` + `chat_id`  
2. GET retrieve 等到 `completed`  
3. GET message/list，按 `chat_id` 过滤  
4. 把本轮 `role=user` 的提问和 `role=assistant` 且 `type=answer` 的回复写成 `learn_message` 行  
5. 冲突策略：约束 `learn_message_key_key`，`update_columns` 为空  

对应 Zion 界面如果坚持用节点，等价链路是：

```
调用 API（智学 POST）成功
  → 条件：status 为 completed（轮询完成）
  → 新增数据：智学对话记录（用户提问）
  → 新增数据：智学对话记录（AI 回复）
  → 两行的「幂等键」都要带上 conversation_id + chat_id
```

轮询请求（`user_message` 以 `__POLL_CHAT__|` 开头）**不要**当作用户提问入库。

### 读取（页面初始化，不要再调 Coze）

前端进智学页、登录完成后：

```
查询 智学对话记录
  过滤：课号 = 当前课号（A01 / open）
  排序：创建时间 升序
  条数：200
```

行权限已经限制为当前登录用户，所以 **不要** 再在查询里传用户 ID 做一次不可靠的前端过滤。

把结果映射到聊天列表：

- `role` → 气泡左右  
- `content` → 文本  
- 最后一条的 `conversation_id` → 页面变量，下一轮原样传回 Coze  

如果本课已有助手回复，**不要清空、不要重新发送课题**。只有该课一条记录都没有时，才把课题原题发给智学。

点「重新开始」：按课号删除该学员的行，再走未选课引导。

### 上下文恢复（`additional_messages`）

| 情况 | POST `/v3/chat` 怎么传 |
| --- | --- |
| 已经有 Coze `conversation_id` | Query 带上它；`additional_messages` **只放本轮用户这一句**。Coze 自己有历史，再打包会重复，10 步会乱。 |
| `conversation_id` 丢了（清缓存、旧数据） | 不要编一个「用户ID+课号」去冒充。留空让 Coze 新建会话；把最近 16 条历史放进 `additional_messages`，最后追加本轮用户句。 |

`auto_save_history` 必须是 `true`。`conversation_id` 必须走 Query，放进 body 会被 Coze 丢掉。

---

## 第三部分：前端聊天列表绑定与过滤

小程序智学页不是 Zion 画布组件，绑定关系如下。若在 Zion 画布做同一页，按右侧「画布等价」做。

### 小程序（已实现）

| 界面 | 数据 | 过滤 |
| --- | --- | --- |
| 聊天列表 `thread` | `learn_message` 按 `created_at` 升序，再映射成 `{id,role,content}` | `lesson_code = 当前课号`；用户范围由行权限保证 |
| 空态 | `thread.length === 0` | 有历史就渲染气泡，不要显示「正在取引导」 |
| 页面变量 `conversationId` | 该课最后一条的 `conversation_id` | 下一轮写入行为流入参 |
| 课号 | 目录点进来的 `A01`，或未选课的 `open` | 和写入时同一套键 |

GraphQL 过滤必须是 operator-first：

```graphql
query LearnHistory($where: learn_message_bool_exp) {
  learn_message(where: $where, order_by: { created_at: asc }, limit: 200) {
    id lesson_code topic_title role content conversation_id chat_id created_at
  }
}
```

```json
{
  "_and": [
    {
      "_eq": {
        "text_operand": {
          "left_operand": { "column": "lesson_code" },
          "right_operand": { "literal": "A01" }
        }
      }
    }
  ]
}
```

### 画布等价（Zion 界面）

1. 智学页放一个「列表」组件，数据源选表 **智学对话记录**。  
2. 默认筛选：`课号` 等于页面变量 `lesson_code`（或输入参数）。不要加用户 ID 条件，行权限已经做了。  
3. 排序：`创建时间` 升序。  
4. 列表单元格里放两条文本：一条绑定当前行 `内容`；容器样式按当前行 `角色` 是否等于 `user` 左右对齐。  
5. 页面加载动作：先查列表。若返回条数 > 0，把最后一行的 `会话ID` 写入页面变量 `conversation_id`，**不要**再触发「发送课题」。若为 0，再走原来的开场发送。  
6. 发送成功回调：刷新该列表（或依赖行为流刚写入的行）。  

过滤条件在编辑器里点开列表 → 数据 → 筛选：

- 字段：课号  
- 运算符：等于  
- 值：页面变量 / `lesson_code`  

---

## 不要做的事

- 不要把 `用户ID + 课号` 当成 Coze `conversation_id`。  
- 不要在已有 `conversation_id` 时把全量历史再塞进 `additional_messages`。  
- 不要在进页时只要本地缓存空就 `messages = []` 并重发课题。  
- 不要给 Anonymous 开放这张表。  
- 不要发明 10 步文案；进度以智学原文为准，记录只负责原样存和原样画。
