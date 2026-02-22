# Dashboard Bot — Telegram бот для анализа данных и генерации дашбордов

## Что сделано

Полностью рабочий Telegram бот, который:
1. Принимает файлы (CSV, XLSX, JSON, HTML, TSV, etc.) или текстовые данные
2. Парсит их на сервере (Node.js)
3. Отправляет Claude Sonnet 4.5 для анализа с промптом data-аналитика
4. Получает структурированный JSON (AnalysisMeta) с метриками, датасетами, графиками
5. Генерирует standalone HTML дашборд с D3.js v7 (CDN) и inline-скриптами
6. Сохраняет как snapshot с 7-дневным TTL
7. Возвращает ссылку через ngrok

## Архитектура

```
User → Telegram Bot (Telegraf, polling) → Parse file → Claude API
                                                          ↓
                                              AnalysisMeta JSON
                                                          ↓
                                    HTML Generator (D3 inline scripts)
                                                          ↓
                              Snapshot storage → Express /s/:slug
                                                          ↓
                                    Bot sends ngrok link to user
```

## Стек
- **Runtime**: Node.js + tsx
- **Bot**: Telegraf (polling mode)
- **AI**: @anthropic-ai/sdk, model: claude-sonnet-4-5-20250929
- **Server**: Express на порту 3000
- **Парсер**: xlsx для spreadsheets, regex для HTML таблиц
- **Визуализация**: D3.js v7 CDN, inline scripts в HTML
- **Туннель**: ngrok → https://intershifting-haply-lawerence.ngrok-free.dev

## Структура файлов

```
src/
├── index.ts          — Express + Telegraf запуск
├── bot.ts            — Обработчики: /start, /help, документы, текст
├── analyzer.ts       — Claude API с системным промптом аналитика
├── file-parser.ts    — Парсер файлов (адаптирован из autodashboard-skybridge)
├── html-generator.ts — Генерация standalone HTML с D3 графиками
├── snapshots.ts      — Файловое хранилище снапшотов (7-дневный TTL)
└── types.ts          — AnalysisMeta, Dataset, Metric
```

## Поддерживаемые графики
- bar / bar_horizontal — столбчатые с анимацией
- timeline — линейный с area и animated line draw
- donut — круговая с arc-tween
- treemap — пропорциональная карта
- table — HTML таблица со sticky header

## Что нужно доделать

### Баги / стабильность
- [ ] Обработка больших файлов (>20MB) — Telegram лимит
- [ ] Fallback если Claude вернёт невалидный JSON
- [ ] Таймаут для Claude API запросов
- [ ] Обработка фото/изображений (OCR?)

### Фичи
- [ ] Кнопки "Dig Deeper" в Telegram (inline keyboard → повторный анализ)
- [ ] Поддержка нескольких файлов за раз
- [ ] Кэширование — не анализировать один и тот же файл дважды
- [ ] Превью дашборда как скриншот (puppeteer) в Telegram
- [ ] Мультиязычность (русский/английский) в промпте анализа
- [ ] Responsive дизайн для мобильных дашбордов

### Деплой
- [ ] Перенести на VPS/облако (см. HOSTING.md)
- [ ] Webhook вместо polling для продакшена
- [ ] Rate limiting
- [ ] Логирование в файл

## Как запустить

```bash
cd /Users/tpridchenko/dashboard-bot
npm install
# Заполнить .env (TELEGRAM_BOT_TOKEN, ANTHROPIC_API_KEY, BASE_URL)
npx tsx src/index.ts
# В отдельном терминале: ngrok http 3000
```

## Связанный проект
Код парсера, типов и снапшотов адаптирован из `autodashboard-skybridge` — Skybridge MCP приложение с D3 дашбордами.
