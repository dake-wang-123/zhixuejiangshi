const { graphqlRequest, eqText } = require('./graphql.js')
const { lessonCodeOf } = require('./learn-history.js')
const { toBlocks } = require('./markdown.js')

const RESULT_KINDS = [
  { kind: 'script', label: '讲课逐字稿', headings: ['讲课逐字稿', '模拟讲课逐字稿'] },
  { kind: 'report', label: '诊断报告', headings: ['诊断报告', '诊断评价报告'] },
  { kind: 'talk', label: '说课逐字稿', headings: ['说课逐字稿'] },
  { kind: 'outline', label: 'PPT大纲', headings: ['PPT大纲', 'PPT 大纲', '课件大纲'] }
]

const KIND_BY_LABEL = {}
RESULT_KINDS.forEach((item) => {
  KIND_BY_LABEL[item.label] = item
  item.headings.forEach((heading) => { KIND_BY_LABEL[heading] = item })
})

function escapeRe(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function kindOf(type) {
  const hit = KIND_BY_LABEL[String(type || '').trim()]
  return hit ? hit.kind : ''
}

function labelOf(kindOrType) {
  const raw = String(kindOrType || '').trim()
  const byKind = RESULT_KINDS.filter((item) => item.kind === raw)[0]
  if (byKind) return byKind.label
  const byLabel = KIND_BY_LABEL[raw]
  return byLabel ? byLabel.label : raw
}

function resultKey(accountId, lessonCode, resultType) {
  return [accountId, lessonCodeOf(lessonCode, 'open'), labelOf(resultType)].join('|')
}

function findHeading(src, heading) {
  const re = new RegExp('(?:^|\\n)\\s*(?:#{1,3}\\s*|\\*\\*)?' + escapeRe(heading) + '(?:\\*\\*)?\\s*[:：]?\\s*(?=\\n|$)', 'i')
  const match = src.match(re)
  if (!match || match.index == null) return null
  return { start: match.index, end: match.index + match[0].length, heading: heading }
}

function extractSections(text) {
  const src = String(text || '').replace(/\r\n/g, '\n')
  const hits = []
  RESULT_KINDS.forEach((kind) => {
    kind.headings.forEach((heading) => {
      const hit = findHeading(src, heading)
      if (hit) hits.push(Object.assign({ kind: kind.kind, label: kind.label }, hit))
    })
  })
  hits.sort((a, b) => a.start - b.start)
  const first = {}
  const ordered = []
  hits.forEach((hit) => {
    if (first[hit.kind]) return
    first[hit.kind] = true
    ordered.push(hit)
  })
  return ordered.map((hit, index) => {
    const next = ordered[index + 1]
    const body = src.slice(hit.end, next ? next.start : src.length).trim()
    return { kind: hit.kind, label: hit.label, content: body }
  }).filter((item) => item.content)
}

function parseExam(text, command) {
  const sections = extractSections(text)
  if (sections.length) return sections
  const raw = String(text || '').trim()
  if (!raw) return []
  if (command === 'exam2') return [{ kind: 'talk', label: '说课逐字稿', content: raw }]
  return [{ kind: 'script', label: '讲课逐字稿', content: raw }]
}

function rowContent(row) {
  return String((row && (row.content || row.成果内容)) || '').trim()
}

function rowType(row) {
  return labelOf((row && (row.result_type || row.成果类型)) || '')
}

function decorateRow(row) {
  const label = rowType(row)
  const content = rowContent(row)
  return {
    id: row && row.id,
    lessonCode: (row && (row.lesson_code || row.课号)) || 'open',
    topicTitle: (row && (row.topic_title || row.课题)) || '',
    resultType: label,
    kind: kindOf(label),
    content: content,
    createdAt: (row && (row.updated_at || row.created_at)) || '',
    blocks: content ? toBlocks(content) : []
  }
}

function groupByLesson(rows) {
  const map = {}
  ;(rows || []).forEach((row) => {
    const item = decorateRow(row)
    if (!item.content || !item.resultType) return
    const key = item.lessonCode || 'open'
    if (!map[key]) {
      map[key] = {
        lessonCode: key,
        topicTitle: item.topicTitle || key,
        kinds: {},
        typeLabels: [],
        updatedAt: item.createdAt
      }
    }
    const group = map[key]
    group.kinds[item.kind || item.resultType] = item
    if (item.createdAt && item.createdAt > group.updatedAt) {
      group.updatedAt = item.createdAt
      if (item.topicTitle) group.topicTitle = item.topicTitle
    } else if (!group.topicTitle && item.topicTitle) {
      group.topicTitle = item.topicTitle
    }
  })
  return Object.keys(map).sort((a, b) => {
    return String(map[b].updatedAt || '').localeCompare(String(map[a].updatedAt || ''))
  }).map((key) => {
    const group = map[key]
    const chips = RESULT_KINDS.map((meta) => {
      const ready = !!group.kinds[meta.kind]
      return {
        kind: meta.kind,
        label: meta.label,
        ready: ready,
        text: (ready ? '已生成 ' : '待生成 ') + meta.label
      }
    })
    const ready = chips.filter((item) => item.ready)
    return {
      lessonCode: group.lessonCode,
      topicTitle: group.topicTitle,
      updatedAt: group.updatedAt,
      chips: chips,
      typeLabels: ready.map((item) => item.text),
      summary: ready.length ? ready.map((item) => item.text).join(' · ') : '还没有生成成果',
      readyCount: ready.length
    }
  })
}

function listResults(token) {
  const query = `
    query MyLearnResults {
      learn_result(order_by: { created_at: desc }, limit: 200) {
        id
        lesson_code
        topic_title
        result_type
        content
        created_at
        updated_at
      }
    }
  `
  return graphqlRequest(query, {}, token).then((data) => data.learn_result || [])
}

function listLesson(lessonCode, token) {
  const query = `
    query LessonResults($where: learn_result_bool_exp) {
      learn_result(where: $where, order_by: { created_at: desc }, limit: 40) {
        id
        lesson_code
        topic_title
        result_type
        content
        created_at
        updated_at
      }
    }
  `
  return graphqlRequest(query, {
    where: eqText('lesson_code', lessonCodeOf(lessonCode, 'open'))
  }, token).then((data) => data.learn_result || [])
}

function saveRows(rows, token) {
  const objects = (rows || []).map((row) => ({
    lesson_code: lessonCodeOf(row.lesson_code, 'open'),
    topic_title: String(row.topic_title || ''),
    result_type: labelOf(row.result_type || row.kind),
    content: String(row.content || ''),
    result_key: String(row.result_key || ''),
    account_id: row.account_id
  })).filter((row) => row.content && row.result_key && row.account_id && row.result_type)
  if (!objects.length) return Promise.resolve(0)
  const mutation = `
    mutation UpsertLearnResults($objects: [learn_result_insert_input!]!) {
      insert_learn_result(
        objects: $objects
        on_conflict: {
          constraint: learn_result_key_key
          update_columns: [content, topic_title]
        }
      ) { affected_rows }
    }
  `
  return graphqlRequest(mutation, { objects: objects }, token).then((data) => {
    return (data.insert_learn_result && data.insert_learn_result.affected_rows) || 0
  }).catch(() => 0)
}

function saveExam(payload, token) {
  const accountId = payload && payload.accountId
  const lessonCode = lessonCodeOf(payload && payload.lessonCode, 'open')
  const topicTitle = String((payload && payload.topicTitle) || '')
  const sections = parseExam(payload && payload.text, payload && payload.command)
  const rows = sections.map((section) => ({
    lesson_code: lessonCode,
    topic_title: topicTitle,
    result_type: section.label,
    content: section.content,
    result_key: resultKey(accountId, lessonCode, section.label),
    account_id: accountId
  }))
  return saveRows(rows, token)
}

function tabsFromRows(rows, topicTitle) {
  const latest = {}
  ;(rows || []).forEach((row) => {
    const item = decorateRow(row)
    if (!item.kind) return
    const prev = latest[item.kind]
    if (!prev || String(item.createdAt) > String(prev.createdAt)) latest[item.kind] = item
  })
  return RESULT_KINDS.map((meta) => {
    const hit = latest[meta.kind]
    return {
      kind: meta.kind,
      label: meta.label,
      ready: !!(hit && hit.content),
      content: (hit && hit.content) || '',
      blocks: (hit && hit.blocks) || [],
      createdAt: (hit && hit.createdAt) || '',
      topicTitle: (hit && hit.topicTitle) || topicTitle || ''
    }
  })
}

module.exports = {
  RESULT_KINDS: RESULT_KINDS,
  kindOf: kindOf,
  labelOf: labelOf,
  resultKey: resultKey,
  parseExam: parseExam,
  extractSections: extractSections,
  groupByLesson: groupByLesson,
  listResults: listResults,
  listLesson: listLesson,
  saveRows: saveRows,
  saveExam: saveExam,
  tabsFromRows: tabsFromRows,
  decorateRow: decorateRow
}
