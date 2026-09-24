const app = getApp()
const { graphqlRequest, eqBigint } = require('../../utils/graphql.js')
const { membershipView } = require('../../utils/account-view.js')

Page({
  data: {
    vip: { active: false, label: '未开通', sub: '开通后可免费学习会员课' },
    loading: true
  },
  onShow() {
    this.load()
  },
  load() {
    this.setData({ loading: true })
    return app.ensureLogin().then(() => {
      const account = app.globalData.account || {}
      const q = `
        query Vip($memberWhere: user_membership_bool_exp) {
          user_membership(where: $memberWhere, limit: 1, order_by: { expire_time: desc }) {
            id expire_time status level
          }
        }
      `
      return graphqlRequest(q, { memberWhere: eqBigint('user_id', account.id) }, app.getToken())
    }).then((data) => {
      this.setData({
        loading: false,
        vip: membershipView((data.user_membership || [])[0] || null)
      })
    }).catch(() => {
      this.setData({ loading: false })
    })
  },
  onOpen() {
    wx.showModal({
      title: '开通会员',
      content: '会员记录写在 Zion「会员」表。微信支付上架前，请让管理员把你的帐户写入一条有效会员。',
      showCancel: false
    })
  }
})
