export type News = {
  id: string
  date: string
  source: string
  title: string
  summary: string
  tags: string[]
  link: string
}
export type Filters = { query: string; tag: string; unreadOnly: boolean }
export const READ_KEY = 'digest.read.v1'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

function isLink(value: string) {
  try {
    return ['https:', 'http:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

export function parseDigest(data: unknown): News[] {
  if (!isRecord(data) || !Array.isArray(data.news)) {
    throw new Error('Дайджест не загрузился: неверный формат данных.')
  }
  const news = data.news.flatMap((item): News[] => {
    if (!isRecord(item)) return []
    const { id, date, source, title, summary, tags, link } = item
    if (typeof id !== 'string' || !id.trim() || typeof date !== 'string' || !Number.isFinite(Date.parse(date))
      || typeof source !== 'string' || !source.trim() || typeof title !== 'string' || !title.trim()
      || typeof summary !== 'string' || !summary.trim() || typeof tags !== 'string'
      || typeof link !== 'string' || !isLink(link)) return []
    return [{ id, date, source, title, summary, link, tags: [...new Set(tags.split(',').map(tag => tag.trim()).filter(Boolean))] }]
  })
  news.sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
  const seen = new Set<string>()
  return news.filter(item => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

export async function loadDigest(url: string | undefined, signal: AbortSignal) {
  if (!url?.trim()) throw new Error('Задайте адрес дайджеста в VITE_DIGEST_URL.')
  const response = await fetch(url, { signal, cache: 'no-store' })
  if (!response.ok) throw new Error('Дайджест не загрузился: код ' + response.status + '.')
  const data: unknown = await response.json().catch(() => null)
  return parseDigest(data)
}

export function filterNews(news: News[], { query, tag, unreadOnly }: Filters, read: Set<string>) {
  const term = query.trim().toLocaleLowerCase('ru')
  return news.filter(item =>
    (!tag || item.tags.includes(tag))
    && (!unreadOnly || !read.has(item.id))
    && (!term || item.title.toLocaleLowerCase('ru').includes(term) || item.summary.toLocaleLowerCase('ru').includes(term)),
  )
}

export function availableTags(news: News[]) {
  return [...new Set(news.flatMap(item => item.tags))].sort((a, b) => a.localeCompare(b, 'ru'))
}

export function getRead() {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(READ_KEY) ?? '[]')
    return new Set<string>(Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [])
  } catch {
    return new Set<string>()
  }
}

export function saveRead(read: Set<string>) {
  try {
    window.localStorage.setItem(READ_KEY, JSON.stringify([...read]))
  } catch {
    // Отметки доступны в текущей вкладке, когда хранилище отключено.
  }
}

export function toggleRead(read: Set<string>, id: string) {
  const next = new Set(read)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

const timezone = 'Europe/Moscow'
const dayKey = new Intl.DateTimeFormat('sv-SE', { timeZone: timezone, dateStyle: 'short' })
const formatDay = new Intl.DateTimeFormat('ru-RU', { timeZone: timezone, day: 'numeric', month: 'long' })
const formatTime = new Intl.DateTimeFormat('ru-RU', { timeZone: timezone, hour: '2-digit', minute: '2-digit' })

export function dateTimeLabel(date: string) {
  const time = new Date(date)
  return formatDay.format(time) + ', ' + formatTime.format(time) + ' МСК'
}

export function groupByDay(news: News[], now = new Date()) {
  const days = new Map<string, { key: string; label: string; articles: News[] }>()
  const today = dayKey.format(now)
  const yesterday = dayKey.format(now.getTime() - 86_400_000)
  for (const item of news) {
    const time = new Date(item.date)
    const key = dayKey.format(time)
    if (!days.has(key)) {
      const label = key === today ? 'Сегодня' : key === yesterday ? 'Вчера' : formatDay.format(time)
      days.set(key, { key, label, articles: [] })
    }
    days.get(key)?.articles.push(item)
  }
  return [...days.values()]
}

export function readFilters(search: URLSearchParams): Filters {
  return { query: search.get('q') ?? '', tag: search.get('tag') ?? '', unreadOnly: search.get('unread') === '1' }
}

export function writeFilters(search: URLSearchParams, filters: Filters) {
  const next = new URLSearchParams(search)
  for (const [key, value] of [['q', filters.query], ['tag', filters.tag], ['unread', filters.unreadOnly ? '1' : '']]) {
    if (value) next.set(key, value)
    else next.delete(key)
  }
  return next
}
