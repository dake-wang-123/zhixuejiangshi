const assert = require('assert')
const { matchCanonical, listCanonical, listCategories, CANONICAL_COUNT } = require('../miniprogram/utils/coze-catalog.js')
const { startPrompt, parseListedSteps, continuePrompt } = require('../miniprogram/utils/flow.js')
const { buildCanonicalCatalog } = require('../miniprogram/utils/catalog.js')

assert.strictEqual(CANONICAL_COUNT, 60)
assert.strictEqual(listCanonical().length, 60)
assert.strictEqual(listCategories().length, 6)
listCategories().forEach((name) => {
  const n = listCanonical().filter((item) => item.category === name).length
  assert.strictEqual(n, 10, name)
})

const titles = listCanonical().map((item) => item.title)
assert.strictEqual(new Set(titles).size, 60)

const hit = matchCanonical(' 听懂“婴语”：读懂宝宝的哭声与信号 ')
assert.ok(hit)
assert.strictEqual(hit.title, '听懂“婴语”：读懂宝宝的哭声与信号')
assert.strictEqual(matchCanonical('亲子沟通：倾听与表达'), null)
assert.strictEqual(matchCanonical('亲子沟通密码：说一遍就听，不顶嘴、不逆反').title.indexOf('亲子沟通密码'), 0)

const prompt = startPrompt({ title: '写作业不磨蹭：不用催、不用盯，主动完成' })
assert.ok(prompt.indexOf('开始学习《写作业不磨蹭：不用催、不用盯，主动完成》') === 0)
assert.ok(prompt.indexOf('模块一') < 0)
assert.ok(prompt.indexOf('严禁') < 0)
assert.ok(prompt.indexOf('自我介绍') < 0)
assert.ok(continuePrompt().indexOf('模块') < 0)

const custom = startPrompt({ title: '亲子沟通：倾听与表达' })
assert.strictEqual(custom, '开始学习《亲子沟通：倾听与表达》')

const steps = parseListedSteps([
  '1. 选择课题',
  '2. 自我介绍',
  '3. 破题',
  '模块四：同理家长'
].join('\n'))
assert.ok(steps.length >= 3)
assert.strictEqual(steps[0].title, '选择课题')

const packed = buildCanonicalCatalog([
  { id: 9, title: '写作业不磨蹭：不用催、不用盯，主动完成', description: 'db' },
  { id: 5, title: '亲子沟通：倾听与表达', description: 'example' }
], '')
assert.strictEqual(packed.catalogCount, 60)
assert.strictEqual(packed.matchedCount, 1)
const flat = packed.sections.reduce((all, section) => all.concat(section.courses), [])
assert.strictEqual(flat.length, 60)
const matched = flat.find((item) => item.displayTitle.indexOf('写作业不磨蹭') === 0)
assert.ok(matched.inLibrary)
assert.strictEqual(String(matched.dbId), '9')
const extra = flat.find((item) => item.displayTitle === '亲子沟通：倾听与表达')
assert.ok(!extra)

console.log('coze catalog and flow tests passed')
