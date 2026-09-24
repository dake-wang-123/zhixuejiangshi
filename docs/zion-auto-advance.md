# 十步交付法：1–10 关自动推进

讲师过关后，不要再等他打「好的」。用 **一条动态正则** 抽出下一关号，更新进度条，并自动请求下一关。不要写「完成第一关 / 第二关…」十个静态判断。

**不要**给「智学对话」行为流加 `current_step` / `next_step` 入参。步号写进 `user_message` 文本和页面变量。

---

## 第一部分：页面变量与进度条绑定

| 页面变量 | 类型 | 绑定 |
| --- | --- | --- |
| `current_step` | 数字 1–12 | 当前关。1–10 交付法，11 实战，12 说课 |
| `completedSteps` | 数字数组 | 已打勾的关号 |
| `steps` | 数组 | 进度条。`status`：`done` / `current` / `todo` |
| `sending` / `_busy` | 布尔 | 请求锁。为 true 时禁止再发自动请求 |
| `finished` | 布尔 | 10 关都打勾后为 true，停止自动请求 |

进度条：

- `item.n < current_step` → 打勾 `done`
- `item.n == current_step` 且 ≤10 → 高亮 `current`
- 其余 `todo`

画布：横向列表绑 `steps`。条件样式按 `status`。点击已打卡仍走回看 / 重学，不要改。

原生已写在 `extractNextStep` + `maybeAutoAdvance`。过关后自动发：

```
请开始第{{current_step}}步的内容
```

`command=auto_next`。这一轮 **不再** 连锁自动请求，等讲师真正作答后再抽下一关。

`current_step == 10` 且抽出 `[下一关: 11]` 或 `【十步完成】`：通关，解锁检验，**停止**自动请求。

---

## 第二部分：行为流里怎么动态抽数字

打开 **行为流 → 智学对话** 之后的 **Run Code**（不要改入参列表）。对 `reply_content` 跑下面这段。画布没有独立「正则节点」时，用这一段即可。

```js
function parseGateNum(raw) {
  const token = String(raw || '').trim()
  const cn = { 一:1, 二:2, 两:2, 三:3, 四:4, 五:5, 六:6, 七:7, 八:8, 九:9, 十:10 }
  if (/^\d{1,2}$/.test(token)) return Math.max(1, Math.min(12, Number(token)))
  return cn[token] || 0
}

function extractNextStep(text, currentStep) {
  const src = String(text || '')
  const current = Number(currentStep) || 1
  let nextStep = 0
  let completedStep = 0

  const marker = src.match(/\[\s*下一关\s*[:：]\s*(\d{1,2}|[一二三四五六七八九十两])\s*\]/)
  if (marker) nextStep = parseGateNum(marker[1])

  if (!nextStep) {
    const enter = src.match(/进入第\s*(\d{1,2}|[一二三四五六七八九十两])\s*[关步]/)
    const done = src.match(/(?:恭喜.{0,12})?完成第\s*(\d{1,2}|[一二三四五六七八九十两])\s*[关步]/)
    if (enter) nextStep = parseGateNum(enter[1])
    else if (done) nextStep = Math.min(11, parseGateNum(done[1]) + 1)
    if (done) completedStep = parseGateNum(done[1])
  }

  if (!nextStep && /完成这一关|进入下一关|开始下一关/.test(src)) {
    nextStep = Math.min(10, current + 1)
    completedStep = current
  }

  if (nextStep >= 2 && !completedStep) completedStep = nextStep - 1
  return { nextStep: nextStep, completedStep: completedStep }
}
```

画布步骤：

1. 行为流返回 `reply_content` 后接 Run Code，入参只要现有四个，**不要**加关卡号。
2. Run Code 调用 `extractNextStep(reply, 页面变量 current_step)`。
3. 若 `nextStep` 为 1–10：页面变量 `current_step = nextStep`；把 `1 … nextStep-1` 写入已打卡；刷新进度条。
4. 若本轮不是 `auto_next`，且 `sending==false`：再请求智学对话，`user_message = "请开始第" + nextStep + "步的内容"`。
5. 若 `nextStep >= 11` 或文案含 `【十步完成】`：`finished=true`，不要再请求。
6. 请求前判断 `sending`。上一条没结束，禁止发下一条。

禁止：`if (text.indexOf('完成第一关')>=0)` 这种写十遍。

---

## 第三部分：扣子提示词（整段粘贴）

贴在智能体「人设与回复逻辑」**最后**。不要删原来的十步说明。

```
【关卡暗号｜必须遵守】
你带讲师走十步交付法，关号 1–10 固定，不能改顺序，不能一轮讲完。

每一关结束、确认讲师过关之后，必须在回复最后单独一行写暗号（数字用阿拉伯数字）：
[下一关: X]

规则：
- 第 1 关过关写 [下一关: 2]
- 第 2 关过关写 [下一关: 3]
- 依此类推，第 9 关过关写 [下一关: 10]
- 第 10 关过关写 [下一关: 11] 并写【十步完成】
- 不要写「完成第一关」「完成第二关」这种十套不同的句子当唯一信号，暗号优先
- 讲师还没回答本关「下一步提问」时，禁止写 [下一关]
- 收到「请开始第N步的内容」或 command=auto_next：只讲第 N 步并提问，这一轮不要写 [下一关]
- 禁止复读【进度上下文】，禁止向讲师解释暗号含义
```
