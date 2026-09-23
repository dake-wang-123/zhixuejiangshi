const auth = require('./utils/auth.js')
const config = require('./config.js')
const { isAdmin } = require('./utils/admin.js')

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
    const account = auth.getAccount()
    const wantAdmin = !!(config.devAdmin && config.devAdmin.enabled)
    if (cached && (!wantAdmin || isAdmin(account))) {
      this.globalData.token = cached
      this.globalData.account = account
      return auth.fetchAccount(cached).then((fresh) => {
        this.globalData.account = fresh
        return { token: cached, account: fresh }
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
