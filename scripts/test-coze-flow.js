const assert = require('assert')
const {
  parseCozeCatalog,
  setCatalog,
  matchCanonical,
  matchCanonicalLoose,
  alignWithCoze,
  listCategories
} = require('../miniprogram/utils/coze-catalog.js')
const { startPrompt, listFlowSteps, firstLiveIndex, OPEN_GUIDE_PROMPT } = require('../miniprogram/utils/flow.js')
const { extractReply, chatSettled } = require('../miniprogram/utils/agent.js')
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
assert.strictEqual(matchCanonical('听懂婴语'), null)
assert.strictEqual(
  matchCanonicalLoose('听懂婴语').title,
  '听懂“婴语”：读懂宝宝的哭声与信号'
)
assert.strictEqual(
  matchCanonicalLoose('宝宝睡眠引导', '0-3岁课程').title,
  '宝宝睡眠引导：告别抱睡奶睡夜醒'
)
assert.strictEqual(matchCanonicalLoose('AI'), null)
assert.strictEqual(matchCanonicalLoose('亲子沟通：倾听与表达'), null)
assert.strictEqual(alignWithCoze('听懂婴语', '0-3岁课程').matched, true)
assert.strictEqual(
  alignWithCoze('听懂婴语', '0-3岁课程').title,
  '听懂“婴语”：读懂宝宝的哭声与信号'
)
assert.strictEqual(alignWithCoze('课堂管理随手记', '其他').matched, false)
assert.strictEqual(startPrompt({ title: '听懂“婴语”：读懂宝宝的哭声与信号' }), '听懂“婴语”：读懂宝宝的哭声与信号')
assert.ok(startPrompt({ title: '听懂“婴语”：读懂宝宝的哭声与信号' }).indexOf('开始学习') < 0)

const packed = buildCozeCatalog([
  { id: 9, title: '听懂“婴语”：读懂宝宝的哭声与信号' },
  { id: 5, title: '亲子沟通：倾听与表达' }
], '')
assert.strictEqual(packed.categoryCount, 2)
assert.strictEqual(packed.catalogCount, 3)
assert.strictEqual(packed.matchedCount, 1)

const extracted = extractReply({
  reply_content: '请先告诉我课题原题。\n\n__FOLLOW_UPS__["幼小衔接六大核心维度实操指南"]',
  conversation_id: 'cid-1',
  raw: 'chat-1'
})
assert.strictEqual(extracted.reply, '请先告诉我课题原题。')
assert.deepStrictEqual(extracted.followUps, ['幼小衔接六大核心维度实操指南'])

const streamed = extractReply({
  reply_content: JSON.stringify({
    status: 'in_progress',
    items: [
      { role: 'assistant', type: 'answer', content: '先做自我介绍。' },
      { role: 'assistant', type: 'follow_up', content: '幼小衔接六大核心维度实操指南' },
      { role: 'assistant', type: 'verbose', content: '{"msg_type":"debug"}' }
    ]
  }),
  conversation_id: 'cid-2',
  raw: 'chat-2'
})
assert.strictEqual(streamed.reply, '先做自我介绍。')
assert.deepStrictEqual(streamed.followUps, ['幼小衔接六大核心维度实操指南'])
assert.strictEqual(streamed.items.length, 1)
assert.ok(!chatSettled({ reply: '', items: [] }, null))
assert.ok(chatSettled({ reply: '先做自我介绍。', items: streamed.items, followUps: streamed.followUps }, streamed))

const { titleFromSource, categoryFromSource, looksLikeCatalog, uniqueCourses } = require('../miniprogram/utils/archive-upload.js')
const { isAdmin, unlockAdmin } = require('../miniprogram/utils/admin.js')
assert.strictEqual(titleFromSource('0-3岁课程-听懂婴语.docx', ''), '听懂婴语')
assert.strictEqual(categoryFromSource('0-3岁课程-听懂婴语.docx', '', ''), '0-3岁课程')
assert.strictEqual(titleFromSource('x.txt', '# 幼小衔接六大核心维度实操指南\n正文'), '幼小衔接六大核心维度实操指南')
assert.ok(looksLikeCatalog('## 0-3岁课程\n1. 听懂婴语\n2. 睡眠引导'))
assert.ok(!looksLikeCatalog('你好，我们开始上课'))
const fromFiles = uniqueCourses([
  { title: titleFromSource('0-3岁课程-听懂婴语.docx', ''), category: categoryFromSource('0-3岁课程-听懂婴语.docx', '', '') },
  { title: '睡眠引导', category: '0-3岁课程' },
  { title: '课堂管理随手记', category: '其他' }
])
assert.strictEqual(fromFiles.length, 3)
assert.strictEqual(fromFiles[0].title, '听懂“婴语”：读懂宝宝的哭声与信号')
assert.strictEqual(fromFiles[0].matched, true)
assert.strictEqual(fromFiles[1].title, '宝宝睡眠引导：告别抱睡奶睡夜醒')
assert.strictEqual(fromFiles[1].matched, true)
assert.strictEqual(fromFiles[2].title, '课堂管理随手记')
assert.strictEqual(fromFiles[2].matched, false)
assert.ok(!isAdmin({ phoneNumber: '13800000000' }))
assert.ok(isAdmin({ phoneNumber: '17742415497' }))
assert.ok(isAdmin({ id: '1000000000000006' }))
assert.ok(!unlockAdmin('13800000000'))

const { buildOfficialCatalog, listOfficialCategories } = require('../miniprogram/utils/official-catalog.js')
const sixty = require('../miniprogram/data/course-catalog-60.js')
assert.strictEqual(sixty.length, 60)
assert.strictEqual(new Set(sixty.map((item) => item.lesson_code)).size, 60)
const official = buildOfficialCatalog(sixty, '')
assert.strictEqual(official.catalogCount, 60)
assert.strictEqual(official.categoryCount, 7)
assert.deepStrictEqual(official.sections.map((item) => item.name), [
  '0-3岁（6课）',
  '3-6岁（12课）',
  '6-9岁（12课）',
  '9-12岁（6课）',
  '12-15岁（6课）',
  '15-18岁（6课）',
  '国学父母修养课（12课）'
])
assert.deepStrictEqual(official.sections.map((item) => item.courses.length), [6, 12, 12, 6, 6, 6, 12])
assert.strictEqual(official.sections[0].courses[0].lesson_code, 'A01')
assert.strictEqual(official.sections[6].courses[11].lesson_code, 'G12')
assert.strictEqual(listOfficialCategories(sixty).length, 7)
const filtered = buildOfficialCatalog(sixty, '9-12岁（6课）')
assert.strictEqual(filtered.sections.length, 1)
assert.strictEqual(filtered.sections[0].courses.length, 6)
assert.strictEqual(filtered.sections[0].courses[1].lesson_code, 'D02')

const voice = require('../miniprogram/utils/voice.js')
assert.strictEqual(voice.appendDraft('', '你好'), '你好')
assert.strictEqual(voice.appendDraft('你', '好'), '你好')
assert.strictEqual(voice.appendDraft('你好', '你好啊'), '你好啊')
assert.ok(voice.friendlyVoiceError(new Error('authorize:fail auth deny')).indexOf('麦克风') >= 0)
assert.ok(voice.friendlyVoiceError(new Error('WechatSI plugin missing')).indexOf('同声传译') >= 0)
voice.begin().then(() => {
  throw new Error('voice.begin should reject without wx')
}, (err) => {
  assert.ok(String(err.message || err).indexOf('不支持录音') >= 0)
  console.log('coze catalog and flow tests passed')
})
