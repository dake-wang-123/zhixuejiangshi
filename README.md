# 家庭教育讲师自学小程序

原生微信小程序，对接 Zion 项目 `PO76RBe9KX0` 的 GraphQL BaaS：选课学习、上传教案、三个解析智能体、Coze「智学」对话。

## 能力

| Tab | 做什么 |
| --- | --- |
| 课程 | 读取 `status = 已上架` 的课程，按课程分类筛选 |
| 学习 | 当前用户的 `study_record`，可回详情改进度 |
| 教案 | 上传文件到 `course.original_file`，粘贴全文后串联三个 ZAI，写回 `ai_analysis` |
| 智学 | 调用异步 Actionflow `28939557-ae3e-44e0-b6e6-b3cbec120a43`（Coze TPA `mu6ckpzl`） |
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

智学：

1. 在 [Coze](https://www.coze.cn) 复制 Bot ID，填进 `miniprogram/config.js` 的 `cozeBotId`。
2. 项目密钥 `coze_api_key` 已有值。
3. 在 Zion 把 Actionflow **异步** 的「调用 API」节点绑好：
   - `Authorization` → 密钥 `coze_api_key`（`Bearer …`）
   - `Content-Type` → `application/json`
   - `body` → Coze `POST /v3/chat` JSON（`bot_id`、`user_id`、`additional_messages`）
4. 同步后端。未绑定前，智学页会给出明确错误，不会静默失败。

## 数据约定

- 教案不是独立表，而是课程的 `original_file` + `ai_analysis`。讲师上传 `source_type = 讲师上传`，解析中为 `解析中`，解析完为 `待审核`。
- 上架课由管理员把 `status` 改为 `已上架`。
- 登录用户可插入自己的课程、学习记录、用户资料、反馈；匿名角色没有任何表权限。
- 课程分类字段在 GraphQL 里是关系对象 `category_id { id name }`，不是标量外键。

## Zion CLI（改后端时）

```bash
npx -y zion-mcp@2.7.7 login
npx -y zion-mcp@2.7.7 project set-current --projectExId PO76RBe9KX0
npx -y zion-mcp@2.7.7 schema load
```

本仓库还 vendored 了 Cursor 插件 `zion-nocode`（v2.7.7）和 `zion-aicoding-rules`。OAuth 凭证只存在本机 `~/.zion-mcp`，不要提交。

体验版上传（需 Zion 已授权微信第三方平台）：

```bash
npx -y zion-mcp@2.7.7 wechat deploy --dir ./miniprogram
```
