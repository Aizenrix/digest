import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const source = readFileSync(new URL('../automation/apps-script/Code.gs', import.meta.url), 'utf8')
const columns = ['id', 'date', 'source', 'title', 'summary', 'tags', 'link']

function script() {
  const properties = new Map([['KEY', 'test-key']])
  const rows = [columns]
  const sheet = {
    getLastRow: () => rows.length,
    getDataRange: () => ({ getValues: () => rows.slice() }),
    getRange: () => ({
      setNumberFormat() { return this },
      setValues: value => rows.push(...value.map(row => row.map(field => field.replace(/^'/, '')))),
    }),
  }
  const context = vm.createContext({
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => sheet }), flush() {} },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => properties.get(key) ?? null,
      getProperties: () => Object.fromEntries(properties),
      setProperty: (key, value) => properties.set(key, value),
      setProperties: values => Object.entries(values).forEach(([key, value]) => properties.set(key, value)),
      deleteProperty: key => properties.delete(key),
    }) },
    Utilities: {
      getUuid: randomUUID,
      DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (algorithm, id) => createHash(algorithm).update(id).digest(),
      base64EncodeWebSafe: bytes => bytes.toString('base64url'),
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ setMimeType: () => text }) },
  })
  vm.runInContext(source, context)
  return { context, rows, properties }
}

const article = {
  link: 'https://example.org/release', id: 'https://example.org/release',
  date: '2026-11-20T08:00:00Z', source: 'Лента', title: '=Тест для ячейки',
  summary: 'Вышло обновление проекта. Релиз опубликован на сайте.', tags: ['программирование'],
}

test('веб-приложение отклоняет запись без ключа и не раскрывает свойства', () => {
  const { context, properties } = script()
  properties.delete('KEY')
  const reply = JSON.parse(context.doPost({ postData: { contents: JSON.stringify({ news: [article] }) } }))
  assert.equal(reply.error, 'Неверный ключ')
  assert.deepEqual(JSON.parse(context.doGet()), { news: [] })
})

test('Apps Script переносит очередь в таблицу и не дублирует статьи', () => {
  const { context, rows } = script()
  const post = () => JSON.parse(context.doPost({ postData: { contents: JSON.stringify({ key: 'test-key', news: [article, article] }) } }))
  assert.deepEqual(post(), { accepted: 1 })
  assert.deepEqual(post(), { accepted: 0 })
  assert.deepEqual(JSON.parse(context.doGet()), { news: [] })
  context.syncDigestSheet()
  assert.equal(rows.length, 2)
  const [saved] = JSON.parse(context.doGet()).news
  assert.equal(saved.id, article.id)
  assert.equal(saved.tags, 'программирование')
  assert.equal(saved.title, article.title)
  assert.deepEqual(post(), { accepted: 0 })
  context.syncDigestSheet()
  assert.equal(rows.length, 2)
})

const workflow = name => JSON.parse(readFileSync(new URL('../automation/n8n/' + name + '.json', import.meta.url), 'utf8'))

test('экспорты имеют два времени запуска и нужную цепочку', () => {
  const morning = workflow('morning')
  const evening = workflow('evening')
  assert.equal(morning.nodes.find(node => node.type.endsWith('scheduleTrigger')).parameters.rule.interval[0].triggerAtHour, 8)
  assert.equal(evening.nodes.find(node => node.type.endsWith('scheduleTrigger')).parameters.rule.interval[0].triggerAtHour, 19)
  assert.equal(morning.nodes.find(node => node.name === 'Запись в таблицу').executeOnce, true)
  assert.ok(evening.nodes.some(node => node.type.endsWith('.telegram')))
})

test('вечернее сообщение фильтрует теги и укладывается в длину Telegram', () => {
  const code = workflow('evening').nodes.find(node => node.name === 'Текст сообщения').parameters.jsCode
  const news = Array.from({ length: 28 }, (_, i) => ({
    date: new Date().toISOString(), title: 'Новость ' + i + ' ' + 'а'.repeat(180),
    tags: i === 0 ? 'нежелательный' : 'программирование, наука', source: 'Лента', link: 'https://example.org/' + i,
  }))
  const result = new Function('$input', '$env', code)({ first: () => ({ json: { news } }) }, {
    DIGEST_TAGS: 'программирование', DIGEST_SITE: 'https://example.org/digest/',
  })
  assert.equal(result.length, 1)
  assert.ok(result[0].json.text.length < 4096)
  assert.match(result[0].json.text, /Новостей: 27/)
  assert.match(result[0].json.text, /Ещё на сайте/)
  assert.doesNotMatch(result[0].json.text, /example\.org\/0\n/)
})
