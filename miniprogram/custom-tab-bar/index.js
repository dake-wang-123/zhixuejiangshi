Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/index/index', text: '课程', icon: '/images/tab/course.svg', iconOn: '/images/tab/course-on.svg' },
      { pagePath: '/pages/plan/index', text: '教案', icon: '/images/tab/plan.svg', iconOn: '/images/tab/plan-on.svg' },
      { pagePath: '/pages/agent/index', text: '智学', icon: '/images/tab/agent.svg', iconOn: '/images/tab/agent-on.svg' },
      { pagePath: '/pages/mine/index', text: '我的', icon: '/images/tab/mine.svg', iconOn: '/images/tab/mine-on.svg' }
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
