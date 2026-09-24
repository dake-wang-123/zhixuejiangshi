const { decorateThread } = require('./markdown.js')

function stepSize(len) {
  const n = Number(len) || 0
  if (n <= 0) return 1
  if (n <= 48) return 2
  if (n <= 160) return 4
  return Math.max(6, Math.ceil(n / 28))
}

function nextShown(full, shown) {
  const text = String(full || '')
  const start = Math.max(0, Number(shown) || 0)
  if (start >= text.length) return text.length
  return Math.min(text.length, start + stepSize(text.length))
}

function stop(page) {
  if (!page) return
  page._typeToken = (page._typeToken || 0) + 1
  page._typeFull = ''
  if (page._typeTimer) {
    clearTimeout(page._typeTimer)
    page._typeTimer = null
  }
}

function play(page, pending, fullText, options) {
  const opts = options || {}
  const text = String(fullText || '')
  const id = opts.id || ('coze-live-' + Date.now())
  if (!text) {
    return Promise.resolve()
  }
  if (page._typeFull === text) {
    if (page._typePromise) {
      return page._typePromise.then(() => {
        if (opts.followUps && opts.followUps.length) {
          page.setData({ followUps: opts.followUps, thinking: false })
        }
      })
    }
    page.setData({
      thinking: false,
      followUps: opts.followUps || page.data.followUps || []
    })
    return Promise.resolve()
  }
  stop(page)
  const token = page._typeToken
  page._typeFull = text
  page._typePromise = new Promise((resolve) => {
    let shown = 0
    function paintChunk(done) {
      const live = pending.concat([{
        id: id,
        role: 'assistant',
        hidden: false,
        streaming: !done,
        content: text.slice(0, shown),
        step: opts.step || pending[pending.length - 1] && pending[pending.length - 1].step
      }])
      page.setData({
        thread: decorateThread(live),
        thinking: false,
        followUps: done ? (opts.followUps || []) : [],
        scrollInto: 'm-' + id
      })
    }
    function tick() {
      if (page._typeToken !== token) {
        resolve()
        return
      }
      shown = nextShown(text, shown)
      const done = shown >= text.length
      paintChunk(done)
      if (done) {
        page._typeTimer = null
        page._typePromise = null
        resolve()
        return
      }
      page._typeTimer = setTimeout(tick, 24)
    }
    tick()
  })
  return page._typePromise
}

module.exports = {
  stepSize: stepSize,
  nextShown: nextShown,
  stop: stop,
  play: play
}
