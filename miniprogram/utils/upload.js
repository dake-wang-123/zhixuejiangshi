const { graphqlRequest } = require('./graphql.js')

function hexToBase64(hex) {
  const bytes = []
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16))
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0
    const n = (b0 << 16) | (b1 << 8) | b2
    out += chars[(n >> 18) & 63] + chars[(n >> 12) & 63]
    out += i + 1 < bytes.length ? chars[(n >> 6) & 63] : '='
    out += i + 2 < bytes.length ? chars[n & 63] : '='
  }
  return out
}

function getMd5Base64(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileInfo({
      filePath: filePath,
      digestAlgorithm: 'md5',
      success: (info) => resolve(hexToBase64(info.digest)),
      fail: reject
    })
  })
}

function toArrayBuffer(data) {
  if (data && typeof data.byteLength === 'number' && !data.buffer) {
    return data
  }
  if (data && data.buffer && typeof data.byteLength === 'number') {
    const copy = new Uint8Array(data.byteLength)
    copy.set(new Uint8Array(data.buffer, data.byteOffset || 0, data.byteLength))
    return copy.buffer
  }
  const u8 = new Uint8Array(data)
  const buffer = new ArrayBuffer(u8.length)
  new Uint8Array(buffer).set(u8)
  return buffer
}

function guessImageSuffix(filePath) {
  const lower = (filePath || '').toLowerCase()
  if (lower.endsWith('.png')) return 'PNG'
  if (lower.endsWith('.gif')) return 'GIF'
  if (lower.endsWith('.webp')) return 'WEBP'
  return 'JPEG'
}

function guessFileFormat(filePath, name) {
  const lower = ((name || filePath) || '').toLowerCase()
  if (lower.endsWith('.pdf')) return { format: 'PDF', suffix: 'pdf' }
  if (lower.endsWith('.doc')) return { format: 'DOC', suffix: 'doc' }
  if (lower.endsWith('.docx')) return { format: 'DOCX', suffix: 'docx' }
  if (lower.endsWith('.ppt')) return { format: 'PPT', suffix: 'ppt' }
  if (lower.endsWith('.pptx')) return { format: 'PPTX', suffix: 'pptx' }
  if (lower.endsWith('.txt')) return { format: 'TXT', suffix: 'txt' }
  if (lower.endsWith('.md')) return { format: 'TXT', suffix: 'md' }
  return { format: 'OTHER', suffix: 'bin' }
}

function putFile(uploadUrl, uploadHeaders, filePath) {
  const fs = wx.getFileSystemManager()
  let fileData = fs.readFileSync(filePath)
  const body = toArrayBuffer(fileData)
  const header = Object.assign({ 'Content-Type': 'application/octet-stream' }, uploadHeaders || {})
  return new Promise((resolve, reject) => {
    wx.request({
      url: uploadUrl,
      method: 'PUT',
      data: body,
      header: header,
      responseType: 'text',
      success: (res) => {
        if (res.statusCode === 200 || res.statusCode === 204) resolve()
        else reject(new Error('上传失败 ' + res.statusCode))
      },
      fail: reject
    })
  })
}

function uploadImage(filePath, token) {
  let localPath = filePath
  const start = Promise.resolve()
  return start
    .then(() => {
      if (localPath.indexOf('http://') === 0 || localPath.indexOf('https://') === 0) {
        return new Promise((resolve, reject) => {
          wx.downloadFile({
            url: localPath,
            success: (res) => {
              if (res.statusCode === 200 && res.tempFilePath) resolve(res.tempFilePath)
              else reject(new Error('下载头像失败'))
            },
            fail: reject
          })
        })
      }
      return localPath
    })
    .then((path) => {
      localPath = path
      return getMd5Base64(localPath)
    })
    .then((md5) => {
      const suffix = guessImageSuffix(localPath)
      const query = `mutation GetImagePresignedUrl($md5: String!, $suffix: MediaFormat!) {
        imagePresignedUrl(imgMd5Base64: $md5, imageSuffix: $suffix, acl: PRIVATE) {
          imageId uploadUrl uploadHeaders
        }
      }`
      return graphqlRequest(query, { md5: md5, suffix: suffix }, token)
    })
    .then((data) => {
      const info = data.imagePresignedUrl
      return putFile(info.uploadUrl, info.uploadHeaders, localPath).then(() => info.imageId)
    })
}

function uploadFile(filePath, name, token) {
  return getMd5Base64(filePath).then((md5) => {
    const guessed = guessFileFormat(filePath, name)
    const query = `mutation GetFilePresignedUrl($md5: String!, $format: MediaFormat!, $name: String, $suffix: String) {
      filePresignedUrl(md5Base64: $md5, format: $format, name: $name, suffix: $suffix, acl: PRIVATE) {
        fileId uploadUrl uploadHeaders
      }
    }`
    return graphqlRequest(query, {
      md5: md5,
      format: guessed.format,
      name: name || '教案',
      suffix: guessed.suffix
    }, token).then((data) => {
      const info = data.filePresignedUrl
      return putFile(info.uploadUrl, info.uploadHeaders, filePath).then(() => info.fileId)
    })
  })
}

function getImageUrl(imageId, token) {
  if (!imageId) return Promise.resolve('')
  const query = `query GetImageById($imageId: bigint!) {
    getImageById(imageId: $imageId) { id url }
  }`
  return graphqlRequest(query, { imageId: imageId }, token).then((data) => {
    return (data.getImageById && data.getImageById.url) || ''
  })
}

module.exports = {
  uploadImage: uploadImage,
  uploadFile: uploadFile,
  getImageUrl: getImageUrl,
  guessFileFormat: guessFileFormat
}
