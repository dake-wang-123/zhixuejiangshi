const app = getApp()
const config = require('../../config.js')
const { graphqlRequest, eqText } = require('../../utils/graphql.js')
const { uploadFile } = require('../../utils/upload.js')
const { parseLessonPlan } = require('../../utils/agent.js')
const { formatAnalysis } = require('../../utils/analysis.js')
const { isAdmin } = require('../../utils/admin.js')
const {
  titleFromSource,
  categoryFromSource,
  looksLikeCatalog
} = require('../../utils/archive-upload.js')
const {
  parseCozeCatalog,
  listCategories,
  loadCachedCatalog,
  mergeCatalog,
  normalizeTitle
} = require('../../utils/coze-catalog.js')

Page({
  data: {
    files: [],
    text: '',
    category: '',
    categories: [],
    preview: [],
    progress: '',
    submitting: false,
    error: '',
    lastResult: null
  },
  onShow() {
    loadCachedCatalog()
    const account = app.globalData.account || {}
    if (!isAdmin(account)) {
      this.setData({ error: '仅管理员可归档课程。请先在「我的」开通管理员入口。' })
    }
    this.setData({ categories: listCategories() })
    this.refreshPreview()
    app.ensureLogin().then(() => {
      const next = app.globalData.account || {}
      if (!isAdmin(next)) {
        this.setData({ error: '仅管理员可归档课程。请先在「我的」开通管理员入口。' })
        return
      }
      this.setData({ error: '' })
      return this.loadRemoteCategories()
    }).catch((err) => {
      this.setData({ error: (err && err.message) || '请先登录' })
    })
  },
  loadRemoteCategories() {
    const q = `query Cats { course_category(order_by: { sort_order: asc }) { id name } }`
    return graphqlRequest(q, {}, app.getToken()).then((data) => {
      const names = (data.course_category || []).map((item) => item.name).filter(Boolean)
      const local = listCategories()
      names.forEach((name) => {
        if (local.indexOf(name) < 0) local.push(name)
      })
      this._remoteCats = data.course_category || []
      this.setData({ categories: local })
    }).catch(() => {})
  },
  onCategory(e) {
    this.setData({ category: e.detail.value })
    this.refreshPreview()
  },
  onPickCategory(e) {
    this.setData({ category: e.currentTarget.dataset.name || '' })
    this.refreshPreview()
  },
  onText(e) {
    this.setData({ text: e.detail.value })
    this.refreshPreview()
  },
  onChoose() {
    wx.chooseMessageFile({
      count: 20,
      type: 'file',
      success: (res) => {
        const files = (res.tempFiles || []).map((file) => {
          const item = {
            name: file.name || '课程文件',
            path: file.path,
            text: ''
          }
          item.text = this.readTextIfPossible(file.path, item.name)
          return item
        })
        this.setData({ files: files })
        this.refreshPreview()
      }
    })
  },
  readTextIfPossible(filePath, name) {
    const lower = (name || '').toLowerCase()
    if (!(/\.(txt|md|markdown|json)$/).test(lower)) return ''
    try {
      return String(wx.getFileSystemManager().readFileSync(filePath, 'utf8') || '').slice(0, 20000)
    } catch (e) {
      return ''
    }
  },
  refreshPreview() {
    this.setData({ preview: this.collectDrafts() })
  },
  collectDrafts() {
    const fallback = (this.data.category || '').trim()
    const text = (this.data.text || '').trim()
    const rows = []
    if (text && looksLikeCatalog(text)) {
      const parsed = parseCozeCatalog(text)
      ;(parsed.courses || []).forEach((item) => {
        rows.push({
          title: item.title,
          category: item.category || fallback,
          description: item.description || '',
          file: null,
          fullText: ''
        })
      })
    } else if (text) {
      rows.push({
        title: titleFromSource('', text),
        category: categoryFromSource('', text, fallback),
        description: text.slice(0, 200),
        file: null,
        fullText: text
      })
    }
    ;(this.data.files || []).forEach((file) => {
      if (file.text && looksLikeCatalog(file.text)) {
        const parsed = parseCozeCatalog(file.text)
        ;(parsed.courses || []).forEach((item) => {
          rows.push({
            title: item.title,
            category: item.category || fallback,
            description: item.description || '',
            file: file,
            fullText: ''
          })
        })
        return
      }
      rows.push({
        title: titleFromSource(file.name, file.text),
        category: categoryFromSource(file.name, file.text, fallback),
        description: (file.text || '').slice(0, 200),
        file: file,
        fullText: file.text || ''
      })
    })
    const unique = []
    const seen = {}
    rows.forEach((item) => {
      if (!item || !item.title) return
      const key = normalizeTitle(item.title) + '|' + normalizeTitle(item.category)
      if (seen[key]) return
      seen[key] = true
      unique.push(item)
    })
    return unique
  },
  onSubmit() {
    if (this.data.submitting) return
    const account = app.globalData.account || {}
    if (!isAdmin(account)) {
      wx.showToast({ title: '仅管理员可归档', icon: 'none' })
      return
    }
    const drafts = this.collectDrafts()
    if (!drafts.length) {
      wx.showToast({ title: '请先选择文件或粘贴目录', icon: 'none' })
      return
    }
    this.setData({ submitting: true, error: '', progress: '正在登录…', preview: drafts })
    app.ensureLogin().then(() => {
      if (!isAdmin(app.globalData.account || {})) throw new Error('仅管理员可归档课程')
      return this.archiveAll(drafts, app.globalData.account, app.getToken())
    }).then((result) => {
      this.setData({
        submitting: false,
        progress: '',
        files: [],
        text: '',
        preview: [],
        lastResult: result,
        categories: listCategories()
      })
      wx.showToast({ title: '已归档 ' + result.inserted + ' 门' })
    }).catch((err) => {
      this.setData({
        submitting: false,
        progress: '',
        error: (err && err.message) || '归档失败'
      })
    })
  },
  archiveAll(drafts, account, token) {
    let chain = Promise.resolve({ inserted: 0 })
    drafts.forEach((draft, index) => {
      chain = chain.then((acc) => {
        this.setData({ progress: '归档 ' + (index + 1) + '/' + drafts.length + '：' + draft.title })
        return this.archiveOne(draft, account, token).then(() => {
          acc.inserted += 1
          return acc
        })
      })
    })
    return chain.then((acc) => {
      const packed = mergeCatalog({
        categories: drafts.map((item) => item.category).filter(Boolean),
        courses: drafts.map((item) => ({
          title: item.title,
          category: item.category,
          description: item.description || ''
        }))
      })
      return {
        inserted: acc.inserted,
        catalogCount: (packed.courses || []).length,
        categoryCount: (packed.categories || []).length
      }
    })
  },
  archiveOne(draft, account, token) {
    return this.ensureCategory(draft.category, token).then((categoryId) => {
      const upload = draft.file && draft.file.path
        ? uploadFile(draft.file.path, draft.file.name || draft.title, token)
        : Promise.resolve('')
      return upload.then((fileId) => {
        return this.analyzeIfNeeded(draft, token).then((analyzed) => {
          const title = analyzed.title || draft.title
          const category = analyzed.category || draft.category
          const description = analyzed.description || draft.description || ''
          draft.title = title
          draft.category = category
          draft.description = description
          return this.ensureCategory(category, token).then((finalCatId) => {
            return this.insertCourse({
              title: title,
              description: description,
              categoryId: finalCatId || categoryId,
              fileId: fileId,
              analysis: analyzed.analysis,
              account: account
            }, token)
          })
        })
      })
    })
  },
  analyzeIfNeeded(draft, token) {
    const fullText = String(draft.fullText || '').trim()
    if (fullText.length < 80) {
      return Promise.resolve({
        title: draft.title,
        category: draft.category,
        description: draft.description || '',
        analysis: null
      })
    }
    this.setData({ progress: '正在解析「' + draft.title + '」标题与分类…' })
    return parseLessonPlan(fullText, token).then((parsed) => {
      const view = formatAnalysis(parsed) || {}
      return {
        title: view.courseName || draft.title,
        category: view.direction || draft.category,
        description: view.summaryText || draft.description || '',
        analysis: parsed
      }
    }).catch(() => ({
      title: draft.title,
      category: draft.category,
      description: draft.description || '',
      analysis: null
    }))
  },
  ensureCategory(name, token) {
    const cat = String(name || '').trim()
    if (!cat) return Promise.resolve('')
    const cached = (this._remoteCats || []).find((item) => item.name === cat)
    if (cached) return Promise.resolve(cached.id)
    const q = `
      query FindCat($where: course_category_bool_exp) {
        course_category(where: $where, limit: 1) { id name }
      }
    `
    return graphqlRequest(q, { where: eqText('name', cat) }, token).then((data) => {
      const hit = (data.course_category || [])[0]
      if (hit) {
        this._remoteCats = (this._remoteCats || []).concat([hit])
        return hit.id
      }
      const mutation = `
        mutation AddCat($object: course_category_insert_input!) {
          insert_course_category_one(object: $object) { id name }
        }
      `
      return graphqlRequest(mutation, {
        object: { name: cat, sort_order: ((this._remoteCats || []).length + 1) }
      }, token).then((created) => {
        const row = created.insert_course_category_one
        this._remoteCats = (this._remoteCats || []).concat([row])
        return row.id
      })
    }).catch(() => '')
  },
  insertCourse(payload, token) {
    const mutation = `
      mutation ArchiveCourse($object: course_insert_input!) {
        insert_course_one(object: $object) { id title }
      }
    `
    const object = {
      title: payload.title,
      description: payload.description || '',
      price: 0,
      member_free: true,
      source_type: config.sourceAdmin,
      status: config.statusOnShelf,
      uploader_id: payload.account.id
    }
    if (payload.categoryId) object.category_id_id = payload.categoryId
    if (payload.fileId) object.original_file_id = payload.fileId
    if (payload.analysis) object.ai_analysis = payload.analysis
    return graphqlRequest(mutation, { object: object }, token).then((data) => data.insert_course_one)
  },
  onGoCatalog() {
    wx.switchTab({ url: '/pages/index/index' })
  }
})
