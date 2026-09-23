function friendlyError(err, fallback) {
  const msg = String((err && err.message) || fallback || '操作失败')
  if (
    msg.indexOf('UnknownValueException') >= 0
    || msg.indexOf('is not specified in the schema') >= 0
    || msg.indexOf('com.zion.backend') >= 0
  ) {
    return '智学这次没有拿到合法入参。请从课程目录重新点这节课；行为流只传 user_message / user_id / conversation_id / bot_id。'
  }
  if (msg.indexOf('wechat id config') >= 0) {
    return 'Zion 读不到微信小程序配置。请核对编辑器「登录设置 / 微信」与微信开发者工具 AppID 是否一致。'
  }
  if (msg.indexOf('invalid code') >= 0 || msg.indexOf('FAILED_TO_GET_MINI_APP_SESSION_KEY') >= 0) {
    return '微信登录 code 无效，请用微信开发者工具打开本小程序后再试。'
  }
  if (msg.indexOf('未登录') >= 0 || msg.indexOf('无访问权限') >= 0) {
    return '当前身份无法继续，请完成登录后再试。'
  }
  return msg
}

module.exports = {
  friendlyError: friendlyError
}
