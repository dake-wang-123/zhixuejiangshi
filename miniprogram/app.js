const auth = require('./utils/auth.js')

App({
  globalData: {
    token: '',
    account: null,
    loginError: ''
  },
  onLaunch() {
    this.ensureLogin()
  },
  ensureLogin() {
    const cached = auth.getToken()
    if (cached) {
      this.globalData.token = cached
      this.globalData.account = auth.getAccount()
      return auth.fetchAccount(cached).then((account) => {
        this.globalData.account = account
        return { token: cached, account: account }
      }).catch(() => this.relLogin())
    }
    return this.relLogin()
  },
  relLogin() {
    wx.showNavigationBarLoading()
    return auth.silentLogin().then((result) => {
      this.globalData.token = result.token
      this.globalData.account = result.account
      this.globalData.loginError = ''
      return result
    }).catch((err) => {
      this.globalData.loginError = (err && err.message) || '登录失败'
      throw err
    }).then((result) => {
      wx.hideNavigationBarLoading()
      return result
    }, (err) => {
      wx.hideNavigationBarLoading()
      throw err
    })
  },
  getToken() {
    return this.globalData.token || auth.getToken()
  }
})
