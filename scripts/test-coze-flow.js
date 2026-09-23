const assert = require('assert')
const {
  parseCozeCatalog,
  setCatalog,
  matchCanonical,
  listCategories
} = require('../miniprogram/utils/coze-catalog.js')
const { startPrompt, listFlowSteps, firstLiveIndex, parseListedSteps, detectAdvance, OPEN_GUIDE_PROMPT } = require('../miniprogram/utils/flow.js')
const { buildCozeCatalog } = require('../miniprogram/utils/catalog.js')

assert.strictEqual(listFlowSteps().length, 0)
assert.strictEqual(firstLiveIndex(), 0)

const listed = parseCozeCatalog([
  '## 0-3岁课程',
  '1. 听懂“婴语”：读懂宝宝的哭声与信号',
  '2. 宝宝睡眠引导：告别抱睡奶睡夜醒',
  '## 父母国学修养课',
  '- “闭嘴”的功夫'
].join('\n'))
assert.deepStrictEqual(listed.categories, ['0-3岁课程', '父母国学修养课'])
assert.strictEqual(listed.courses.length, 3)
assert.strictEqual(listed.courses[0].title, '听懂“婴语”：读懂宝宝的哭声与信号')
assert.strictEqual(listed.courses[2].category, '父母国学修养课')

const jsoned = parseCozeCatalog(JSON.stringify({
  categories: [
    { name: '3-6岁课程', courses: ['幼儿园适应全攻略：不哭不闹爱上上学'] }
  ]
}))
assert.strictEqual(jsoned.categories[0], '3-6岁课程')
assert.strictEqual(jsoned.courses[0].title, '幼儿园适应全攻略：不哭不闹爱上上学')

assert.deepStrictEqual(parseCozeCatalog('你好呀，我们开始上课吧'), { categories: [], courses: [] })

const live = parseCozeCatalog([
  '### 一、AI工具家庭教育应用类',
  '1. 孩子AI学习辅助方法指导',
  '2. AI辅助高考志愿填报操作指南',
  '### 分类文件夹1：幼小衔接指导类',
  '- 课题原标题：《幼小衔接六大核心维度实操指南》'
].join('\n'))
assert.ok(live.categories.indexOf('AI工具家庭教育应用类') >= 0)
assert.ok(live.categories.indexOf('幼小衔接指导类') >= 0)
assert.strictEqual(live.courses[0].title, '孩子AI学习辅助方法指导')
assert.strictEqual(live.courses[2].title, '幼小衔接六大核心维度实操指南')
assert.strictEqual(OPEN_GUIDE_PROMPT, '你好')
assert.ok(startPrompt({ title: '孩子AI学习辅助方法指导' }).indexOf('你好') < 0)

setCatalog({
  categories: listed.categories,
  courses: listed.courses
})
assert.strictEqual(listCategories().length, 2)
assert.ok(matchCanonical('听懂“婴语”：读懂宝宝的哭声与信号'))
assert.strictEqual(matchCanonical('亲子沟通：倾听与表达'), null)
assert.strictEqual(startPrompt({ title: '听懂“婴语”：读懂宝宝的哭声与信号' }), '听懂“婴语”：读懂宝宝的哭声与信号')
assert.ok(startPrompt({ title: '听懂“婴语”：读懂宝宝的哭声与信号' }).indexOf('开始学习') < 0)

const packed = buildCozeCatalog([
  { id: 9, title: '听懂“婴语”：读懂宝宝的哭声与信号' },
  { id: 5, title: '亲子沟通：倾听与表达' }
], '')
assert.strictEqual(packed.categoryCount, 2)
assert.strictEqual(packed.catalogCount, 3)
assert.strictEqual(packed.matchedCount, 1)

const steps = parseListedSteps('1. 选择课题\n2. 自我介绍\n3. 破题')
assert.strictEqual(steps[0].title, '选择课题')
assert.strictEqual(detectAdvance('现在进入自我介绍', steps, 0), 1)
assert.strictEqual(detectAdvance('现在进入自我介绍和破题', steps, 1), 2)

console.log('coze catalog and flow tests passed')
