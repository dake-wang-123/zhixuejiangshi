Component({
  properties: {
    steps: { type: Array, value: [] },
    current: { type: Number, value: 0 },
    completedCount: { type: Number, value: 0 },
    finished: { type: Boolean, value: false }
  },
  data: {
    currentLabel: ''
  },
  observers: {
    'steps, current, finished': function (steps, current, finished) {
      const list = steps || []
      const item = list[current] || {}
      this.setData({
        currentLabel: finished
          ? '已学完'
          : ((item.group ? item.group + ' · ' : '') + (item.title || ('第 ' + (current + 1) + ' 环节')))
      })
    }
  },
  methods: {
    onTap(e) {
      const index = Number(e.currentTarget.dataset.index)
      if (isNaN(index)) return
      this.triggerEvent('change', { index: index })
    }
  }
})
