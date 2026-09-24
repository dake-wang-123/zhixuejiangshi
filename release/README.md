# 微信小程序导入包

文件：`zhixue-wechat.zip`

这是 Windows 可解压的导入包：只有英文路径，不含中文文件名。解压后导入里面的 `family-edu-miniprogram`（这一层必须能看到 `app.json` 和 `pages/`）。

AppID：`wx0277d4abe92dd8a3`

不要把 zip 当微信项目打开。Windows「全部提取」后还要再点进内层文件夹。

本包已含课号 / 会话隔离：换课会清空上一课的 `conversation_id`，只把讲师原文发给扣子，不再拼接 `current_step`。
