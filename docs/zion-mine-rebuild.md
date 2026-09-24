# 「我的」页与学习记录两层结构

静默登录已经拿到微信昵称和头像。「我的」不再放资料表单。学习成果入口改名为「学习记录」：第一层是学过的课，第二层才是该课的讲稿 / 诊断 / 说课 / PPT 大纲。

---

## 第一部分：「我的」页组件布局

画布或小程序都按这个树拼。页面底色 `#F4F5F7`，左右留白 32rpx，卡片圆角 24rpx。

```
页面（#F4F5F7）
├─ 用户信息区（白底，左右 40rpx，上下 36–40rpx）
│    ├─ 图片 头像 120rpx 圆
│    └─ 文本 昵称 40rpx / 辅助「微信已登录」24rpx #999
├─ 会员卡片（#3C3428，圆角 24rpx，内边距 32rpx）
│    └─ 标题「会员中心」#F7E7C1 · 状态「未开通 / 有效期至」
├─ 功能列表（白底分组）
│    ├─ 学习记录
│    └─ 我的收藏
└─ 设置列表（白底分组，与上一组间距 24rpx）
     ├─ 帮助中心
     ├─ 关于我们
     └─ 课程归档上传（仅管理员）
```

| 区域 | 色值 / 间距 |
| --- | --- |
| 页底 | `#F4F5F7` |
| 头像 | 120rpx，右距 24rpx |
| 列表行 | 内边距 32rpx，图标底 `#EEF1FE` |
| 主色 | `#4B6EF5` |
| 会员金 | `#C9A36A` / 文案 `#F7E7C1` |

**不要**再放从业年限输入框、「保存资料」、「完善资料」。头像昵称只读。

### 静默登录怎么绑

Zion 画布：

| 展示 | 绑定路径 |
| --- | --- |
| 昵称 | Context → Logged in user → 用户名 |
| 头像 | Context → Logged in user → 用户头像 → url |

微信 `loginWithWechatMiniApp` 成功后写入帐户。GraphQL 字段是 `fz_account.username`、`fz_account.profileImageUrl`。小程序用 `accountView()` 读这两个字段；头像可能是字符串或 `{ url }`。

画布不要再做「更新资料」行为流。

---

## 第二部分：学习记录列表与详情

现成的 Zion「学习记录」表 `study_record` 只有 `用户_id + 课程_id + 学习进度`，对的是上架课程，**没有课号**。10 步自学的课号在「智学对话记录」`learn_message` 和「学习成果」`learn_result`。

列表不要只查 `study_record`，否则 B01 / 个人教案 `P:` 都出不来。

### 第一层列表 `pages/results/index`

查询（行权限已限当前用户，不必再传 user_id）：

1. `learn_message` 按 `created_at` 升序，limit 400  
2. `learn_result` 按 `created_at` 降序，limit 200  
3. 前端按 `lesson_code`（未选课再加 `topic_title`）聚合，按最后一条时间倒序  

| 列表字段 | 来源 |
| --- | --- |
| 课号 | `lesson_code` |
| 标题 | `topic_title` |
| 进度文案 | 对话推出来的 10 步：`已完成10步` 或 `学习中：第3步 · 目标价值` |
| 成果摘要 | 该课 `learn_result` 已生成类型 |

点击：跳转详情，页面参数 `lesson_code`、`topic_title`。

画布等价：两个查询 → Run Code 按课号合并 → 列表 `dataSource`。不要单独为跳转再写一条行为流。

### 第二层详情 `pages/results/detail`

过滤：**当前登录用户**（行权限）+ `lesson_code = 页面参数`。

```
顶栏：课号 / 课题 / 进度条 / 继续学习 / 收藏
Tabs：讲课逐字稿 / 诊断报告 / 说课逐字稿 / PPT大纲
正文：markdown.toBlocks → rich-text
     字号 16px，行距 1.8，标题 17px 加粗，段间距 36rpx
```

| 绑定 | 路径 |
| --- | --- |
| Tabs | `learn_result` where `lesson_code = 页面参数` |
| 进度 | 同课 `learn_message` → `inferProgress` |
| 继续学习 | 写入待学课号，打开智学 Tab |

若坚持在行为流里查详情：输入只要 `lesson_code`。用登录用户做行条件，**不要**再加 `user_id` 入参。查询「学习成果」`课号 = Input.lesson_code`，输出四段长文本。

---

## 第三部分：会员模块

表：`会员` / `user_membership`。字段：`到期时间 expire_time`、`状态 status`、`等级 level`、`用户_id`。

「我的」会员卡片点击 → `pages/vip/index`。

| 状态 | 展示 |
| --- | --- |
| 无记录 | 未开通 · 开通后可免费学习会员课 |
| 未过期 | `{level}` · 有效期至 YYYY年M月D日 |
| 已过期 | 已过期 · 有效期至 … |

开通：会员记录由管理员写入 Zion「会员」表。微信支付未上架前，按钮只说明如何开通，不要假装拉起支付。

画布事件：卡片点击 → 打开「会员中心」页。会员中心查询 `会员`，过滤行权限（用户_id = 登录用户）。

---

## 第四部分：Tabs 与用户信息 JS

小程序已内置。画布自定义可直接用：

```js
function accountView(account) {
  const raw = account && (account.profileImageUrl || account.用户头像)
  let avatar = ''
  if (typeof raw === 'string') avatar = raw
  else if (raw && raw.url) avatar = raw.url
  return {
    name: (account && (account.username || account.用户名)) || '家庭教育讲师',
    avatar: avatar
  }
}

function onRecordTab(page, kind) {
  const tabs = page.data.tabs || []
  const current = tabs.filter(function (item) { return item.kind === kind })[0] || null
  page.setData({
    active: kind,
    current: current,
    showCopy: !!(current && current.kind === 'outline' && current.ready)
  })
}

function membershipView(row) {
  if (!row) return { active: false, label: '未开通', sub: '开通后可免费学习会员课' }
  const expire = row.expire_time || row.到期时间 || ''
  const expired = expire && Date.parse(expire) < Date.now()
  if (expired) return { active: false, label: '已过期', sub: '有效期至 ' + expire }
  return { active: true, label: row.level || '会员', sub: expire ? ('有效期至 ' + expire) : '已开通' }
}
```

详情页正文继续走 `markdown.toBlocks`，不要把长文塞进一个 `text`。
