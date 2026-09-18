const config = require('../config.js')

function graphqlRequest(query, variables, token) {
  return new Promise((resolve, reject) => {
    const header = { 'Content-Type': 'application/json' }
    if (token) {
      header.Authorization = 'Bearer ' + token
    }
    wx.request({
      url: config.graphqlUrl,
      method: 'POST',
      data: { query: query, variables: variables || {} },
      header: header,
      success: (res) => {
        if (res.statusCode !== 200) {
          reject(new Error('网络错误 ' + res.statusCode))
          return
        }
        const body = res.data || {}
        if (body.errors && body.errors.length) {
          const first = body.errors[0]
          const err = new Error(first.message || 'GraphQL 错误')
          err.graphQLErrors = body.errors
          err.data = body.data
          reject(err)
          return
        }
        resolve(body.data)
      },
      fail: (err) => reject(err || new Error('请求失败'))
    })
  })
}

function eqText(column, value) {
  return {
    _eq: {
      text_operand: {
        left_operand: { column: column },
        right_operand: { literal: value }
      }
    }
  }
}

function eqBigint(column, value) {
  return {
    _eq: {
      bigint_operand: {
        left_operand: { column: column },
        right_operand: { literal: String(value) }
      }
    }
  }
}

function andWhere(parts) {
  return { _and: parts }
}

module.exports = {
  graphqlRequest: graphqlRequest,
  eqText: eqText,
  eqBigint: eqBigint,
  andWhere: andWhere
}
