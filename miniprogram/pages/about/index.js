const { unlockAdmin, isAdmin } = require('../../utils/admin.js')

Page({
  data: {
    adminCode: '',
    isAdmin: false
  },
  onShow() {
    const app = getApp()
    this.setData({ isAdmin: isAdmin(app.globalData.account) })
  },
  onAdminCode(e) {
    this.setData({ adminCode: e.detail.value })
  },
  onUnlock() {
    if (!unlockAdmin(this.data.adminCode)) {
      wx.showToast({ title: '手机号未登记为管理员', icon: 'none' })
      return
    }
    this.setData({ isAdmin: true, adminCode: '' })
    wx.showToast({ title: '已开通管理员上传' })
  },
  onUpload() {
    wx.navigateTo({ url: '/pages/admin/upload' })
  }
})
