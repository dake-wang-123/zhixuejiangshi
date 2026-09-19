Component({
  properties: {
    steps: { type: Array, value: [] },
    current: { type: Number, value: 0 },
    completedCount: { type: Number, value: 0 },
    finished: { type: Boolean, value: false }
  },
  methods: {
    onTap(e) {
      const index = Number(e.currentTarget.dataset.index)
      if (isNaN(index)) return
      this.triggerEvent('change', { index: index })
    }
  }
})
