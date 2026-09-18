const { graphqlRequest } = require('./graphql.js')

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

function silentLogin() {
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
            wx.setStorageSync('token', token)
            wx.setStorageSync('account', account)
            resolve({ token: token, account: account })
          })
          .catch(reject)
      },
      fail: reject
    })
  })
}

function getToken() {
  return wx.getStorageSync('token') || ''
}

function getAccount() {
  return wx.getStorageSync('account') || null
}

function fetchAccount(token) {
  return graphqlRequest(ACCOUNT_QUERY, {}, token).then((data) => {
    const account = data.fz_account
    if (account) {
      wx.setStorageSync('account', account)
    }
    return account
  })
}

function logout() {
  wx.removeStorageSync('token')
  wx.removeStorageSync('account')
}

module.exports = {
  silentLogin: silentLogin,
  getToken: getToken,
  getAccount: getAccount,
  fetchAccount: fetchAccount,
  logout: logout
}
