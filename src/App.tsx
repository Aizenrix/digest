import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { availableTags, dateTimeLabel, filterNews, getRead, groupByDay, loadDigest, readFilters, saveRead, toggleRead, writeFilters, type Filters, type News } from '../shared/digest'

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; news: News[] }

function NewsCard({ item, read, onToggle }: { item: News; read: boolean; onToggle: () => void }) {
  return (
    <article className={'card' + (read ? ' is-read' : '')}>
      <div className="card-meta"><strong>{item.source}</strong><time dateTime={item.date}>{dateTimeLabel(item.date)}</time></div>
      <h3><a href={item.link} target="_blank" rel="noreferrer">{item.title}</a></h3>
      <p>{item.summary}</p>
      <div className="card-footer">
        <ul className="tags" aria-label="Теги">{item.tags.map(tag => <li key={tag}>{tag}</li>)}</ul>
        <button type="button" aria-pressed={read} aria-label={'Отметить прочитанным: ' + item.title} onClick={onToggle}>
          {read ? 'Прочитано ✓' : 'Отметить прочитанным'}
        </button>
      </div>
    </article>
  )
}

export function App() {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [reload, setReload] = useState(0)
  const [read, setRead] = useState(getRead)
  const [search, setSearch] = useSearchParams()
  const filters = readFilters(search)

  useEffect(() => {
    const controller = new AbortController()
    loadDigest(import.meta.env.VITE_DIGEST_URL, controller.signal)
      .then(news => { if (!controller.signal.aborted) setState({ status: 'ready', news }) })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        const message = error instanceof TypeError ? 'Дайджест не загрузился: ошибка сети.' : String(error instanceof Error ? error.message : error)
        setState({ status: 'error', message })
      })
    return () => controller.abort()
  }, [reload])

  useEffect(() => { saveRead(read) }, [read])

  const news = state.status === 'ready' ? state.news : []
  const tags = availableTags(news)
  const visible = filterNews(news, filters, read)
  const days = groupByDay(visible)
  const update = (patch: Partial<Filters>) => setSearch(writeFilters(search, { ...filters, ...patch }), { replace: true })

  return (
    <>
      <a className="skip-link" href="#feed">К ленте</a>
      <header className="top"><div className="wrap top-inner">
        <a className="brand" href={import.meta.env.BASE_URL}>Радар технологий</a>
        <a className="edition" href={import.meta.env.BASE_URL + 'angular/'}>Версия на Angular</a>
      </div></header>
      <main id="feed" className="wrap main">
        <div className="masthead">
          <h1>Дайджест новостей</h1>
          <p>Разработка и технологии. Короткие пересказы со ссылками на источники.</p>
        </div>

        {state.status === 'loading' && <p className="notice" role="status">Загрузка дайджеста…</p>}
        {state.status === 'error' && (
          <div className="notice error">
            <p role="alert">{state.message}</p>
            <button type="button" onClick={() => { setState({ status: 'loading' }); setReload(reload + 1) }}>Повторить</button>
          </div>
        )}
        {state.status === 'ready' && (
          <>
            <section className="filters" aria-label="Фильтры новостей">
              <div className="field">
                <label htmlFor="query">Поиск</label>
                <input id="query" type="search" placeholder="Заголовок или пересказ" value={filters.query} onChange={event => update({ query: event.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="tag">Тег</label>
                <select id="tag" value={filters.tag} onChange={event => update({ tag: event.target.value })}>
                  <option value="">Все теги</option>
                  {filters.tag && !tags.includes(filters.tag) && <option value={filters.tag}>{filters.tag}</option>}
                  {tags.map(tag => <option key={tag}>{tag}</option>)}
                </select>
              </div>
              <label className="checkbox"><input type="checkbox" checked={filters.unreadOnly} onChange={event => update({ unreadOnly: event.target.checked })} />Только непрочитанные</label>
            </section>
            <p className="counter" role="status">Показано {visible.length} из {news.length}</p>
            {visible.length === 0 && <p className="notice">Новостей не найдено</p>}
            {days.map(day => (
              <section className="day" key={day.key} aria-labelledby={'day-' + day.key}>
                <h2 id={'day-' + day.key}>{day.label}</h2>
                <div className="cards">
                  {day.articles.map(item => <NewsCard key={item.id} item={item} read={read.has(item.id)} onToggle={() => setRead(current => toggleRead(current, item.id))} />)}
                </div>
              </section>
            ))}
          </>
        )}
      </main>
    </>
  )
}
