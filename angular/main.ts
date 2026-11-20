import '@angular/compiler'
import { Component, computed, effect, signal } from '@angular/core'
import { HttpErrorResponse, httpResource, provideHttpClient, withFetch } from '@angular/common/http'
import { bootstrapApplication } from '@angular/platform-browser'
import {
  availableTags, dateTimeLabel, filterNews, getRead, groupByDay, parseDigest, readFilters, saveRead, toggleRead, writeFilters,
  type Filters, type News,
} from '../shared/digest'
import '../shared/styles.css'

@Component({
  selector: 'digest-app',
  standalone: true,
  template: `
    <a class="skip-link" href="#feed">К ленте</a>
    <header class="top"><div class="wrap top-inner">
      <a class="brand" href="./">Радар технологий</a>
      <a class="edition" href="../">Версия на React</a>
    </div></header>
    <main id="feed" class="wrap main">
      <div class="masthead"><h1>Дайджест новостей</h1><p>Разработка и технологии. Короткие пересказы со ссылками на источники.</p></div>
      @if (digest.isLoading()) {
        <p class="notice" role="status">Загрузка дайджеста…</p>
      } @else if (error()) {
        <div class="notice error"><p role="alert">{{ error() }}</p><button type="button" (click)="digest.reload()">Повторить</button></div>
      } @else {
        <section class="filters" aria-label="Фильтры новостей">
          <div class="field">
            <label for="query">Поиск</label>
            <input id="query" type="search" placeholder="Заголовок или пересказ" [value]="filters().query" (input)="update({query: $any($event.target).value})">
          </div>
          <div class="field">
            <label for="tag">Тег</label>
            <select id="tag" [value]="filters().tag" (change)="update({tag: $any($event.target).value})">
              <option value="">Все теги</option>
              @if (filters().tag && !tags().includes(filters().tag)) { <option [value]="filters().tag">{{ filters().tag }}</option> }
              @for (tag of tags(); track tag) { <option [value]="tag">{{ tag }}</option> }
            </select>
          </div>
          <label class="checkbox"><input type="checkbox" [checked]="filters().unreadOnly" (change)="update({unreadOnly: $any($event.target).checked})">Только непрочитанные</label>
        </section>
        <p class="counter" role="status">Показано {{ visible().length }} из {{ news().length }}</p>
        @if (!visible().length) { <p class="notice">Новостей не найдено</p> }
        @for (day of days(); track day.key) {
          <section class="day" [attr.aria-labelledby]="'day-' + day.key">
            <h2 [id]="'day-' + day.key">{{ day.label }}</h2>
            <div class="cards">
              @for (item of day.articles; track item.id) {
                <article class="card" [class.is-read]="read().has(item.id)">
                  <div class="card-meta"><strong>{{ item.source }}</strong><time [attr.datetime]="item.date">{{ label(item.date) }}</time></div>
                  <h3><a [href]="item.link" target="_blank" rel="noreferrer">{{ item.title }}</a></h3>
                  <p>{{ item.summary }}</p>
                  <div class="card-footer">
                    <ul class="tags" aria-label="Теги">@for (tag of item.tags; track tag) { <li>{{ tag }}</li> }</ul>
                    <button type="button" [attr.aria-pressed]="read().has(item.id)" [attr.aria-label]="'Отметить прочитанным: ' + item.title" (click)="toggle(item.id)">
                      {{ read().has(item.id) ? 'Прочитано ✓' : 'Отметить прочитанным' }}
                    </button>
                  </div>
                </article>
              }
            </div>
          </section>
        }
      }
    </main>
  `,
})
class DigestApp {
  readonly url = import.meta.env.VITE_DIGEST_URL
  readonly digest = httpResource<News[]>(() => this.url || undefined, { parse: parseDigest })
  readonly filters = signal(readFilters(new URLSearchParams(location.search)))
  readonly read = signal(getRead())
  readonly news = computed(() => this.digest.hasValue() ? this.digest.value() : [])
  readonly tags = computed(() => availableTags(this.news()))
  readonly visible = computed(() => filterNews(this.news(), this.filters(), this.read()))
  readonly days = computed(() => groupByDay(this.visible()))
  readonly label = dateTimeLabel
  readonly error = computed(() => {
    if (!this.url) return 'Задайте адрес дайджеста в VITE_DIGEST_URL.'
    const error = this.digest.error()
    if (error instanceof HttpErrorResponse) {
      return error.status ? 'Дайджест не загрузился: код ' + error.status + '.' : 'Дайджест не загрузился: ошибка сети.'
    }
    return error instanceof Error ? error.message : ''
  })

  constructor() {
    effect(() => saveRead(this.read()))
  }

  update(patch: Partial<Filters>) {
    this.filters.update(current => ({ ...current, ...patch }))
    const query = writeFilters(new URLSearchParams(location.search), this.filters()).toString()
    history.replaceState(history.state, '', location.pathname + (query ? '?' + query : '') + location.hash)
  }

  toggle(id: string) {
    this.read.update(current => toggleRead(current, id))
  }
}

bootstrapApplication(DigestApp, { providers: [provideHttpClient(withFetch())] }).catch(console.error)
