/** @OnlyCurrentDoc */

const COLUMNS = ['id', 'date', 'source', 'title', 'summary', 'tags', 'link']
const SHEET = 'news'
const PUBLIC_LIMIT = 45
const PENDING_LIMIT = 30
const MAX_BATCH = 15
const PENDING = 'pending_'
const ACTIVE = 'active_'
const PUBLIC_EPOCH = 'public_epoch'

function setupDigest() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet()
  if (!spreadsheet) throw new Error('Запустите setupDigest из редактора связанного скрипта.')
  let sheet = spreadsheet.getSheetByName(SHEET)
  if (!sheet) {
    const [first] = spreadsheet.getSheets()
    sheet = spreadsheet.getSheets().length === 1 && first.getLastRow() === 0
      ? first.setName(SHEET) : spreadsheet.insertSheet(SHEET)
  }
  if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS])
  const store = PropertiesService.getScriptProperties()
  if (!store.getProperty('KEY')) store.setProperty('KEY', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''))
  if (!ScriptApp.getProjectTriggers().some(trigger => trigger.getHandlerFunction() === 'syncDigestSheet')) {
    ScriptApp.newTrigger('syncDigestSheet').timeBased().everyMinutes(5).create()
  }
  syncDigestSheet()
}

function doGet() {
  const properties = PropertiesService.getScriptProperties().getProperties()
  const prefix = ACTIVE + properties[PUBLIC_EPOCH] + '_'
  const news = readArticles(properties, prefix).map(([, item]) => item)
  news.sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
  return json({ news })
}

function doPost(event) {
  let body
  try {
    body = JSON.parse(event.postData.contents)
  } catch {
    return json({ error: 'Неверный JSON' })
  }
  const store = PropertiesService.getScriptProperties()
  const key = store.getProperty('KEY')
  if (!key || body?.key !== key) return json({ error: 'Неверный ключ' })
  if (!Array.isArray(body.news) || body.news.length > MAX_BATCH) return json({ error: 'Нужно не больше 15 новостей' })
  const items = body.news.map(normalizeArticle)
  if (items.some(item => !item)) return json({ error: 'Неверные поля новости' })

  const lock = LockService.getScriptLock()
  lock.waitLock(15000)
  try {
    const properties = store.getProperties()
    const prefix = ACTIVE + properties[PUBLIC_EPOCH] + '_'
    const known = new Set([...readArticles(properties, prefix), ...readArticles(properties, PENDING)].map(([, item]) => item.id))
    const pending = {}
    for (const item of items) {
      if (!known.has(item.id)) {
        pending[PENDING + digestId(item.id)] = JSON.stringify(item)
        known.add(item.id)
      }
    }
    if (Object.keys(pending).length + readArticles(properties, PENDING).length > PENDING_LIMIT) {
      return json({ error: 'Очередь заполнена, повторите после синхронизации' })
    }
    if (Object.keys(pending).length) store.setProperties(pending)
    return json({ accepted: Object.keys(pending).length })
  } finally {
    lock.releaseLock()
  }
}

function syncDigestSheet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()?.getSheetByName(SHEET)
  if (!sheet) throw new Error('Лист news недоступен в связанном скрипте.')
  const lock = LockService.getScriptLock()
  lock.waitLock(15000)
  try {
    const store = PropertiesService.getScriptProperties()
    const properties = store.getProperties()
    const [header, ...rows] = sheet.getDataRange().getValues()
    if (!COLUMNS.every((name, index) => header[index] === name)) throw new Error('Неверные заголовки листа news.')
    const queued = readArticles(properties, PENDING)
    if (rows.length && !queued.length && properties[PUBLIC_EPOCH]) return
    const known = new Set(rows.map(row => row[0]))
    const fresh = queued.map(([, item]) => item).filter(item => !known.has(item.id))
    if (fresh.length) {
      const values = fresh.map(item => COLUMNS.map(column => escapeCell(item[column])))
      const range = sheet.getRange(sheet.getLastRow() + 1, 1, values.length, COLUMNS.length)
      range.setNumberFormat('@').setValues(values)
      SpreadsheetApp.flush()
    }
    const latest = [...rows.map(row => normalizeArticle(Object.fromEntries(COLUMNS.map((column, i) => [column, row[i]])))), ...fresh]
      .filter(Boolean).sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, PUBLIC_LIMIT)

    // Новый снимок доступен читателям после переключения указателя.
    const current = properties[PUBLIC_EPOCH]
    for (const key of Object.keys(properties)) {
      if (key.startsWith(ACTIVE) && !key.startsWith(ACTIVE + current + '_')) store.deleteProperty(key)
    }
    const epoch = Utilities.getUuid()
    const snapshot = Object.fromEntries(latest.map(item => [ACTIVE + epoch + '_' + digestId(item.id), JSON.stringify(item)]))
    if (latest.length) store.setProperties(snapshot)
    store.setProperty(PUBLIC_EPOCH, epoch)
    for (const [name] of queued) store.deleteProperty(name)
    for (const key of Object.keys(properties)) {
      if (key.startsWith(ACTIVE)) store.deleteProperty(key)
    }
  } finally {
    lock.releaseLock()
  }
}

function readArticles(properties, prefix) {
  return Object.entries(properties).filter(([key]) => key.startsWith(prefix)).map(([key, value]) => [key, JSON.parse(value)])
}

function normalizeArticle(item) {
  if (!item || typeof item !== 'object') return null
  const date = item.date instanceof Date ? item.date : new Date(item.date)
  const id = String(item.id ?? '').trim()
  const link = String(item.link ?? '').trim()
  const title = String(item.title ?? '').trim().slice(0, 220)
  const summary = String(item.summary ?? '').trim().slice(0, 520)
  const source = String(item.source ?? '').trim().slice(0, 60)
  const tags = (Array.isArray(item.tags) ? item.tags : String(item.tags ?? '').split(','))
    .map(tag => String(tag).trim().slice(0, 24)).filter(Boolean).slice(0, 3).join(', ')
  if (!/^https?:\/\/[\x21-\x7e]+$/i.test(link) || link.length > 360 || id !== link
      || !item.date || !Number.isFinite(date.getTime()) || !title || !summary || !tags || !source) return null
  return { id, date: date.toISOString(), source, title, summary, tags, link }
}

function escapeCell(value) {
  return /^[=+@'\-]/.test(value) ? "'" + value : value
}

function digestId(id) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, id))
}

function json(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON)
}
