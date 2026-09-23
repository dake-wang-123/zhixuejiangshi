# 智学小程序 UI 重构：Zion 属性、代码与操作清单

小程序前端已按 DeepSeek / ChatGPT 的克制规范改完。下面三部分既是画布里可对照的属性，也是当前原生页的实现说明。色值与字号以 **375 宽、1px = 2rpx** 换算。

---

## 第一部分：精确属性配置清单

### 1. 全局 Token（页面 / 主题）

Zion：应用设置 → 主题 / 全局样式。小程序：`app.json` `window` + `app.wxss`。

| 属性 | 值 | 说明 |
| --- | --- | --- |
| 页面背景 | `#F9F9F9` | 浅灰白，禁止米色或纯白铺满 |
| 导航栏背景 | `#FFFFFF` | 顶栏浅色 |
| 导航栏文字 | 黑色 / `#333333` | 不要白字绿底 |
| 主文本 | `#333333` | 禁止 `#000000` |
| 辅助文本 | `#999999` | 课号、说明、时间 |
| 主色 / 发送按钮 | `#4B6EF5` | 品牌蓝 |
| 浅主色底 | `#EEF1FE` / `#F5F7FF` | 分类头、按压态 |
| 边框 | `#E5E5E5` | 输入框、分割线 |
| 卡片底 | `#FFFFFF` | |
| 危险 / 录音中 | `#D64545` | 仅状态色 |
| 页面左右边距 | `20px`（40rpx） | 不要贴边 |
| 段落间距 | `≥16px`（32rpx） | |
| 行高 | `1.6 ~ 1.8` | 正文 1.7 |

字号：

| 层级 | px | rpx | 字重 |
| --- | --- | --- | --- |
| 页面大标题 | 20 | 40 | 700 |
| 分类标题 | 18 | 36 | 700 |
| 课程 / 正文 | 16 | 32 | 700（标题）/ 400（正文） |
| 辅助说明 | 12 | 24 | 400 |

### 2. 课程目录页组件层级

```
页面
  顶部标题区（无卡片阴影）
    辅助 12px「课程目录」
    大标题 20px「选一门课开始学」
    说明 12px
  横向分类 Chip（可选）
  分组卡片 × N
    分类头：左 4px 色条 + 18px 类名 + 12px「N 门」
    课程行 × N
      课号 12px 灰
      标题 16px 粗
```

| 组件 | 属性 |
| --- | --- |
| 分组卡片 | 背景 `#FFFFFF`，圆角 10px，描边 `#EEEEEE`，下间距 16px |
| 分类头 | 背景 `#F7F8FC`，左色条 4px（`#4B6EF5` 及分组色），内边距 14px 16px |
| 课程行 | 内边距 **16px**（32rpx），顶部分割 `#F0F0F0` |
| 按压 | 背景 `#F5F7FF`，hover-stay 80ms |
| Chip 默认 | 白底、`#E5E5E5` 边、`#999` 字 |
| Chip 选中 | 底/边 `#4B6EF5`，白字 |

分组色条轮换：`#4B6EF5` `#3D8B7A` `#8B6BC7` `#C27A4A` `#4A9B6E` `#5B8DEF` `#B4536A`。只作视觉区分，不改课程数据。

### 3. 智学对话页组件层级

```
页面（灰底 #F9F9F9，column，height 100vh）
  顶栏（白底，底边 #EEEEEE）
    课号 12px 灰
    课题 20px 粗
    说明 12px 灰
    文本按钮「重新开始」
  对话滚动区（flex:1）
    空态 12px 居中
    用户消息：右对齐小气泡
    AI 消息：全宽文本块，无气泡
      「智学」12px 灰
      rich-text / Markdown
    思考占位：三点跳动 +「智学正在想这一步…」
    建议 Chip
  底部输入条（fixed）
    左「+」48px 热区
    中 输入框 min-height 48px，圆角 12px，边框 #E5E5E5
    右 发送 主色 #4B6EF5
```

| 组件 | 属性 |
| --- | --- |
| 用户气泡 | 最大宽 78%，底 `#4B6EF5`，白字，圆角 10px 10px 3px 10px，字号 16px |
| AI 文本块 | 宽 100%，无底色、无气泡，字号 16px，行高 1.7，段间距 16px |
| 输入框 | 高 ≥48px（96rpx），圆角 12px（24rpx），边 `#E5E5E5`，底 `#FFFFFF` |
| 输入条 | 白底，顶边 `#E5E5E5`，左右 20px |
| Tab 页输入条 `bottom` | `98rpx + safe-area`（贴在自定义 Tab 上方） |
| 非 Tab 页输入条 `bottom` | `safe-area` |
| Tab 栏 | 高 49px（98rpx）+ 底部安全区，白底，顶边 `#E5E5E5`，选中 `#4B6EF5` |

「+」弹出：语音输入 / 重新开始 / 再问一次。不要把一排小按钮挤在输入框下面。

---

## 第二部分：复杂交互代码

已写进小程序，可直接对照。

### 1. 固定底部输入框

智学是 Tab 页，输入条必须垫在 Tab 上面，否则会被挡住。

```css
.study-page.tabbed {
  padding-bottom: calc(228rpx + 98rpx + env(safe-area-inset-bottom));
}
.composer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 80;
  padding: 16rpx 40rpx calc(16rpx + env(safe-area-inset-bottom));
  background: #FFFFFF;
  border-top: 1rpx solid #E5E5E5;
}
.study-page.tabbed .composer {
  bottom: calc(98rpx + env(safe-area-inset-bottom));
  padding-bottom: 16rpx;
}
.draft {
  min-height: 96rpx; /* 48px */
  border: 1rpx solid #E5E5E5;
  border-radius: 24rpx; /* 12px */
}
```

Zion 画布等价：底栏用「固定底部」容器，上内边距 8px，左右 20px；其内横排：图标按钮 + 多行输入 + 主色按钮。页面主体设底部留白 ≥ 输入条高度 + Tab 高度。

### 2. 发送后滚到最新

`classroom.js` 的 `scrollBottom` + `scroll-view` 的 `scroll-into-view`：

```js
function scrollBottom(page) {
  const thread = page.data.thread || []
  const last = thread[thread.length - 1]
  page.setData({ scrollInto: last ? 'm-' + last.id : 'thread-end' })
}
```

```xml
<scroll-view scroll-y class="thread" scroll-into-view="{{scrollInto}}" scroll-with-animation>
  ...
  <view id="thread-end"></view>
</scroll-view>
```

每条消息根节点 `id="m-{{item.id}}"`。打字机每帧也会把 `scrollInto` 设成当前 AI 气泡。

Zion 画布等价：列表开启「滚动到最新」；发送成功回调里把列表滚动位置设为最后一项。不要用页面级 `scroll-top=9999` 硬跳。

### 3. Markdown（AI 长文）

`miniprogram/utils/markdown.js` 把正文编成 `rich-text` nodes：`#` 标题、`**粗体**`、`` `代码` ``、列表、引用。用户气泡仍是纯文本。

Zion 画布：AI 单元格用「富文本」绑定 `内容`；若平台富文本偏弱，用 Run Code 先转 HTML 再绑定。

### 4. 思考态

不要转圈菊花。三点跳动 +「智学正在想这一步…」，超过 3 秒补一行等待秒数。打字机光标 `▍` 表示仍在出字。

---

## 第三部分：Zion 操作执行清单

按这个顺序在编辑器里搭（小程序侧已经做完，画布复刻时照做）。

1. **主题**  
   设置 → 主题：背景 `#F9F9F9`，主色 `#4B6EF5`，主文本 `#333333`，次文本 `#999999`，圆角 12px，页面左右 20px。

2. **导航与 Tab**  
   顶栏改白底黑字。底部 Tab 改成贴底通栏（不要悬浮胶囊）：高 49px，顶部分割 `#E5E5E5`，选中色 `#4B6EF5`。

3. **课程目录页**  
   删掉拥挤的纯列表。先放标题区（20 / 12px）。再放横向 Chip。每个类别一个「分组」容器：头 18px + 左色条；里面循环课程行（课号 12px 灰在上，标题 16px 粗在下，padding 16px，按压变 `#F5F7FF`）。点行：写入待学课号/标题，跳转智学。

4. **智学页结构**  
   上：固定顶栏（课题 20px）。中：列表，数据源仍是学习记录 / 页面 `thread`。下：固定输入条。AI 单元格不要气泡；用户单元格右对齐气泡。

5. **列表绑定**  
   过滤：课号 = 当前课号。排序：创建时间升序。AI 行绑定 `内容` 到富文本；用户行绑定到气泡文本。

6. **输入条**  
   左「+」动作表：语音、重新开始。中：多行输入，高 ≥48px，边框 `#E5E5E5`。右：发送，背景 `#4B6EF5`。发送中禁用。

7. **发送动作**  
   成功：追加用户气泡 → 显示思考占位 → 调用智学行为流 → 用返回原文替换占位 → `scroll-into-view` 到最后一项。不要转菊花。

8. **空 / 加载 / 错**  
   空：一句 12px 灰说明。加载：思考占位，不是转圈。错：顶栏下 12px 红字 +「再问一次」。

9. **同步与真机**  
   改完主题和页面后同步后端（若动了行为）。微信开发者工具重新导入 `family-edu-miniprogram/`，看目录分组和智学输入条是否贴底、发送后是否停在最新一句。

不要做：纯黑字、贴边列表、AI 再套一层厚气泡、输入框高度 32px、发送旁再挤三个小按钮、用转圈代替思考态。
