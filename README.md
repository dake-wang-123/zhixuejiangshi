# 家庭教育讲师自学小程序

原生微信小程序，对接 Zion 项目 `PO76RBe9KX0`（家庭教育讲师智学伴练）的 GraphQL BaaS：选课学习、上传教案、三个解析智能体、Coze「智学」对话。

这不是 Web 应用，不能用 Vercel 发布。用微信开发者工具导入 `miniprogram/`。体验版上传需要 Zion 已授权微信第三方平台。

## 能力

| Tab | 做什么 |
| --- | --- |
| 课程 | 读取已上架课程，按课程分类筛选 |
| 学习 | 当前用户的 `study_record`，可回详情改进度 |
| 教案 | 上传文件到 `course.original_file`，粘贴全文后串联三个 ZAI，写回 `ai_analysis` |
| 智学 | 异步 Actionflow **智学对话** `8e640419-2243-41b5-92c4-0dd349b97f2d`：POST Coze `/v3/chat`，再轮询 **智学消息** TPA |
| 我的 | 微信静默登录、从业年限、会员、意见反馈 |

## 本地运行

1. 安装[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)。
2. 导入目录 `miniprogram/`。`project.config.json` 里的 AppID 已写成 `wx0277d4abe92dd8a3`，与 Zion 登录设置一致。
3. 在微信公众平台把 `https://zion-app.functorz.com` 以及上传用的 OSS 域名加入 request 合法域名。
4. 编译预览。静默登录走 `wx.login` → GraphQL `loginWithWechatMiniApp`。

后端地址写在 `miniprogram/config.js`：

```
https://zion-app.functorz.com/zero/PO76RBe9KX0/api/graphql-v2
```

## 智能体与智学

已对接的 ZAI（opaque `argKey` 不要改名）：

| 智能体 | id | 入参 | 最近一次运行时结果 |
| --- | --- | --- | --- |
| 解析-结构提取 | `p9abeup2h` | `wjvxpuy4l` 教案全文 | 会话 `3` COMPLETED，输出《亲子沟通》章节 |
| 解析-摘要生成 | `v6rkmlglx` | `v0r1oesut` 全文，`r7yyldw1r` 章节 JSON | 会话 `4` COMPLETED |
| 解析-标签推荐 | `tbuerjgxe` | `n4y0hkaaz` 全文，`hnfa3ujhc` 摘要 JSON | 会话 `5` COMPLETED，标签与课题推荐 |

教案解析会消耗 Zion AI 积分。当前项目 `APP_AI_TOKEN` 为 **SUFFICIENT**。积分为 0 时，小程序会提示积分不足。

智学：

1. Coze Bot ID 写在 `miniprogram/config.js` 的 `cozeBotId`。组装节点用字符串发送，避免 19 位 ID 被 JSON 数字四舍五入。
2. 项目密钥 `coze_api_key`（`mu6ctbb0`）只在服务端 TPA / Run Code 里使用。请到 Zion 编辑器 → 项目密钥，把值换成 [Coze 个人访问令牌](https://www.coze.cn/open/oauth/pats)：
   - 只填令牌本身，不要加 `Bearer `
   - 令牌需要能调用该 Bot
   - 保存后必须 **同步后端**
   - 不要把令牌发到聊天里
3. Actionflow **智学对话**（异步，超时 120 秒）已同步到运行时 `AVdAjzRlj6L`：
   - 入参：`user_message` / `user_id` / `conversation_id` / `bot_id`
   - 节点：组装请求体 → TPA **智学** `mu6ckpzl` → Run Code **轮询智学回复**（TPA **智学消息** `r43leo7de`）
   - 输出：`reply_content`、`conversation_id`、`raw`（chat id）
4. 密钥无效时，流程会把说明写进 `reply_content`。同步后端后再次调用仍是 Coze `4101`，说明运行时读到的密钥仍不被 Coze 接受。

## 数据约定

- 教案不是独立表，而是课程的 `original_file` + `ai_analysis`。讲师上传 `source_type = 讲师上传`，解析中为 `解析中`，解析完为 `待审核`。
- 上架课由管理员把 `status` 改为 `已上架`。登录用户可读「已上架 **或** 自己上传」的课程；课程 Tab 客户端再筛一层已上架。
- 登录用户可插入自己的课程、学习记录、用户资料、反馈；匿名角色没有任何表权限，也不能调用 Actionflow / TPA / ZAI。
- 课程分类字段在 GraphQL 里是关系对象 `category_id { id name }`，不是标量外键。
- 资料 upsert 约束名：`user_profile_user_id_key`。反馈外键写入 `user_id_id`。

## 已核对的环节

| 环节 | 结果 |
| --- | --- |
| GraphQL 课程 / 分类 | 通。`where` 必须用 operator-first 变量，分类有 6 条。已写入示例课 **亲子沟通：倾听与表达**（`course.id = 5`，6-12岁，已上架，含完整 `ai_analysis`）。 |
| 微信登录 | AppID / AppSecret 已填。用假 code 会得到 `invalid code` / `FAILED_TO_GET_MINI_APP_SESSION_KEY`，说明已经打到微信。真机需微信开发者工具里的 `wx.login`。 |
| 权限 | 登录用户：课程/学习记录/资料/反馈有行列条件；匿名无表权限，且已关掉 Actionflow / TPA / ZAI 的 allowAll。CLI 只能以管理员跑查询，不能代替登录用户验收。 |
| 上传 | `filePresignedUrl` 能拿到 fileId 和 PUT 地址。小程序用 MD5 + 预签名 PUT。 |
| ZAI 解析 | 三个智能体均 COMPLETED。课程详情会展示摘要、章节、标签、推荐课题和专业方向。 |
| 智学 | 流程已上线（`AVdAjzRlj6L`）。Coze 仍返回 4101（密钥无效），小程序会显示更换 `coze_api_key` 的说明。 |
| 资料 | `user_profile` 可查。upsert 走 `user_profile_user_id_key`。 |
| 体验版 | `wechat deploy --dryRun` 应无异常跳过。实际上传需要 Zion 完成微信第三方平台授权（当前 `hasGrantedThirdPartyAuthorization: false`）。 |

## 已知缺口（需在 Zion 编辑器处理）

- 编辑器微信端「学习」页按钮 `mu3flt0p`（生成PPT）仍指向已删除的 TPA，组件工具只能改 WEB 客户端，所以常规 `project sync-backend` 会被它拦住。后端同步使用了允许校验错误。不影响本仓库原生小程序。若要清掉错误：在编辑器切到微信客户端，删掉该按钮的 API 调用。
- 课程表里仍有早期调试行（标题为 `1` 的已上架课、空的学习记录）。可在数据表里自行删除。示例课是 `id = 5`。
- 验证留下了未实际上传的文件资源、ZAI 会话 `2`–`5`、智学任务 `1150000000000001`–`1150000000000006`，可删。

## Zion CLI（改后端时）

```bash
npx -y zion-mcp@2.7.7 login
npx -y zion-mcp@2.7.7 project set-current --projectExId PO76RBe9KX0
npx -y zion-mcp@2.7.7 schema load
npx -y zion-mcp@2.7.7 schema validate
npx -y zion-mcp@2.7.7 project sync-backend --allowValidationErrors
```

本仓库还 vendored 了 Cursor 插件 `zion-nocode`（v2.7.7）和 `zion-aicoding-rules`。OAuth 凭证只存在本机 `~/.zion-mcp`，不要提交。

体验版上传（需 Zion 已授权微信第三方平台）：

```bash
npx -y zion-mcp@2.7.7 wechat deploy --dir ./miniprogram
```
