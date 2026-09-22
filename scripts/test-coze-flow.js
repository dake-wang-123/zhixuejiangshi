const assert = require('assert')
const { matchCanonical, listCanonical, listCategories, CANONICAL_COUNT } = require('../miniprogram/utils/coze-catalog.js')
const { startPrompt, listFlowSteps, firstLiveIndex, detectAdvance } = require('../miniprogram/utils/flow.js')
const { buildCanonicalCatalog } = require('../miniprogram/utils/catalog.js')

assert.strictEqual(CANONICAL_COUNT, 60)
assert.strictEqual(listCanonical().length, 60)
assert.strictEqual(listCategories().length, 6)

const steps = listFlowSteps()
assert.strictEqual(steps.length, 18)
assert.strictEqual(steps[0].title, '选择课题')
assert.strictEqual(steps[1].title, '自我介绍')
assert.strictEqual(steps[17].title, '输出说课逐字稿')
steps.forEach((step) => {
  assert.strictEqual(step.goal, '')
})
assert.strictEqual(firstLiveIndex(true), 1)
assert.strictEqual(firstLiveIndex(false), 0)

const prompt = startPrompt({ title: '写作业不磨蹭：不用催、不用盯，主动完成' })
assert.strictEqual(prompt, '写作业不磨蹭：不用催、不用盯，主动完成')
assert.ok(prompt.indexOf('开始学习') < 0)
assert.ok(prompt.indexOf('模块一') < 0)
assert.ok(prompt.indexOf('严禁') < 0)
assert.ok(prompt.indexOf('\n') < 0)

const custom = startPrompt({ title: '亲子沟通：倾听与表达' })
assert.strictEqual(custom, '亲子沟通：倾听与表达')

assert.strictEqual(detectAdvance('请开始自我介绍', steps, 0), 1)
assert.strictEqual(detectAdvance('请开始自我介绍，然后破题、说课训练', steps, 1), 2)
assert.strictEqual(detectAdvance('请开始自我介绍，然后破题', steps, 2), 2)

const packed = buildCanonicalCatalog([
  { id: 9, title: '写作业不磨蹭：不用催、不用盯，主动完成', description: 'db' },
  { id: 5, title: '亲子沟通：倾听与表达', description: 'example' }
], '')
assert.strictEqual(packed.catalogCount, 60)
assert.strictEqual(packed.matchedCount, 1)

console.log('coze catalog and flow tests passed')
