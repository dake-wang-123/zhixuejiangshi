# 家庭教育讲师自学小程序

原生微信小程序，对接 Zion 项目 `PO76RBe9KX0`（家庭教育讲师智学伴练）的 GraphQL BaaS：选课学习、上传教案、三个解析智能体、Coze「智学」对话、课件 PPT 生成。

这不是 Web 应用，不能用 Vercel 发布。用微信开发者工具导入 `miniprogram/`。体验版上传需要 Zion 已授权微信第三方平台。

## 能力

| Tab | 做什么 |
| --- | --- |
| 课程 | 读取 Zion「课程目录」60 课，按类别排序分组展示。点课把课号和课程标题带进智学 |
| 教案 | 上传文件到 `course.original_file`，粘贴全文后串联三个 ZAI，写回 `ai_analysis`；可把讲课稿生成课件 |
| 智学 | 智学原文问答。未选课先给引导语，也可在本页输入课题原题；选了课把原题发给智学。每条 Coze 消息随到随画 |
| 课件 | 独立页 `pages/ppt/index`：智学写 PPT 大纲 → 智谱 GLM PPT Agent 出片 → 写入 `ppt_record.file_url`，页面提供打开/复制下载 |
| 我的 | 启动即管理员测试登录，可直接上传课程归档；也可维护讲师资料、会员、意见反馈 |

## 本地运行

1. 安装[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)。
2. 下载 `zhixue-wechat.zip` 后先解压，导入里面的 `family-edu-miniprogram/`（能直接看到 `app.json` 和 `pages/`）。不要把 zip 当项目打开，也不要选解压后的外层目录。开发者工具 2.02 找不到 `app.json` 就是选错了层。
3. 导入整个仓库时，选仓库根目录即可：根目录 `project.config.json` 已写 `miniprogramRoot: miniprogram/`。只打开 `miniprogram/` 也可以，该层不再写 `miniprogramRoot: ./`，避免 2.02 找不到 `app.json`。
4. `project.config.json` 里的 AppID 已写成 `wx0277d4abe92dd8a3`，与 Zion 登录设置一致。
5. 在微信公众平台把 `https://zion-app.functorz.com` 以及上传用的 OSS 域名加入 request 合法域名。
6. 编译预览。静默登录走 `wx.login` → GraphQL `loginWithWechatMiniApp`。

重新打包（`app.json` 放在 zip 根目录，避免 Windows 解出双层目录）：

```bash
bash scripts/pack-wechat.sh
```

上传体验版时，代码质量「启用组件按需注入」必须通过：`app.json` 已写 `"lazyCodeLoading": "requiredComponents"`（基础库 ≥ 2.11.1，当前 `2.32.3`）。`ui-icon` 只写在用到它的页面 json 里，不要写进 `app.json` 的全局 `usingComponents`。`sitemap.json` 必须带 `rules`（当前允许全部页面被索引），缺这个字段上传会报 `-80055 Invalid SiteMap`。重新导入本仓库或最新 zip 后再点上传。

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
2. 项目密钥 `coze_api_key`（`mu6ctbb0`）只在服务端使用。请到 [Coze 个人访问令牌](https://www.coze.cn/open/oauth/pats) 新建 PAT：
   - 令牌一般以 `pat_` 开头
   - 勾选 **对话 / Chat** 权限
   - 授权工作空间必须包含当前 Bot
   - 只把令牌填进 Zion 项目密钥，不要加 `Bearer `，不要发到聊天里
   - 保存后 **同步后端**
3. Actionflow **智学对话**（同步）只做密钥转发：先 POST 智学原文，再按需 GET 消息列表。不拼接、不等待完整答案。
   - 入参：`user_message` / `user_id` / `conversation_id` / `bot_id`
   - 输出：`reply_content`（Coze 消息 JSON）、`conversation_id`、`raw`（chat id）
   - 小程序发出后立刻取消息，Coze 每写出一条就上屏，包括它自己的每一步问答。没有本地环节条，也没有「学习」页。
4. Coze `4100` 是令牌本身无效；`4101` 是令牌没有访问该 Bot / 接口的权限。Bot 未发布到 **Agent As API** 时，流程会提示去 coze.cn 发布。
5. 最近一次运行时：任务 `1150000000000012` COMPLETED，返回亲子倾听要点正文（已过滤 verbose 调试 JSON）。

## 课件 PPT

入口：教案页「用当前全文生成课件」、教案卡片「生成课件」、课程详情「生成课件 PPT」、我的「生成 / 查看全部课件」。

服务端异步 Actionflow **PPT生成** `c46e09e4-fd97-4027-b27b-87d6cd5b8a63`（超时 180 秒）：

1. 输入节点接收 `lecture_content` / `title` / `course_id` / `user_id` / `bot_id`。
2. Run Code 先往 `ppt_record` 插入一条 `生成中` 记录，再调用智学 TPA `mu6ckpzl` 生成 Markdown 大纲（`# 标题 / ## 章节 / ### 页面 / - 要点`）。
3. 轮询智学消息 TPA `r43leo7de` 拿到大纲正文。
4. 把大纲发给智谱 GLM PPT Agent：TPA **PPT生成** `yv04e96e8` → `POST https://open.bigmodel.cn/api/v1/agents`（`agent_id=slides_glm_agent`）。
5. TPA **PPT导出** `hgf937snh` → `POST https://open.bigmodel.cn/api/v1/agents/conversation/`，取 `file_url`。
6. 把 `file_url`、大纲、状态写回 `ppt_record`，流程输出同样字段给小程序展示下载入口。

项目密钥：

- `coze_api_key`：智学 PAT（与智学对话共用）
- `ppt-api-key`：智谱 API Key。不要把 Key 发到聊天里；只填进 Zion 密钥后同步后端

下载：小程序会复制文件链接，并尝试 `wx.downloadFile` + `wx.openDocument`。请把智谱返回的文件域名加入微信「downloadFile 合法域名」。登录用户只能看自己的 `ppt_record`（`创建人_id` = 当前用户）。

## 数据约定

- 首页课程目录读 Zion 表 `course_catalog`（显示名「课程目录」）：类别、类别排序、课号（唯一）、序号、课程标题。当前录入 60 课，7 类顺序 1–7，每类 6 / 12 / 12 / 6 / 6 / 6 / 12。登录用户可 SELECT；匿名无权限；管理员可维护。点课把课号和课程标题写入本地后跳转智学，智学把课程标题发给 Coze。
- 教案不是独立表，而是课程的 `original_file` + `ai_analysis`。讲师上传 `source_type = 讲师上传`，解析中为 `解析中`，解析完为 `待审核`。
- 上架课由管理员把 `status` 改为 `已上架`。登录用户可读「已上架 **或** 自己上传」的课程；课程 Tab 客户端再筛一层已上架。
- 再次通跑智学：未选课发「你好」，智能体引导输入课题或上传教案，再走它自己的问答。知识库目前列不出 60 课清单。管理员在「我的 → 课程归档上传」上传 TXT/MD/JSON 目录或「分类-课题」文件名：先抽出标题分类，再按智学内置目录宽松对齐原题（如「听懂婴语」对齐「听懂“婴语”：读懂宝宝的哭声与信号」）。对上的用智能体原题归档；对不上的仍入库，点课把抽出的标题发给智学。Word/PDF 读不到正文，请靠文件名或粘贴目录。
- 智学页只呈现 Coze 自己的问答，每条消息随到随画。用户回答原样回传。输入框旁点麦克风说话，再点一次转成文字。语音识别用微信「同声传译」插件（`wx069ba97219f66d99`）：微信公众平台 → 设置 → 第三方设置 → 添加插件，搜索「同声传译」。用户隐私保护指引需声明麦克风。未添加插件时小程序会提示插件未开通。
- 测试时小程序启动即用管理员账号 `zhixue-admin` 登录（`config.devAdmin`），「我的」里直接有课程归档上传。关掉 `devAdmin.enabled` 后仍走微信静默登录。
- 登录用户可插入自己的课程、学习记录、用户资料、反馈；匿名角色没有任何表权限，也不能调用 Actionflow / TPA / ZAI。
- 课程分类字段在 GraphQL 里是关系对象 `category_id { id name }`，不是标量外键。
- 资料 upsert 约束名：`user_profile_user_id_key`。反馈外键写入 `user_id_id`。

## 已核对的环节

| 环节 | 结果 |
| --- | --- |
| GraphQL 课程目录 | 通。表 `course_catalog` 60 条，7 类齐全，数量 6/12/12/6/6/6/12。首页按类别排序分组，点课带课号和标题进智学。 |
| 微信登录 | AppID / AppSecret 已填。用假 code 会得到 `invalid code` / `FAILED_TO_GET_MINI_APP_SESSION_KEY`，说明已经打到微信。真机需微信开发者工具里的 `wx.login`。 |
| 权限 | 登录用户：课程/学习记录/资料/反馈有行列条件；匿名无表权限，且已关掉 Actionflow / TPA / ZAI 的 allowAll。CLI 只能以管理员跑查询，不能代替登录用户验收。 |
| 上传 | `filePresignedUrl` 能拿到 fileId 和 PUT 地址。小程序用 MD5 + 预签名 PUT。 |
| ZAI 解析 | 三个智能体均 COMPLETED。课程详情会展示摘要、章节、标签、推荐课题和专业方向。 |
| 智学 | 已接通。`bot_id` 以字符串发送，Coze 返回会话与助手正文。任务 `1150000000000012` 回复：「亲子倾听的核心要点是放下评判与说教欲…」 |
| PPT 生成 | 链路已通。任务 `1150000000000015` COMPLETED：智学写出完整 Markdown 大纲并写入 `ppt_record` id `3`。智谱 GLM PPT Agent 返回账户余额不足，故 `file_url` 仍为空。给 `ppt-api-key` 对应智谱账号充值后即可出片并展示下载。 |
| 资料 | `user_profile` 可查。upsert 走 `user_profile_user_id_key`。 |
| 体验版 | `wechat deploy --dryRun` 应无异常跳过。实际上传需要 Zion 完成微信第三方平台授权（当前 `hasGrantedThirdPartyAuthorization: false`）。 |

## 已知缺口（需在 Zion 编辑器处理）

- 编辑器微信端原先「生成PPT」按钮指向已删除 TPA 的校验错误已清除，`schema validate` 目前无稳定错误。
- 空的学习记录、未实际上传的文件资源、ZAI 会话与历史智学/PPT 任务可删。示例教案课是 `id = 5`。
- 验证留下了未实际上传的文件资源、ZAI 会话 `2`–`5`、智学任务 `1150000000000001`–`1150000000000015`、PPT 记录 `1`–`3`，可删。
- 智谱 `ppt-api-key` 当前余额不足，充值后重新点「生成课件」才会写入 `file_url`。请把智谱文件域名加入微信 downloadFile 合法域名。

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
