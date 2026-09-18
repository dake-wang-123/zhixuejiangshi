# 家庭教育讲师自学小程序

原生微信小程序，对接 Zion 项目 `PO76RBe9KX0` 的 GraphQL BaaS：选课学习、上传教案、三个解析智能体、Coze「智学」对话。

这不是 Web 应用，不能用 Vercel 发布。用微信开发者工具导入 `miniprogram/`，或在 Zion 已授权微信第三方平台后执行 `wechat deploy` 上传体验版。

## 能力

| Tab | 做什么 |
| --- | --- |
| 课程 | 读取「已上架或本人上传」的课程，按课程分类筛选 |
| 学习 | 当前用户的 `study_record`，可回详情改进度 |
| 教案 | 上传文件到 `course.original_file`，粘贴全文后串联三个 ZAI，写回 `ai_analysis` |
| 智学 | 异步 Actionflow **智学对话** `8e640419-2243-41b5-92c4-0dd349b97f2d`：POST Coze `/v3/chat`，再轮询 **智学消息** TPA |
| 我的 | 微信静默登录、从业年限、会员、意见反馈 |

## 本地运行

1. 安装[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)。
2. 导入目录 `miniprogram/`。
3. 把 `project.config.json` 里的 `appid` 换成你的小程序 AppID。
4. 在 Zion 编辑器打开项目 `PO76RBe9KX0`：
   - **登录设置 → 微信**：填写同一套 AppID / AppSecret，否则 `loginWithWechatMiniApp` 会报 `wechat id config does not exist`。
   - 请求合法域名加入 `https://zion-app.functorz.com` 以及上传用的 OSS 域名。
5. 编译预览。静默登录走 `wx.login` → GraphQL `loginWithWechatMiniApp`。

后端地址写在 `miniprogram/config.js`：

```
https://zion-app.functorz.com/zero/PO76RBe9KX0/api/graphql-v2
```

## 智能体与智学

已对接的 ZAI（opaque `argKey` 不要改名）：

| 智能体 | id | 入参 |
| --- | --- | --- |
| 解析-结构提取 | `p9abeup2h` | `wjvxpuy4l` 教案全文 |
| 解析-摘要生成 | `v6rkmlglx` | `v0r1oesut` 全文，`r7yyldw1r` 章节 JSON |
| 解析-标签推荐 | `tbuerjgxe` | `n4y0hkaaz` 全文，`hnfa3ujhc` 摘要 JSON |

教案解析会消耗 Zion AI 积分。积分为 0 时，小程序会提示 `INSUFFICIENT_AI_TOKEN`，请到 Zion 控制台充值后再试。

智学：

1. Coze Bot ID 已写入 `miniprogram/config.js` 的 `cozeBotId`（`7683760370368380964`）。
2. 项目密钥 `coze_api_key`（`mu6ctbb0`）已有值，只在服务端 TPA / Run Code 里使用。
3. Actionflow **智学对话**（异步，超时 120 秒）：
   - 入参：`user_message` / `user_id` / `conversation_id` / `bot_id`
   - 节点：组装请求体 → TPA **智学** `mu6ckpzl`（`POST https://api.coze.cn/v3/chat`）→ Run Code **轮询智学回复**（TPA **智学消息** `r43leo7de`，`GET /v3/chat/message/list`）
   - 输出：`reply_content`（助手文本）、`conversation_id`、`raw`（chat id）
4. 改完后必须 **同步后端**。未同步时智学会报 `ACTION_FLOW_NOT_FOUND`。

## 数据约定

- 教案不是独立表，而是课程的 `original_file` + `ai_analysis`。讲师上传 `source_type = 讲师上传`，解析中为 `解析中`，解析完为 `待审核`。
- 上架课由管理员把 `status` 改为 `已上架`。登录用户可读「已上架 **或** 自己上传」的课程。
- 登录用户可插入自己的课程、学习记录、用户资料、反馈；匿名角色没有任何表权限。
- 课程分类字段在 GraphQL 里是关系对象 `category_id { id name }`，不是标量外键。
- 资料 upsert 约束名：`user_profile_user_id_key`。反馈外键写入 `user_id_id`。

## 已知缺口（需在 Zion 编辑器处理）

- 微信登录组件尚未填写小程序 AppID / AppSecret，静默登录不可用。
- 编辑器里仍有两个历史错误：**微信组件** `mu3flt0p` 缺少 API 定义；Actionflow **PPT生成** 的 TPA 未配置。不影响本仓库原生小程序，但会一直出现在 `schema validate` 里。
- 课程表里可能留有早期调试行（例如标题为 `1` 的已上架课、空的学习记录）。可在数据表里自行删除。

## Zion CLI（改后端时）

```bash
npx -y zion-mcp@2.7.7 login
npx -y zion-mcp@2.7.7 project set-current --projectExId PO76RBe9KX0
npx -y zion-mcp@2.7.7 schema load
npx -y zion-mcp@2.7.7 schema validate
npx -y zion-mcp@2.7.7 project sync-backend
```

本仓库还 vendored 了 Cursor 插件 `zion-nocode`（v2.7.7）和 `zion-aicoding-rules`。OAuth 凭证只存在本机 `~/.zion-mcp`，不要提交。

体验版上传（需 Zion 已授权微信第三方平台）：

```bash
npx -y zion-mcp@2.7.7 wechat deploy --dir ./miniprogram
```
