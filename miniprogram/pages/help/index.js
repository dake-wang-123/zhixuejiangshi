const app = getApp()
const { graphqlRequest } = require('../../utils/graphql.js')

Page({
  data: {
    feedback: '',
    sending: false
  },
  onFeedback(e) {
    this.setData({ feedback: e.detail.value })
  },
  onSend() {
    const content = (this.data.feedback || '').trim()
    if (!content) {
      wx.showToast({ title: '请填写要反馈的内容', icon: 'none' })
      return
    }
    this.setData({ sending: true })
    app.ensureLogin().then(() => {
      const account = app.globalData.account
      const mutation = `
        mutation SendFeedback($object: feedback_insert_input!) {
          insert_feedback_one(object: $object) { id }
        }
      `
      return graphqlRequest(mutation, {
        object: {
          content: content,
          handle_status: '待处理',
          user_id_id: account.id
        }
      }, app.getToken())
    }).then(() => {
      this.setData({ sending: false, feedback: '' })
      wx.showToast({ title: '已提交反馈' })
    }).catch((err) => {
      this.setData({ sending: false })
      wx.showToast({ title: err.message || '提交失败', icon: 'none' })
    })
  }
})
