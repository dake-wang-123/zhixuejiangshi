function hasWx() {
  return typeof wx !== 'undefined'
}

function errorText(err) {
  if (!err) return ''
  if (typeof err === 'string') return err
  return String(err.message || err.errMsg || err.msg || err.retcode || '')
}

function friendlyVoiceError(err) {
  const msg = errorText(err)
  if (!msg) return '语音识别失败'
  if (msg.indexOf('当前环境不支持') >= 0) return msg
  if (msg.indexOf('说话时间太短') >= 0 || msg.indexOf('没有识别到') >= 0) return msg
  if (msg.indexOf('未授权麦克风') >= 0 || msg.indexOf('auth deny') >= 0 || msg.indexOf('authorize:fail') >= 0) {
    return '未授权麦克风。请点右上角「…」→ 设置，允许录音。'
  }
  if (msg.indexOf('privacy') >= 0 || msg.indexOf('隐私') >= 0) {
    return '请先同意隐私指引里的麦克风权限。'
  }
  if (msg.indexOf('plugin') >= 0 || msg.indexOf('插件') >= 0 || msg.indexOf('WechatSI') >= 0) {
    return '语音识别插件未开通。请在微信公众平台添加「同声传译」。'
  }
  return msg.length > 40 ? '语音识别失败，请再试一次' : msg
}

function requirePrivacy() {
  return new Promise((resolve) => {
    if (!hasWx() || typeof wx.requirePrivacyAuthorize !== 'function') {
      resolve()
      return
    }
    wx.requirePrivacyAuthorize({
      success: () => resolve(),
      fail: () => resolve()
    })
  })
}

function openRecordSetting() {
  if (!hasWx() || !wx.showModal) return
  wx.showModal({
    title: '需要麦克风权限',
    content: '学习时要把语音转成文字。请在设置里允许录音。',
    confirmText: '去设置',
    success: (modal) => {
      if (modal.confirm && wx.openSetting) wx.openSetting({})
    }
  })
}

function ensureRecordAuth() {
  return requirePrivacy().then(() => new Promise((resolve, reject) => {
    if (!hasWx() || !wx.getSetting || !wx.authorize) {
      reject(new Error('当前环境不支持录音'))
      return
    }
    wx.getSetting({
      success: (res) => {
        const flag = res.authSetting ? res.authSetting['scope.record'] : undefined
        if (flag === true) {
          resolve()
          return
        }
        if (flag === false) {
          openRecordSetting()
          reject(new Error('未授权麦克风'))
          return
        }
        wx.authorize({
          scope: 'scope.record',
          success: () => resolve(),
          fail: (err) => {
            openRecordSetting()
            reject(new Error(errorText(err) || '未授权麦克风'))
          }
        })
      },
      fail: () => reject(new Error('无法读取麦克风权限'))
    })
  }))
}

function loadSiManager() {
  try {
    if (typeof requirePlugin !== 'function') return null
    const plugin = requirePlugin('WechatSI')
    if (!plugin || typeof plugin.getRecordRecognitionManager !== 'function') return null
    return plugin.getRecordRecognitionManager()
  } catch (e) {
    return null
  }
}

function getRecorder() {
  if (!hasWx() || typeof wx.getRecorderManager !== 'function') return null
  return wx.getRecorderManager()
}

let session = null

function clearSession() {
  const prev = session
  session = null
  return prev
}

function failSession(target, err) {
  if (!target || target.done) return
  target.done = true
  target.status = 'idle'
  if (target.startedReject) target.startedReject(err)
  if (target.resultReject) target.resultReject(err)
}

function finishSession(target, text) {
  if (!target || target.done) return
  const spoken = String(text || '').trim()
  if (!spoken) {
    failSession(target, new Error('没有识别到文字，请靠近麦克风再说一次'))
    return
  }
  target.done = true
  target.status = 'idle'
  if (target.startedResolve) target.startedResolve()
  if (target.resultResolve) target.resultResolve(spoken)
}

function bindSi(target, manager) {
  manager.onStart = function () {
    if (!session || session !== target || target.done) return
    target.status = 'recording'
    if (target.startedResolve) target.startedResolve()
    if (target.stopRequested) {
      try { manager.stop() } catch (e) {}
    }
  }
  manager.onRecognize = function (res) {
    if (!session || session !== target || !target.onPartial) return
    const text = String((res && (res.result || res.translateResult)) || '').trim()
    if (text) target.onPartial(text)
  }
  manager.onStop = function (res) {
    if (!session || session !== target) return
    finishSession(target, res && (res.result || res.translateResult))
    if (session === target) session = null
  }
  manager.onError = function (err) {
    if (!session || session !== target) return
    failSession(target, new Error(errorText(err) || '语音识别失败'))
    if (session === target) session = null
  }
}

function bindRecorder(target, recorder) {
  recorder.onStart = function () {
    if (!session || session !== target || target.done) return
    target.status = 'recording'
    if (target.startedResolve) target.startedResolve()
    if (target.stopRequested) {
      try { recorder.stop() } catch (e) {}
    }
  }
  recorder.onStop = function () {
    if (!session || session !== target) return
    failSession(target, new Error('语音识别插件未开通。请在微信公众平台添加「同声传译」后即可转文字。'))
    if (session === target) session = null
  }
  recorder.onError = function (err) {
    if (!session || session !== target) return
    failSession(target, new Error(errorText(err) || '无法开始录音'))
    if (session === target) session = null
  }
}

function startEngine(target) {
  const si = loadSiManager()
  if (si) {
    target.engine = 'si'
    target.manager = si
    bindSi(target, si)
    si.start({ duration: 60000, lang: 'zh_CN' })
    return
  }
  const recorder = getRecorder()
  if (recorder) {
    target.engine = 'recorder'
    target.manager = recorder
    bindRecorder(target, recorder)
    recorder.start({
      duration: 60000,
      sampleRate: 16000,
      numberOfChannels: 1,
      encodeBitRate: 48000,
      format: 'mp3',
      frameSize: 8
    })
    return
  }
  throw new Error('当前微信版本不支持录音')
}

function watchStartTimeout(target) {
  if (typeof setTimeout !== 'function') return
  setTimeout(() => {
    if (!session || session !== target || target.done) return
    if (target.status !== 'starting') return
    failSession(target, new Error('无法开始录音，请检查麦克风权限'))
    if (session === target) session = null
  }, 8000)
}

function prepare() {
  return ensureRecordAuth()
}

function begin(options) {
  const opts = options || {}
  if (session && (session.status === 'starting' || session.status === 'recording') && !session.done) {
    return session.started
  }
  const target = {
    status: 'starting',
    done: false,
    stopRequested: false,
    engine: '',
    manager: null,
    onPartial: opts.onPartial || null,
    started: null,
    result: null,
    startedResolve: null,
    startedReject: null,
    resultResolve: null,
    resultReject: null
  }
  target.started = new Promise((resolve, reject) => {
    target.startedResolve = resolve
    target.startedReject = reject
  })
  target.result = new Promise((resolve, reject) => {
    target.resultResolve = resolve
    target.resultReject = reject
  })
  target.started.catch(() => {})
  target.result.catch(() => {})
  session = target
  watchStartTimeout(target)
  ensureRecordAuth().then(() => {
    if (session !== target || target.done) return
    startEngine(target)
  }).catch((err) => {
    failSession(target, err)
    if (session === target) session = null
  })
  return target.started
}

function end() {
  const target = session
  if (!target) return Promise.reject(new Error('请先点麦克风再说话'))
  target.stopRequested = true
  if (target.status === 'recording' && target.manager && typeof target.manager.stop === 'function') {
    try { target.manager.stop() } catch (e) {}
  }
  return target.result.catch((err) => {
    throw new Error(friendlyVoiceError(err))
  })
}

function cancel() {
  const target = clearSession()
  if (!target) return
  target.stopRequested = true
  if (target.manager && typeof target.manager.stop === 'function') {
    try { target.manager.stop() } catch (e) {}
  }
  failSession(target, new Error('已取消录音'))
}

function appendDraft(current, extra) {
  const left = String(current || '').trim()
  const right = String(extra || '').trim()
  if (!right) return left
  if (!left) return right
  if (right.indexOf(left) === 0) return right
  return left + right
}

function isRecording() {
  return !!(session && session.status === 'recording' && !session.done)
}

module.exports = {
  prepare: prepare,
  begin: begin,
  end: end,
  cancel: cancel,
  appendDraft: appendDraft,
  friendlyVoiceError: friendlyVoiceError,
  isRecording: isRecording,
  startRecord: begin,
  stopRecord: end
}
