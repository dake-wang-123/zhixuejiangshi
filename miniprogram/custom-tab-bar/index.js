Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/index/index', text: '课程', icon: '书' },
      { pagePath: '/pages/learn/index', text: '学习', icon: '习' },
      { pagePath: '/pages/plan/index', text: '教案', icon: '案' },
      { pagePath: '/pages/agent/index', text: '智学', icon: '智' },
      { pagePath: '/pages/mine/index', text: '我的', icon: '我' }
    ]
  },
  methods: {
    onChange(e) {
      const index = Number(e.currentTarget.dataset.index)
      const item = this.data.list[index]
      wx.switchTab({ url: item.pagePath })
    }
  }
})
