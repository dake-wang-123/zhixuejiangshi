# 智学：`lesson_code` 报错排查 + 微信风格输入条

## 第一部分：传参报错排查清单和修复步骤

### 报错含义

```
com.zion.backend.support.actionflow.UnknownValueException: lesson_code is not specified in the schema
```

这不是「课程目录没把课号传给学习页」。课号 `A01` 已经存在本地（`PENDING_LESSON_KEY` / 页面变量 `lessonCode`）。真正挂掉的是 **调用「智学对话」行为流时多传了 schema 里没有的入参**，或 **Run Code 里 `context.getArg('lesson_code')` 读了节点 schema 没有的键**。Zion 把这段 Java 异常当成 `reply_content` 交回来，前端就把它画成了 AI 气泡。

线上契约 **只认 4 个入参**：

| 参数 | 类型 | 谁填 |
| --- | --- | --- |
| `user_message` | 文本 | 用户本轮原文，或轮询串 `__POLL_CHAT__\|cid\|chatId` |
| `user_id` | 文本 | `learn-{帐户id}-{课号}` |
| `conversation_id` | 文本 | 上次 Coze 会话 ID，没有就空字符串 |
| `bot_id` | 文本 | Coze Bot ID |

`lesson_code` / `topic_title` / `account_id` / `history_json` **一律不要**出现在：

1. 行为流「输入参数」列表（有就删掉）
2. 页面「请求 → 行为流」的参数绑定
3. Run Code 的 `context.getArg(...)`
4. 小程序 `fz_invoke_action_flow` 的 `args`

课号只给学习页自己用：列表绑定、本地缓存、写 `learn_message` 表。

### Zion 画布排查（如果你用可视化页，不是这套原生小程序）

1. 打开 **行为流 → 智学对话 → 输入参数**。只留上面四个。多余的点删除，然后 **同步后端**。
2. 打开 **发送或读取智学原文** 节点，全文搜索 `getArg('lesson_code')` / `getArg('topic_title')` / `getArg('account_id')` / `getArg('history_json')`，全部删掉。
3. 打开 **课程目录页** 列表项点击动作：
   - 正确：跳转到学习页，并把 `lesson_code`、`title` 写到 **页面变量** 或本地缓存。
   - 错误：把 `lesson_code` 绑到「请求行为流」的入参。
4. 打开 **学习页 → 页面状态 / 页面变量**，新增：
   - `lesson_code` 文本，默认 `open`
   - `title` 文本
   - `draft` 文本（输入框）
   - `conversation_id` 文本
5. 学习页「请求 → 智学对话」参数绑定只能是：

| 行为流入参 | 绑定 |
| --- | --- |
| `user_message` | 页面变量 `draft`（发送后立刻清空） |
| `user_id` | 当前登录用户 id 拼上课号，或固定前缀 |
| `conversation_id` | 页面变量 `conversation_id` |
| `bot_id` | 常量 Bot ID |

6. 聊天列表 **不要**绑定行为流报错原文。列表数据源是表 `learn_message`，筛选：

```
课号 = 页面变量 lesson_code
```

行权限已经限制「只能看自己的」，不要再加用户 ID 条件。

### 原生小程序里已经改好的传参

目录页 `onOpen`：

```javascript
wx.setStorageSync('pending_lesson', { lessonCode: code, title: title })
wx.switchTab({ url: '/pages/agent/index' })
```

智学页 `onShow` 读出 `lessonCode` 写到 `this.data.lessonCode`，再调 Coze。`runCoze` **只传 4 个入参**。对话落库走 `learn_message` GraphQL，不经过行为流。

若仍看到 Java 异常，前端会翻译成：

> 智学这次没有拿到合法入参。请从课程目录重新点这节课；行为流只传 user_message / user_id / conversation_id / bot_id。

不会再把乱码画成智学正文。

---

## 第二部分：微信风格底部输入框组件树

Zion 无法稳定实现「按住说话」。体验版没有录音权限、也没有现成语音组件。**砍掉语音**，只保留打字。

右侧那个空白框，来自 `button` + 图标组件：微信会给 `button` 留一层默认边框/背景，图标又经常画不出来，看起来就是一个空方块。改成 **普通 View + 文字「发送」**。

```
页面（学习页）
└─ 固定底部容器 wx-composer
   位置：fixed / 贴底
   背景：#F7F7F7
   顶边：1rpx #EDEDED
   内边距：12rpx 16rpx 20rpx
   有自定义 Tab 时 bottom = 148rpx
   └─ 横向条 wx-bar（flex，垂直居中）
      ├─ 左侧 +   wx-plus
      │    宽高 64rpx，圆，白底，边框 #E5E5E5
      │    字号 44rpx，颜色 #333333
      │    点击：动作表「重新开始」；有错误时多一项「再问一次」
      ├─ 中间输入  wx-input（原生 input，不要 textarea）
      │    高度 72rpx（≥48px）
      │    左右 margin 16rpx
      │    白底，圆角 8rpx
      │    字号 32rpx（16px），颜色 #333333
      │    绑定页面变量 draft
      │    confirm-type = send，回车即发送
      └─ 右侧发送  wx-send
           文字「发送」，字号 32rpx
           无内容 / 发送中：#B8B8B8
           有内容且空闲：#07C160（微信绿）
```

Zion 画布对照：

| 组件 | 定位 | 宽高 | 颜色 | 绑定 / 动作 |
| --- | --- | --- | --- | --- |
| 容器 | 固定底部，左右 0 | 自适应 | 底 `#F7F7F7` | 无 |
| `+` | 容器内左侧 | 32×32px | 字 `#333333`，边 `#E5E5E5` | 点击 → 动作表 |
| 单行输入 | 中间 flex:1 | 高 48px | 底 `#FFFFFF` | 值 = `draft` |
| 「发送」文本 | 右侧 | 最小 44px 宽 | 默认灰 / 就绪绿 | 点击 → 请求智学对话，成功后 `draft=''`，列表滚到底 |

不要再放：麦克风、相册、第二个输入框、图标发送按钮、语音条。

---

## 第三部分：固定底部、清空输入、滚到底的代码

小程序页已经写好。Zion 自定义代码 / 页面 JS 可直接对照。

```javascript
function onDraft(e) {
  this.setData({ draft: e.detail.value })
}

function onSend() {
  const text = String(this.data.draft || '').trim()
  if (!text || this.data.sending) return
  this.setData({ draft: '', sending: true })
  askZhixue(this, text).then(() => {
    const thread = this.data.thread || []
    const last = thread[thread.length - 1]
    this.setData({
      sending: false,
      scrollInto: last ? ('m-' + last.id) : 'thread-end'
    })
  }).catch((err) => {
    this.setData({ sending: false, error: friendlyError(err) })
  })
}

function onPlus() {
  const items = ['重新开始']
  if (this.data.error) items.push('再问一次')
  wx.showActionSheet({
    itemList: items,
    success: (res) => {
      if (items[res.tapIndex] === '重新开始') this.onClear()
      if (items[res.tapIndex] === '再问一次') this.onRetry()
    }
  })
}
```

WXSS（不要 `@import`，不要 `calc(env(safe-area-inset-bottom))` 混 rpx，不要 `button` 当发送）：

```css
.wx-composer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 80;
  background: #F7F7F7;
  border-top: 1rpx solid #EDEDED;
  padding: 12rpx 16rpx 20rpx;
}
.wx-bar { display: flex; align-items: center; }
.wx-plus {
  width: 64rpx;
  height: 64rpx;
  line-height: 58rpx;
  text-align: center;
  font-size: 44rpx;
  color: #333333;
  background: #FFFFFF;
  border: 1rpx solid #E5E5E5;
  border-radius: 50%;
}
.wx-input {
  flex: 1;
  height: 72rpx;
  margin: 0 16rpx;
  padding: 0 20rpx;
  background: #FFFFFF;
  border-radius: 8rpx;
  font-size: 32rpx;
  color: #333333;
}
.wx-send { min-width: 88rpx; font-size: 32rpx; color: #B8B8B8; }
.wx-send.ready { color: #07C160; }
```

聊天区 `scroll-view` 设 `scroll-into-view="{{scrollInto}}"`，列表最后一项 `id="m-{{item.id}}"`，末尾再放一个 `id="thread-end"`。发送成功后把 `scrollInto` 设成最后一条。
