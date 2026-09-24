# 家庭教育讲师自学小程序

原生微信小程序，对接 Zion 项目 `PO76RBe9KX0`（家庭教育讲师智学伴练）的 GraphQL BaaS：选课学习、目录顶栏上传个人教案、三个解析智能体、Coze「智学」对话、课件 PPT 生成。界面按 DeepSeek / ChatGPT 的克制规范排：灰白底、分组目录、宽屏 AI 文本、底部大输入框。色值与画布步骤见 `docs/zion-ui-rebuild.md`。

这不是 Web 应用，不能用 Vercel 发布。用微信开发者工具导入 `miniprogram/`。体验版上传需要 Zion 已授权微信第三方平台。

## 能力

| Tab | 做什么 |
| --- | --- |
| 课程 | 读取 Zion「课程目录」60 课；分类上方可折叠「上传个人教案」，粘贴正文后进入智学十步交付法 |
| 智学 | 智学原文问答。系统课带课号进知识库；个人教案把全文放进 `user_message`，不新增行为流入参 |
| 课件 | 独立页 `pages/ppt/index`：智学写 PPT 大纲 → 智谱 GLM PPT Agent 出片 → 写入 `ppt_record.file_url`，页面提供打开/复制下载 |
| 我的 | 微信头像昵称、会员卡片、**学习记录**（按课看进度和成果）、收藏、帮助与关于 |

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
3. Actionflow **智学对话**（同步，超时 60 秒）转发密钥并保持 Coze 会话：
   - 入参只允许这四个：`user_message` / `user_id` / `conversation_id` / `bot_id`。不要传 `lesson_code`，否则会报 `UnknownValueException`
   - 输出：`reply_content`（`{items,status}` JSON）、`conversation_id`、`raw`（chat id）
   - POST `https://api.coze.cn/v3/chat?conversation_id=...`：`conversation_id` 必须是 **Query**，body 里放了也会被 Coze 丢掉
   - Body：`stream: false`，`auto_save_history: true`，`additional_messages: [{role,content,content_type}]`
   - 轮询 GET `/v3/chat/retrieve`（`y88cn638j`）等到 `completed`，再 GET `/v3/chat/message/list`，**按 chat_id 过滤**，只展示本轮 `type=answer`
   - 本轮 `completed` 后把用户提问和 AI 回复写入数据表「智学对话记录」`learn_message`（幂等键去重）。进智学页按登录用户 + 课号回读，不再因为本地缓存空了就重开一轮
   - 已有 Coze `conversation_id` 时 `additional_messages` 只带本轮用户句；会话 ID 丢了才把最近 16 条历史打包进去。不要把 `用户ID+课程ID` 直接当 conversation_id 发给 Coze
   - 前端每 0.8 秒轮询 retrieve；正文到了用打字机逐段上屏，发送中显示思考气泡
   - Zion 的 TPA **不能**把 `stream` 设为 true（SSE）。缩短等待必须靠扣子端分段输出，提示词见 `docs/zion-coze-stream.md`
   - 表字段、行为流节点、列表绑定见 `docs/zion-learn-history.md`
   - `lesson_code` 报错与微信输入条见 `docs/zion-chat-composer.md`
   - 教案阅读排版与扣子强制 Markdown 提示词见 `docs/zion-readable-lesson.md`
   - 10 步进度条、回溯与两段检验见 `docs/zion-ten-steps.md`
   - 学习成果表、我的列表 / 详情、检验完成后写入见 `docs/zion-learn-results.md`
   - 去掉教案 Tab、目录顶栏个人教案见 `docs/zion-personal-plan.md`
   - 「我的」页、学习记录两层结构、会员卡片见 `docs/zion-mine-rebuild.md`
   - 智学未选课引导语、去掉顶栏「重新开始」见 `docs/zion-agent-empty.md`
   - 目录页 60 堂课主干、个人教案降级见 `docs/zion-catalog-hierarchy.md`
   - 智学去掉标题输入、「我的」去掉归档、引导语统一蓝色见 `docs/zion-ui-subtract.md`
   - 选课 / 学习页引导文案见 `docs/zion-guide-copy.md`
   - 课程首页去掉重复「60 堂系统课」见 `docs/zion-catalog-eyebrow.md`
   - 十步进度条只跟扣子标记走，不再自动发「请开始第 X 步」，见 `docs/zion-auto-advance.md`
   - 串台 / 脱轨：课号、会话、原文隔离见 `docs/zion-isolation.md`
   - 第10步后确认再进检验见 `docs/zion-inspect-confirm.md`
4. Coze `4100` 是令牌本身无效；`4101` 是令牌没有访问该 Bot / 接口的权限。Bot 未发布到 **Agent As API** 时，流程会提示去 coze.cn 发布。

## 课件 PPT

入口：课程详情「生成课件 PPT」、智学说课完成后「用说课稿生成 PPT」。

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
- 再次通跑智学：未选课发「你好」，智能体引导从课程目录选课或上传教案，再走它自己的问答。知识库目前列不出 60 课清单。管理员在「关于我们」解锁后上传 TXT/MD/JSON 目录或「分类-课题」文件名：先抽出标题分类，再按智学内置目录宽松对齐原题（如「听懂婴语」对齐「听懂“婴语”：读懂宝宝的哭声与信号」）。对上的用智能体原题归档；对不上的仍入库，点课把抽出的标题发给智学。Word/PDF 读不到正文，请靠文件名或粘贴目录。
- 智学页只呈现 Coze 自己的问答。`conversation_id` 与 `lesson_code` 一对一绑定，换课必须新建或取回该课自己的会话，禁止把 A 课历史带进 B 课。同一课反复进入会带上该课上次的 `conversation_id`。用户回答原样回传，不再拼接 `current_step` 或「请开始第 X 步」。输入框旁点麦克风说话，再点一次结束。语音识别会尝试微信「同声传译」插件；为避免未开通插件时模拟器启动失败，`app.json` 里不预置 `plugins`。若要启用转文字：微信公众平台 → 设置 → 第三方设置 → 添加「同声传译」，再在 `app.json` 加上该插件。用户隐私保护指引需声明麦克风。
- 测试时小程序启动即用管理员账号 `zhixue-admin` 登录（`config.devAdmin`）。归档上传在「关于我们」。关掉 `devAdmin.enabled` 后仍走微信静默登录。
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
