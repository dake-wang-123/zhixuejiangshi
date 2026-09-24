# 上传个人教案（去掉教案 Tab）

底部「教案」Tab 已下线。个人教案入口在课程目录页、分类标签上方，默认收成一行弱入口，点开才展开表单。提交后进入智学，走和系统课同一套十步交付法。个人教案正文放进 `user_message`，**不要**给「智学对话」行为流加新入参。层级与样式见 `docs/zion-catalog-hierarchy.md`。

---

## 第一部分：Zion 页面组件配置清单

小程序已实现。若在 Zion 画布做同一块，按这个拼。

### 底部导航

设置 → 应用设置 → 底部导航，只留 3 项：

| 顺序 | 文案 | 页面 |
| --- | --- | --- |
| 0 | 课程 | 课程目录页 |
| 1 | 智学 | 学习 / 对话页 |
| 2 | 我的 | 个人中心 |

删掉「教案」。旧教案页若还在页面列表里，进入时跳转回课程目录。

### 课程目录页顶部卡片（所有分类列表之上）

```
页面
├─ 顶栏 / 英雄区（选择你要学习的课题）
├─ 弱入口：上传个人教案        ← 分类标签上方，默认一行灰字
│    └─ 展开后才出现小表单
│         ├─ 输入框  教案标题     → 页面变量 plan_title
│         ├─ 多行输入 教案正文   → 页面变量 plan_text
│         ├─ 按钮 从文件填入文本（仅 txt/md）
│         └─ 按钮 开始十步交付法
├─ 分类 chips：全部 / 0-3岁 / …
└─ 课程分组列表（B01 / A04 …）  ← 页面主体
```

画布组件：

| 组件 | 绑定 |
| --- | --- |
| 容器「上传个人教案」 | 背景 `#F7F8FC`，描边 `#E4E8F6`，不要做成全屏主色块 |
| 文本 主标题 | 常量「上传个人教案」 |
| 文本 说明 | 常量副标题 |
| 按钮「上传教案」 | 显示条件 `plan_open == false`；点击把 `plan_open` 设为 true |
| 输入框 标题 | `plan_title` |
| 多行输入 正文 | `plan_text`，最多约 12000 字 |
| 按钮「开始十步自学」 | 点击：校验 `plan_text` 非空 → 写入本地 / 页面变量 → 跳转智学 |
| 课程列表 | 原绑定不变，`course_catalog` |

页面变量：

| 变量 | 用途 |
| --- | --- |
| `plan_open` | 是否展开表单 |
| `plan_title` | 课题标题，空则用正文第一行 |
| `plan_text` | 教案全文 |
| `lesson_source` | `catalog` 或 `personal` |
| `lesson_code` | 系统课 `B01`；个人课 `P:标题摘要` |

视觉：卡片浅灰蓝底，和白色课程分组分开，但不要用大色块广告风。

---

## 第二部分：行为流怎么把个人教案传给扣子

「智学对话」入参仍然只有四个：`user_message` / `user_id` / `conversation_id` / `bot_id`。

个人教案**不是**第五个入参。放进第一轮 `user_message`：

```
【进度上下文】
current_step=1
step_name=自我介绍
completed=
command=start
source=personal
lesson_kind=personal
plan_title=破解分离焦虑
---
【个人教案】
source=personal
课题：破解分离焦虑
请只依据下面这份讲师自己的教案……
## 个人教案正文
（粘贴的全文，超过 8000 字截断）
```

系统课第一轮只有课题原题，并且 `source=catalog`、`lesson_kind=builtin`。扣子走知识库。

| 来源 | `source` | `lesson_code` | 第一轮 `user_message` |
| --- | --- | --- | --- |
| 目录点课 | `catalog` | `B01` | 课题原题 |
| 个人教案 | `personal` | `P:破解分离焦虑` | 进度块 + 【个人教案】全文 |
| 未选课打招呼 | `catalog` | `open` | `你好` |

后续轮次只带 `source=personal` 和 `plan_title`，不再重复贴全文。扣子靠 `conversation_id` 记住第一轮。会话丢了才用 `additional_messages` 里已落库的第一轮用户句。

画布按钮「开始十步自学」成功后：

```
1. 页面变量 lesson_source = personal
2. 页面变量 lesson_code = P: + 标题摘要
3. 跳转智学页（和小程序 switchTab 智学相同）
4. 智学页调用「智学对话」，user_message = 上面整段
5. 不要在 API 节点再加 body 字段 plan_text
```

`user_id` 仍是 `learn-{帐户id}-{课号}`，个人课号带 `P:`，和系统课会话分开。

---

## 第三部分：不要直接传 Word/PDF，用粘贴文本

Zion 和微信都读不稳 `.docx` / `.pdf`。优先粘贴正文。txt / md 可以本地读进文本框。

已实现：`miniprogram/utils/personal-plan.js`。画布「从文件填入」可跑同一段：

```js
function inferTitle(text, fileName) {
  const first = String(text || '').replace(/\r\n/g, '\n').split('\n').map(function (line) {
    return line.replace(/^\s*#+\s*/, '').replace(/[*`]/g, '').trim()
  }).filter(Boolean)[0] || ''
  if (first && first.length <= 40) return first
  const fromFile = String(fileName || '').replace(/\.[^.]+$/, '').trim()
  return (fromFile || first || '个人教案').slice(0, 40)
}

function readPlainFile(filePath, name) {
  const lower = String(name || '').toLowerCase()
  if (!/\.(txt|md|markdown|text)$/.test(lower)) {
    return Promise.reject(new Error('Word/PDF 读不到正文。请把教案复制到文本框后再开始。'))
  }
  return new Promise(function (resolve, reject) {
    try {
      const content = wx.getFileSystemManager().readFileSync(filePath, 'utf8')
      const text = String(content || '').trim()
      if (!text) reject(new Error('这个文本文件是空的，请粘贴正文。'))
      else resolve(text)
    } catch (e) {
      reject(new Error('这个文件读不成文本，请直接粘贴正文。'))
    }
  })
}

function packPersonalStart(title, text) {
  const raw = String(text || '').trim()
  const body = raw.length > 8000
    ? raw.slice(0, 8000) + '\n\n（后文已截断，智学先按前 8000 字带你走 10 步。）'
    : raw
  return [
    '【个人教案】',
    'source=personal',
    '课题：' + title,
    '请只依据下面这份讲师自己的教案，按十步交付法从第1步「自我介绍」开始引导。不要改用知识库里的系统课。',
    '',
    '## 个人教案正文',
    body,
    '',
    '开头写【当前步骤：1】。'
  ].join('\n')
}
```

云函数解析 Word/PDF：只有在你们自己有解析服务时才值得做。流程是「上传到 OSS → 云函数抽文本 → 回写 `plan_text`」。当前项目不接这条，避免再绕三个 ZAI 解析智能体。

---

## 第四部分：扣子提示词适配

贴在 10 步提示词「一、如何知道自己在哪一步」后面。

```
【个人教案与系统课｜必须遵守】
每一轮进度上下文里会有：
source=catalog 或 personal
lesson_kind=builtin 或 personal

1. source=personal，或用户正文含【个人教案】 / ## 个人教案正文
   - 只依据用户粘贴的教案正文带 10 步。
   - 禁止改用知识库里的系统课，禁止换成目录里的 B01/A04 等课题。
   - 教案里没有的观点，明确说「这份教案没写，我按讲师常用结构补一版」，不要假装来自知识库。
   - 检验 1 / 检验 2 也只针对这份个人教案产出讲稿、诊断、说课和 PPT 大纲。

2. source=catalog 或 lesson_kind=builtin
   - 用知识库对应课题，和原来一样。

3. 两种来源都走同一套 10 步名称、打卡标记、检验 1 / 检验 2。
   不要因为是个人教案就合并步骤或一轮讲完。
```

完整 10 步正文仍以 `docs/zion-ten-steps.md` 第三部分为准。改完后在扣子里分别试：点一门系统课；再粘贴一份无关教案。系统课应仍对知识库，个人课应只谈粘贴内容。
