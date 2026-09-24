const assert = require('assert')
const {
  parseCozeCatalog,
  setCatalog,
  matchCanonical,
  matchCanonicalLoose,
  alignWithCoze,
  listCategories
} = require('../miniprogram/utils/coze-catalog.js')
const {
  startPrompt,
  listFlowSteps,
  firstLiveIndex,
  OPEN_GUIDE_PROMPT,
  detectProgress,
  applyProgress,
  inferProgress,
  paintStepViews,
  packTurn,
  exam1Prompt,
  exam2Prompt,
  extractNextStep,
  extractInspect,
  isConfirmText,
  startStepPrompt,
  stripGateMarkers
} = require('../miniprogram/utils/flow.js')
const { extractReply, chatSettled, isFlowCrash } = require('../miniprogram/utils/agent.js')
const { friendlyError } = require('../miniprogram/utils/errors.js')
const { buildCozeCatalog } = require('../miniprogram/utils/catalog.js')

assert.strictEqual(listFlowSteps().length, 10)
assert.strictEqual(listFlowSteps()[0].title, '自我介绍')
assert.strictEqual(listFlowSteps()[9].title, '总结收尾')
assert.strictEqual(firstLiveIndex(), 0)
assert.strictEqual(detectProgress('【当前步骤：3】\n## 目标价值').currentStep, 3)
assert.strictEqual(detectProgress('【步骤完成：2】').completedStep, 2)
assert.strictEqual(detectProgress('【十步完成】').allTenDone, true)
assert.strictEqual(extractNextStep('[下一关: 4]').nextStep, 4)
assert.strictEqual(extractNextStep('[下一关：11]').allTenDone, true)
assert.strictEqual(extractNextStep('恭喜你完成第三关，现在进入第四关').nextStep, 4)
assert.strictEqual(extractNextStep('完成这一关，我们继续', 3).nextStep, 4)
assert.strictEqual(extractNextStep('你好呀，先自我介绍').nextStep, 0)
assert.ok(startStepPrompt(4).indexOf('请开始第4步的内容') >= 0)
assert.strictEqual(stripGateMarkers('正文\n[下一关: 5]').indexOf('下一关') < 0, true)
const gated = applyProgress({ currentStep: 3, completedSteps: [1, 2] }, detectProgress('恭喜完成第三关\n[下一关: 4]'), 'reply')
assert.strictEqual(gated.currentStep, 4)
assert.ok(gated.completedSteps.indexOf(3) >= 0)
const tenDone = applyProgress({ currentStep: 10, completedSteps: [1, 2, 3, 4, 5, 6, 7, 8, 9] }, detectProgress('【步骤完成：10】【十步完成】\n[等待确认: 检验]'), 'reply')
assert.strictEqual(tenDone.finished, true)
assert.strictEqual(tenDone.currentStep, 10)
assert.strictEqual(tenDone.inspectWait, 'exam1')
assert.strictEqual(tenDone.currentPhase, 'learning')
assert.strictEqual(extractInspect('[等待确认: 检验2]').waitExam2, true)
assert.strictEqual(isConfirmText('好的'), true)
assert.strictEqual(isConfirmText('随便聊聊'), false)
const moved = applyProgress({ currentStep: 2, completedSteps: [1] }, detectProgress('【当前步骤：3】【步骤完成：2】'), 'reply')
assert.deepStrictEqual(moved.completedSteps, [1, 2])
assert.strictEqual(moved.currentStep, 3)
const views = paintStepViews(moved)
assert.strictEqual(views[1].status, 'done')
assert.strictEqual(views[2].status, 'current')
assert.strictEqual(views[3].status, 'todo')
const packedTurn = packTurn('我是讲师', moved, 'reply', { source: 'catalog' })
assert.ok(packedTurn.indexOf('current_step=3') >= 0)
assert.ok(packedTurn.indexOf('source=catalog') >= 0)
assert.ok(packedTurn.indexOf('lesson_kind=builtin') >= 0)
assert.ok(exam1Prompt().indexOf('讲课逐字稿') >= 0)
assert.ok(exam1Prompt().indexOf('诊断报告') >= 0)
assert.ok(exam2Prompt().indexOf('PPT大纲') >= 0)
assert.ok(exam2Prompt().indexOf('说课逐字稿') >= 0)
const inferred = inferProgress([
  { role: 'assistant', content: '【当前步骤：1】自我介绍', step: 1 },
  { role: 'assistant', content: '【当前步骤：2】【步骤完成：1】破题', step: 2 }
])
assert.strictEqual(inferred.currentStep, 2)
assert.ok(inferred.completedSteps.indexOf(1) >= 0)

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
assert.strictEqual(streamed.status, 'in_progress')
assert.ok(streamed.pending)
assert.ok(!chatSettled(streamed))
assert.ok(!chatSettled({ reply: '先做自我介绍。', items: streamed.items, followUps: streamed.followUps }))
assert.ok(chatSettled({ status: 'completed', reply: '先做自我介绍。' }))
assert.ok(chatSettled({ status: 'failed' }))

const completedTurn = extractReply({
  reply_content: JSON.stringify({
    status: 'completed',
    items: [
      { role: 'assistant', type: 'answer', content: '第一步：先做自我介绍。' },
      { role: 'assistant', type: 'answer', content: '上一课的长文不在这里。' },
      { role: 'user', type: 'question', content: '听懂婴语' }
    ]
  }),
  conversation_id: '7370000000000001',
  raw: '7370000000000002'
})
assert.strictEqual(completedTurn.pending, false)
assert.ok(chatSettled(completedTurn))
assert.strictEqual(completedTurn.conversationId, '7370000000000001')
assert.strictEqual(completedTurn.chatId, '7370000000000002')

const { conversationScope, stableUserId } = require('../miniprogram/utils/session.js')
assert.strictEqual(conversationScope({}), 'open')
assert.strictEqual(conversationScope({ lessonCode: 'A01', title: '听懂婴语' }), 'lesson:A01')
assert.strictEqual(conversationScope({ title: '听懂“婴语”：读懂宝宝的哭声与信号' }), 'topic:听懂“婴语”：读懂宝宝的哭声与信号')
assert.ok(stableUserId({ id: '1000000000000006' }, 'lesson:A01').indexOf('1000000000000006') >= 0)
assert.ok(stableUserId({ id: '1000000000000006' }, 'lesson:A01').indexOf('lesson_A01') >= 0)

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

const history = require('../miniprogram/utils/learn-history.js')
assert.strictEqual(history.lessonCodeOf('A01'), 'A01')
assert.strictEqual(history.lessonCodeOf('P:分离焦虑'), 'P:分离焦虑')
assert.strictEqual(history.lessonCodeOf('personal:物权'), 'P:物权')
assert.strictEqual(history.lessonCodeOf('lesson:A01'), 'A01')
assert.strictEqual(history.lessonCodeOf('open'), 'open')
assert.strictEqual(history.lessonCodeOf(''), 'open')
assert.ok(history.lessonCodeOf('topic:听懂婴语').indexOf('T:') === 0)
const packedHistory = history.packAdditional([
  { role: 'user', hidden: true, content: '隐藏' },
  { role: 'user', content: '第一问' },
  { role: 'assistant', failed: true, content: '失败' },
  { role: 'assistant', content: '第一答' }
])
assert.deepStrictEqual(packedHistory, [
  { role: 'user', content: '第一问' },
  { role: 'assistant', content: '第一答' }
])
const restored = history.rowsToSession([
  { id: 1, role: 'user', content: '听懂婴语', conversation_id: '7371', chat_id: '1', topic: '听懂婴语' },
  { id: 2, role: 'assistant', content: '第一步自我介绍', conversation_id: '7371', chat_id: '1', topic: '听懂婴语' }
], '')
assert.strictEqual(restored.messages.length, 2)
assert.strictEqual(restored.conversationId, '7371')
assert.strictEqual(restored.topicTitle, '听懂婴语')

const { findLessonCode } = require('../miniprogram/utils/official-catalog.js')
assert.strictEqual(findLessonCode(sixty[0].title), 'A01')

const markdown = require('../miniprogram/utils/markdown.js')
const md = markdown.toNodes('## 第一步\n请先自我介绍。\n\n- 姓名\n- 教龄\n\n**注意**这句')
assert.ok(md.length >= 3)
assert.strictEqual(md[0].attrs.style.indexOf('17px') >= 0, true)
const decorated = markdown.decorateThread([
  { id: 1, role: 'user', content: '你好' },
  { id: 2, role: 'assistant', content: '## 引导\n请回答。' },
  { id: 3, role: 'assistant', hidden: true, content: '隐藏' }
])
assert.strictEqual(decorated.length, 2)
assert.ok(decorated[1].nodes && decorated[1].nodes.length)
assert.ok(decorated[1].blocks && decorated[1].blocks.length >= 2)
assert.strictEqual(decorated[1].blocks[0].kind, 'heading')

const lessonBlocks = markdown.toBlocks([
  '## 核心逻辑',
  '家长先接住情绪，再谈规则。这一步只处理当下的哭闹，不讲大道理。',
  '',
  '## 场景话术',
  '> 妈妈看见你很着急，我们先抱一抱，等你缓过来再一起想办法。',
  '',
  '## 下一步提问',
  '刚才这句，你会改成自己的哪一版？'
].join('\n'))
assert.strictEqual(lessonBlocks.some((item) => item.kind === 'heading'), true)
assert.strictEqual(lessonBlocks.some((item) => item.kind === 'script'), true)
assert.strictEqual(lessonBlocks[lessonBlocks.length - 1].kind, 'ask')
assert.strictEqual(lessonBlocks[lessonBlocks.length - 1].kicker, '下一步提问')

const wall = markdown.toBlocks('讲师在课堂里常常一口气讲完所有理论，家长听着吃力，孩子也坐不住。先把目标收成一件事。你准备先处理哪一个现场？')
assert.ok(wall.length >= 2)
assert.strictEqual(wall[wall.length - 1].kind, 'ask')

const listedBlocks = markdown.toBlocks('1. 先点头 2. 再复述 3. 最后给选择')
assert.strictEqual(listedBlocks[0].kind, 'list')
assert.ok(listedBlocks[0].nodes.length >= 3)

const typewriter = require('../miniprogram/utils/typewriter.js')
assert.strictEqual(typewriter.stepSize(20), 2)
assert.ok(typewriter.stepSize(400) >= 6)
assert.strictEqual(typewriter.nextShown('你好世界', 0) > 0, true)
assert.strictEqual(typewriter.nextShown('你好世界', 4), 4)
const fakePage = {
  data: { thread: [], followUps: [] },
  setData: function (patch) { Object.assign(this.data, patch) }
}
typewriter.play(fakePage, [{ id: 1, role: 'user', content: 'hi' }], 'ABCD')
assert.ok(fakePage.data.thread[1].content.length >= 1)
typewriter.stop(fakePage)

const personalPlan = require('../miniprogram/utils/personal-plan.js')
assert.strictEqual(personalPlan.personalLessonCode('破解分离焦虑'), 'P:破解分离焦虑')
assert.strictEqual(personalPlan.isPersonalCode('P:破解分离焦虑'), true)
assert.strictEqual(personalPlan.sourceOf({ source: 'personal' }), 'personal')
assert.strictEqual(personalPlan.sourceOf({ lessonCode: 'B01' }, 'B01'), 'catalog')
assert.strictEqual(personalPlan.inferTitle('# 物权意识敏感期\n正文'), '物权意识敏感期')
const personalStart = personalPlan.packPersonalStart('破解分离焦虑', '家长一走孩子就哭。')
assert.ok(personalStart.indexOf('【个人教案】') >= 0)
assert.ok(personalStart.indexOf('## 个人教案正文') >= 0)
assert.ok(personalStart.indexOf('家长一走孩子就哭') >= 0)
assert.ok(personalPlan.shortUserText(personalStart).indexOf('开始自学这份个人教案') >= 0)
const clipped = personalPlan.clipPlan(Array(9000).join('甲'))
assert.strictEqual(clipped.truncated, true)
assert.ok(clipped.text.indexOf('截断') >= 0)
assert.ok(startPrompt({ title: '破解分离焦虑', source: 'personal', planText: '全文' }).indexOf('个人教案正文') >= 0)
assert.strictEqual(startPrompt({ title: '破解分离焦虑' }), '破解分离焦虑')

const accountView = require('../miniprogram/utils/account-view.js')
assert.strictEqual(accountView.displayName({ username: '林老师' }), '林老师')
assert.strictEqual(accountView.avatarUrl({ profileImageUrl: { url: 'https://a/b.png' } }), 'https://a/b.png')
assert.strictEqual(accountView.membershipView(null).label, '未开通')
assert.strictEqual(accountView.membershipView({ expire_time: '2099-12-01', level: '年度会员' }).active, true)

const learnRecords = require('../miniprogram/utils/learn-records.js')
assert.strictEqual(learnRecords.progressLabel({ completedSteps: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }), '已完成10步')
assert.ok(learnRecords.progressLabel({ currentStep: 3, completedSteps: [1, 2] }).indexOf('第3步') >= 0)
const merged = learnRecords.mergeRecords([
  { lesson_code: 'B01', topic_title: '破解分离焦虑', role: 'assistant', content: '【当前步骤：3】【步骤完成：2】', created_at: '2' }
], [
  { lesson_code: 'B01', topic_title: '破解分离焦虑', result_type: '讲课逐字稿', content: '稿', created_at: '3' }
])
assert.strictEqual(merged[0].lessonCode, 'B01')
assert.ok(merged[0].progressText)
assert.ok(merged[0].readyCount >= 1)

const fav = require('../miniprogram/utils/favorites.js')
fav.toggleFavorite({ lessonCode: 'A04', topicTitle: '物权意识敏感期' })
assert.strictEqual(fav.hasFavorite('A04'), true)
fav.toggleFavorite({ lessonCode: 'A04', topicTitle: '物权意识敏感期' })
assert.strictEqual(fav.hasFavorite('A04'), false)

const learnResults = require('../miniprogram/utils/learn-results.js')
const exam1 = learnResults.parseExam([
  '【检验1】',
  '## 讲课逐字稿',
  '家长朋友们，今天我们讲分离焦虑。',
  '## 诊断报告',
  '**结构完整**，开场能接住情绪。'
].join('\n'), 'exam1')
assert.strictEqual(exam1.length, 2)
assert.strictEqual(exam1[0].label, '讲课逐字稿')
assert.ok(exam1[0].content.indexOf('分离焦虑') >= 0)
assert.strictEqual(exam1[1].label, '诊断报告')
const exam2 = learnResults.parseExam([
  '## 说课逐字稿',
  '本课面向新手家长，40 分钟。',
  '## PPT大纲',
  '1. 封面：破解分离焦虑'
].join('\n'), 'exam2')
assert.strictEqual(exam2[0].kind, 'talk')
assert.strictEqual(exam2[1].kind, 'outline')
assert.strictEqual(learnResults.parseExam('只有一段讲稿', 'exam1')[0].label, '讲课逐字稿')
assert.strictEqual(learnResults.resultKey(9, 'lesson:B01', '讲课逐字稿'), '9|B01|讲课逐字稿')
const grouped = learnResults.groupByLesson([
  { lesson_code: 'B01', topic_title: '破解分离焦虑', result_type: '讲课逐字稿', content: '稿', created_at: '2' },
  { lesson_code: 'B01', topic_title: '破解分离焦虑', result_type: '诊断报告', content: '评', created_at: '3' },
  { lesson_code: 'A04', topic_title: '物权意识敏感期', result_type: 'PPT大纲', content: '页', created_at: '1' }
])
assert.strictEqual(grouped[0].lessonCode, 'B01')
assert.ok(grouped[0].summary.indexOf('已生成 讲课逐字稿') >= 0)
assert.strictEqual(grouped[0].readyCount, 2)
const tabs = learnResults.tabsFromRows([
  { lesson_code: 'B01', result_type: 'PPT大纲', content: '- 封面', created_at: '1' }
], '破解分离焦虑')
assert.strictEqual(tabs[3].kind, 'outline')
assert.strictEqual(tabs[3].ready, true)
assert.strictEqual(tabs[0].ready, false)

assert.strictEqual(isFlowCrash('com.zion.backend.support.actionflow.UnknownValueException: lesson_code is not specified in the schema'), true)
assert.strictEqual(isFlowCrash('你好，我们开始上课'), false)
assert.ok(friendlyError(new Error('UnknownValueException: lesson_code is not specified in the schema')).indexOf('合法入参') >= 0)

voice.begin().then(() => {
  throw new Error('voice.begin should reject without wx')
}, (err) => {
  assert.ok(String(err.message || err).indexOf('不支持录音') >= 0)
  console.log('coze catalog and flow tests passed')
})
