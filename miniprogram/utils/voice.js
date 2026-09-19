function ensureRecordAuth() {
  return new Promise((resolve, reject) => {
    if (typeof wx === 'undefined' || !wx.getSetting) {
      reject(new Error('当前环境不支持录音'))
      return
    }
    wx.getSetting({
      success: (res) => {
        const ok = res.authSetting && res.authSetting['scope.record']
        if (ok) {
          resolve()
          return
        }
        wx.authorize({
          scope: 'scope.record',
          success: () => resolve(),
          fail: () => {
            wx.showModal({
              title: '需要麦克风权限',
              content: '语音输入要用到麦克风。请在设置里允许录音。',
              confirmText: '去设置',
              success: (modal) => {
                if (modal.confirm && wx.openSetting) wx.openSetting({})
              }
            })
            reject(new Error('未授权麦克风'))
          }
        })
      },
      fail: () => reject(new Error('无法读取权限'))
    })
  })
}

function transcribe(filePath) {
  return new Promise((resolve, reject) => {
    if (typeof wx === 'undefined' || typeof wx.translateVoice !== 'function') {
      reject(new Error('当前微信版本不支持语音转文字'))
      return
    }
    wx.translateVoice({
      filePath: filePath,
      isShowProgressTips: 1,
      success: (res) => {
        const text = String((res && res.translateResult) || '').trim()
        if (!text) reject(new Error('没有识别到文字'))
        else resolve(text)
      },
      fail: (err) => reject(new Error((err && err.errMsg) || '语音转文字失败'))
    })
  })
}

function startRecord() {
  return ensureRecordAuth().then(() => new Promise((resolve, reject) => {
    wx.startRecord({
      success: () => resolve(),
      fail: (err) => reject(new Error((err && err.errMsg) || '无法开始录音'))
    })
  }))
}

function stopRecord() {
  return new Promise((resolve, reject) => {
    wx.stopRecord({
      success: (res) => {
        const filePath = res && res.tempFilePath
        if (!filePath) {
          reject(new Error('没有录到声音'))
          return
        }
        transcribe(filePath).then(resolve).catch(reject)
      },
      fail: (err) => reject(new Error((err && err.errMsg) || '结束录音失败'))
    })
  })
}

function appendDraft(current, extra) {
  const left = String(current || '').trim()
  const right = String(extra || '').trim()
  if (!right) return left
  if (!left) return right
  return left + right
}

module.exports = {
  startRecord: startRecord,
  stopRecord: stopRecord,
  appendDraft: appendDraft
}
