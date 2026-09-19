Component({
  properties: {
    steps: { type: Array, value: [] },
    current: { type: Number, value: 0 },
    furthest: { type: Number, value: 0 },
    percent: { type: Number, value: 0 }
  },
  methods: {
    onTap(e) {
      const index = Number(e.currentTarget.dataset.index)
      if (isNaN(index)) return
      this.triggerEvent('change', { index: index })
    }
  }
})
