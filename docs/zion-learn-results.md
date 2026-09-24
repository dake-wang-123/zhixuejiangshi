# 我的学习成果（Zion 数据表 + 列表 / 详情）

讲师走完 10 步后，检验 1 产出「讲课逐字稿 + 诊断报告」，检验 2 产出「说课逐字稿 + PPT大纲」。这两份成果必须写入 Zion「学习成果」表，并在「我的」里按课回看。退出再进从数据表读，不靠本地缓存。

当前项目已经建好表、行权限并同步。小程序会在 Coze 返回后自动 upsert，并提供列表页 / 详情页。

---

## 第一部分：数据表字段（编辑器：数据 → 新建数据表）

表显示名：**学习成果**  
表 API 名：`learn_result`（创建后不可改，必须用英文蛇形）

系统自带、不要手建：`id`、`created_at`、`updated_at`。

| 显示名 | API 名 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| 课号 | `lesson_code` | 文本 | 是 | `B01` / `A04`；未选课用 `open` |
| 课题 | `topic_title` | 文本 | 否 | 课程标题，只作展示 |
| 成果类型 | `result_type` | 文本 | 是 | 只允许四值：`讲课逐字稿` / `诊断报告` / `说课逐字稿` / `PPT大纲` |
| 成果内容 | `content` | 文本 | 是 | AI 长文本。本项目字段类型是 TEXT，没有独立「长文本」类型 |
| 幂等键 | `result_key` | 文本 | 是 | `帐户id\|课号\|成果类型`，用来覆盖旧记录 |

关系（不要手写外键列）：

1. 数据 → 学习成果 → 添加关系  
2. 类型：一对多  
3. 源表：帐户；目标表：学习成果  
4. 帐户侧字段显示名 **学习成果列表**，API 名随平台生成  
5. 记录侧字段显示名 **学员**  
6. 平台会自动生成不可编辑的 `学员_id` / `account_id`

唯一约束：

- 名称：`learn_result_key_key`  
- 字段：幂等键  

这就是覆盖逻辑：同一讲师、同一课、同一成果类型只有一行。重新生成时 `on_conflict` 更新 `content` 和 `topic_title`。若要「每次生成一条新记录」，去掉唯一约束，并把幂等键改成 `帐户id|课号|成果类型|chat_id`。

行权限（设置 → 权限管理 → Logged-in User → 学习成果）：

| 操作 | 条件左值 | 条件右值 |
| --- | --- | --- |
| 查询 | Queried data / 学员_id | Logged in user / id |
| 新增 | Inserted data / 学员_id | Logged in user / id |
| 更新 | Before-update data / 学员_id | Logged in user / id |
| 删除 | Deleted data / 学员_id | Logged in user / id |

Anonymous 全部关掉。count / aggregate 关掉。管理员角色保持全开，方便排查。改完后必须 **同步后端**。

---

## 第二部分：列表页 / 详情页布局与绑定

「我的」页原来的「我的课件」已改成「我的学习成果」，点击进入列表。生成入口仍在智学学习页：没走完 10 步点不了检验 1，没完成检验 1 点不了检验 2。

### 列表页 `pages/results/index`

```
我的学习成果
├─ 空态：还没有成果，提示先走完 10 步
└─ 卡片列表（按课聚合，最近更新在前）
     ├─ 课号  B01
     ├─ 课题  破解分离焦虑
     └─ 标签  已生成 讲课逐字稿 · 已生成 诊断报告 · 待生成 说课逐字稿 …
```

| 界面 | 数据源 | 绑定路径 |
| --- | --- | --- |
| 列表 | `learn_result` 按 `created_at` 降序，limit 200 | 行权限已限当前用户，查询不要再传 user_id |
| 卡片标题 | `lesson_code` + `topic_title` | 前端按 `lesson_code` group |
| 成果类型标签 | 该课出现过的 `result_type` | `groupByLesson()` 映射成「已生成 / 待生成」 |

Zion 画布等价：

1. 页面查询：表 `学习成果`，排序 `创建时间 desc`，条数 200  
2. 列表组件 `dataSource` → 该查询  
3. 用「分组」或 Run Code 按 `课号` 聚合  
4. 卡片点击：跳转详情，带页面参数 `lesson_code`、`topic_title`

### 详情页 `pages/results/detail`

```
顶栏：课号 + 课题
Tabs：讲课逐字稿 / 诊断报告 / 说课逐字稿 / PPT大纲
正文：Markdown 分块（heading / para / list / script）
右下角悬浮（仅 PPT大纲 tab）：一键复制PPT大纲
```

| 界面 | 数据源 | 绑定路径 |
| --- | --- | --- |
| 四个 Tab | 本课 `learn_result` where `lesson_code = 页面参数` | `tabsFromRows()` |
| 当前正文 | `content` → `markdown.toBlocks` → `rich-text` | `current.blocks` |
| 空 Tab | 该类型没有行 | 「本课还没有 XXX。回到智学，先走完 10 步再生成。」 |
| 复制按钮 | 仅 `kind === outline` 且已生成 | `wx.setClipboardData` |

Tabs 切换不要用四个隐藏页面。四个 Tab 共用一个正文区，点 Tab 只改 `active`，再从已加载的 `tabs[]` 取出对应 `content`。退出再进会重新 `listLesson(lesson_code)`，所以持久化靠数据表。

Zion 画布 Tabs：四个标签绑定页面变量 `active_tab`；四个容器的显示条件分别是 `active_tab == 讲课逐字稿` 等。每个容器绑一条「课号 = 页面参数 且 成果类型 = 该标签」的查询。

---

## 第三部分：Coze 成功后写入学习成果表

**不要**给「智学对话」行为流再加 `lesson_code` / `result_type` / `content`。线上契约只认 `user_message` / `user_id` / `conversation_id` / `bot_id`。多一个入参会再报 `UnknownValueException`。

可靠写法（小程序已实现）：学习页收到 Coze `completed` 的 `reply` 后，前端 GraphQL upsert `learn_result`。

```
智学 POST /v3/chat
  → retrieve 等到 completed
  → message/list 取出 type=answer
  → 若 command=exam1 / exam2
       按 ## 标题切成 2 段
       insert_learn_result
       on_conflict: learn_result_key_key
       update_columns: content, topic_title
```

切段规则：

| 检验 | 标题 | 写入 `result_type` |
| --- | --- | --- |
| exam1 | `## 讲课逐字稿` | 讲课逐字稿 |
| exam1 | `## 诊断报告` | 诊断报告 |
| exam2 | `## 说课逐字稿` | 说课逐字稿 |
| exam2 | `## PPT大纲` | PPT大纲 |

找不到标题时：检验 1 整篇写入讲课逐字稿；检验 2 整篇写入说课逐字稿。不要把一轮回复糊进一个字段再靠前端硬拆。

幂等键：`帐户id|B01|讲课逐字稿`。同一课再点「再出一份讲课逐字稿」，覆盖旧正文，列表仍是一门课。

### 若坚持在 Zion 行为流里用「新增数据」节点

只在 **检验完成** 的链路里加，不要挂在普通问答上。

```
调用 API（智学 POST）成功
  → 条件：user_message 含 command=exam1 或 command=exam2
  → 条件：status 为 completed
  → Run Code：按 ## 标题切出 2 段长文本
  → 新增数据 × 2：学习成果
```

「新增数据」节点字段绑定：

| 节点字段 | 绑定 |
| --- | --- |
| 课号 | 不要 `getArg('lesson_code')`。从 `user_id` 解析 `learn-{帐户id}-{课号}`，或只让前端写库 |
| 课题 | 页面变量 / 组装节点算出的课题 |
| 成果类型 | 常量 `讲课逐字稿` 或 Run Code 输出的 `type` |
| 成果内容 | Run Code 切出来的那一段。必须绑「该段文本」，不要绑整份 `raw` JSON |
| 幂等键 | `帐户id + "|" + 课号 + "|" + 成果类型` |
| 学员 | 登录用户 |

冲突：选约束 `learn_result_key_key`，更新列勾选 `成果内容`、`课题`。

Run Code 切段示例（行为流组装节点）：

```js
function sectionOf(text, heading) {
  const src = String(text || '')
  const re = new RegExp('(?:^|\\n)\\s*(?:#{1,3}\\s*)?' + heading + '\\s*[:：]?\\s*\\n', 'i')
  const match = src.match(re)
  if (!match) return ''
  const start = match.index + match[0].length
  const rest = src.slice(start)
  const next = rest.search(/\n\s*#{1,3}\s+/)
  return (next < 0 ? rest : rest.slice(0, next)).trim()
}

const reply = String(context.get('reply_content') || '')
const script = sectionOf(reply, '讲课逐字稿')
const report = sectionOf(reply, '诊断报告')
```

然后两个「新增数据」分别把 `script` / `report` 写进 `成果内容`。检验 2 同理切 `说课逐字稿` / `PPT大纲`。

轮询请求（`user_message` 以 `__POLL_CHAT__|` 开头）不要入库。

---

## 第四部分：复制与 Tabs 的 JS

小程序详情页已经内置。若在 Zion 画布自定义，用下面两段。

### Tabs 切换

```js
function onResultTab(page, kind) {
  const tabs = page.data.tabs || []
  const current = tabs.filter(function (item) { return item.kind === kind })[0] || null
  page.setData({
    active: kind,
    current: current,
    showCopy: !!(current && current.kind === 'outline' && current.ready)
  })
}
```

画布：四个标签的点击事件把页面变量 `active_tab` 设成对应中文名；四个内容容器的显示条件写 `{{active_tab == 'PPT大纲'}}`。

### 一键复制 PPT 大纲

```js
function copyOutline(text) {
  const data = String(text || '').trim()
  if (!data) {
    wx.showToast({ title: '还没有 PPT 大纲', icon: 'none' })
    return
  }
  wx.setClipboardData({
    data: data,
    success: function () {
      wx.showToast({ title: '已复制 PPT 大纲' })
    }
  })
}
```

画布：悬浮按钮点击 → 运行 JS，入参绑「当前查询的 成果内容」。不要试图在 Zion 里生成 `.pptx` 文件。

### 10 步门槛（不要做到成果页里）

生成仍在学习页。`startExam1` 看 `finished`，`startExam2` 看 `exam1Done`。成果页只读已落库的行，没有行就显示空态。
