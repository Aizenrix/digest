import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'

const news = [
  { id: 'mars', date: '2026-11-20T05:00:00Z', source: 'Космос', title: 'Зонд у Марса', summary: 'Аппарат передал фотографии поверхности.', tags: 'наука, космос', link: 'https://example.org/mars' },
  { id: 'rust', date: '2026-11-20T08:00:00Z', source: 'Разработка', title: 'Обновление Rust', summary: 'Компилятор получил улучшения.', tags: 'программирование', link: 'https://example.org/rust' },
  { id: 'ai', date: '2026-11-20T07:00:00Z', source: 'Лаборатория', title: 'Новая модель', summary: 'Команда исследовала поверхность Марса.', tags: 'ИИ, наука', link: 'https://example.org/ai' },
]

function Location() {
  return <div aria-label="Текущий адрес">{useLocation().search}</div>
}

function mount(route = '/') {
  return render(<MemoryRouter initialEntries={[route]}><App /><Location /></MemoryRouter>)
}

async function showNews() {
  const fetchMock = vi.fn(async () => Response.json({ news }))
  vi.stubGlobal('fetch', fetchMock)
  const view = mount()
  await screen.findByRole('heading', { name: 'Обновление Rust' })
  return { view, fetchMock, user: userEvent.setup() }
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('дайджест', () => {
  it('показывает новые записи первыми и открывает источник в новой вкладке', async () => {
    const { fetchMock } = await showNews()
    expect(screen.getAllByRole('article').map(card => within(card).getByRole('heading').textContent))
      .toEqual(['Обновление Rust', 'Новая модель', 'Зонд у Марса'])
    const article = screen.getAllByRole('article')[0]
    expect(within(article).getByRole('link').getAttribute('target')).toBe('_blank')
    expect(within(article).getByRole('link').getAttribute('href')).toBe(news[1].link)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('ищет в заголовке и пересказе без учёта регистра', async () => {
    const { user } = await showNews()
    const search = screen.getByRole('searchbox', { name: 'Поиск' })
    await user.type(search, 'МАРСА')
    expect(screen.getAllByRole('article')).toHaveLength(2)
    expect(screen.queryByText('Обновление Rust')).toBeNull()
  })

  it('выбирает один тег и показывает отдельные метки', async () => {
    const { user } = await showNews()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Тег' }), 'ИИ')
    const card = screen.getByRole('article')
    expect(within(card).getByRole('heading').textContent).toBe('Новая модель')
    expect(within(card).getAllByRole('listitem').map(item => item.textContent)).toEqual(['ИИ', 'наука'])
  })

  it('сохраняет отметку после повторного открытия и снимает вторым нажатием', async () => {
    const { view, user } = await showNews()
    const button = () => screen.getByRole('button', { name: 'Отметить прочитанным: Обновление Rust' })
    await user.click(button())
    expect(button().getAttribute('aria-pressed')).toBe('true')
    view.unmount()
    mount()
    await screen.findByText('Обновление Rust')
    expect(button().getAttribute('aria-pressed')).toBe('true')
    await user.click(button())
    expect(button().getAttribute('aria-pressed')).toBe('false')
  })

  it('комбинирует все три фильтра и показывает пустой результат', async () => {
    const { user } = await showNews()
    await user.selectOptions(screen.getByRole('combobox'), 'наука')
    await user.type(screen.getByRole('searchbox'), 'поверхности')
    const button = screen.getByRole('button', { name: 'Отметить прочитанным: Зонд у Марса' })
    await user.click(button)
    await user.click(screen.getByRole('checkbox', { name: 'Только непрочитанные' }))
    expect(screen.queryByRole('article')).toBeNull()
    expect(screen.getByText('Новостей не найдено')).toBeTruthy()
    expect(screen.getByLabelText('Текущий адрес').textContent).toContain('unread=1')
  })

  it('читает поиск и тег из прямой ссылки', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ news })))
    mount('/?q=марса&tag=ИИ')
    await screen.findByRole('heading', { name: 'Новая модель' })
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('марса')
  })

  it('объявляет загрузку и сообщает код ответа при HTTP 500', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 500 })))
    mount()
    expect(screen.getByRole('status').textContent).toBe('Загрузка дайджеста…')
    expect((await screen.findByRole('alert')).textContent).toBe('Дайджест не загрузился: код 500.')
  })

  it('сообщает об ошибке сети и позволяет повторить загрузку', async () => {
    const mock = vi.fn().mockRejectedValueOnce(new TypeError('network')).mockResolvedValueOnce(Response.json({ news }))
    vi.stubGlobal('fetch', mock)
    mount()
    expect((await screen.findByRole('alert')).textContent).toContain('ошибка сети')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Повторить' }))
    await screen.findByText('Обновление Rust')
    expect(mock).toHaveBeenCalledTimes(2)
  })
})
