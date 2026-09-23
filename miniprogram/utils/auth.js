const config = require('../config.js')
const { graphqlRequest } = require('./graphql.js')
const { unlockAdmin } = require('./admin.js')

const LOGIN_MUTATION = `
  mutation LoginWithWechatMiniApp($code: String!) {
    loginWithWechatMiniApp(code: $code) {
      account {
        id
        username
        profileImageUrl
        phoneNumber
      }
      jwt { token }
    }
  }
`

const USERNAME_LOGIN = `
  mutation LoginWithUsername($username: String!, $password: String!, $register: Boolean!) {
    authenticateWithUsername(username: $username, password: $password, register: $register) {
      account {
        id
        username
        profileImageUrl
        phoneNumber
      }
      jwt { token }
    }
  }
`

const ACCOUNT_QUERY = `
  query CurrentAccount {
    fz_account {
      id
      username
      profileImageUrl
      phoneNumber
    }
  }
`

function remember(token, account) {
  if (typeof wx !== 'undefined' && wx.setStorageSync) {
    wx.setStorageSync('token', token)
    wx.setStorageSync('account', account)
  }
  if (account && (account.phoneNumber || account.username === (config.devAdmin && config.devAdmin.username))) {
    unlockAdmin(account.phoneNumber || (config.adminPhones || [])[0])
  }
  return { token: token, account: account }
}

function loginWithUsername() {
  const dev = config.devAdmin || {}
  if (!dev.enabled || !dev.username || !dev.password) {
    return Promise.reject(new Error('未配置管理员测试账号'))
  }
  return graphqlRequest(USERNAME_LOGIN, {
    username: dev.username,
    password: dev.password,
    register: false
  }).then((data) => {
    const payload = data.authenticateWithUsername
    const token = payload.jwt && payload.jwt.token
    const account = payload.account
    if (!token || !account) throw new Error('管理员登录未返回会话')
    return remember(token, account)
  })
}

function silentLogin() {
  const dev = config.devAdmin || {}
  if (dev.enabled) return loginWithUsername()
  return wechatLogin()
}

function wechatLogin() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (loginRes) => {
        if (!loginRes.code) {
          reject(new Error('wx.login 未返回 code'))
          return
        }
        graphqlRequest(LOGIN_MUTATION, { code: loginRes.code })
          .then((data) => {
            const payload = data.loginWithWechatMiniApp
            const token = payload.jwt && payload.jwt.token
            const account = payload.account
            resolve(remember(token, account))
          })
          .catch(reject)
      },
      fail: reject
    })
  })
}

function getToken() {
  if (typeof wx === 'undefined' || !wx.getStorageSync) return ''
  return wx.getStorageSync('token') || ''
}

function getAccount() {
  if (typeof wx === 'undefined' || !wx.getStorageSync) return null
  return wx.getStorageSync('account') || null
}

function fetchAccount(token) {
  return graphqlRequest(ACCOUNT_QUERY, {}, token).then((data) => {
    const account = data.fz_account
    if (account && typeof wx !== 'undefined' && wx.setStorageSync) {
      wx.setStorageSync('account', account)
    }
    return account
  })
}

function logout() {
  if (typeof wx === 'undefined') return
  wx.removeStorageSync('token')
  wx.removeStorageSync('account')
}

module.exports = {
  silentLogin: silentLogin,
  loginWithUsername: loginWithUsername,
  wechatLogin: wechatLogin,
  getToken: getToken,
  getAccount: getAccount,
  fetchAccount: fetchAccount,
  logout: logout
}
