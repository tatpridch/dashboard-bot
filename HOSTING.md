# Варианты хостинга Dashboard Bot

Сейчас бот работает локально + ngrok туннель. Для продакшена нужен постоянный сервер.

## 1. VPS (рекомендуется)

### DigitalOcean Droplet
- **Цена**: $4-6/мес (1 vCPU, 512MB-1GB RAM)
- **Плюсы**: полный контроль, статический IP, можно поставить любой софт
- **Деплой**: ssh → git pull → pm2 start
- **URL**: свой домен или IP

### Hetzner Cloud
- **Цена**: €3.29/мес (CX22 — 2 vCPU, 4GB RAM)
- **Плюсы**: дешевле DigitalOcean, серверы в EU
- **Деплой**: аналогично DO

## 2. PaaS (проще всего)

### Railway
- **Цена**: $5/мес (Hobby plan) или бесплатный trial
- **Плюсы**: git push → автодеплой, встроенный домен, переменные окружения в UI
- **Деплой**: подключить GitHub repo → автоматически
- **URL**: *.up.railway.app

### Render
- **Цена**: бесплатный tier (750 часов/мес) или $7/мес
- **Плюсы**: автодеплой из GitHub, бесплатный SSL
- **Минус**: бесплатный tier засыпает после 15 мин неактивности
- **URL**: *.onrender.com

### Fly.io
- **Цена**: бесплатный tier (3 shared VMs)
- **Плюсы**: контейнеры, глобальные регионы, быстрый
- **Деплой**: `fly launch` → `fly deploy`
- **URL**: *.fly.dev

## 3. Serverless (сложнее для бота)

### Vercel / Netlify
- Не подходят напрямую — нужен long-running process для Telegram polling
- Можно переделать на webhook mode, но Express + snapshot storage усложняют

## Рекомендация

Для этого проекта лучший вариант — **Railway** или **Hetzner**:
- Railway если хочется zero-config деплой
- Hetzner если хочется дёшево и с полным контролем

### При переходе на сервер:
1. Поменять Telegraf с polling на webhook (`bot.telegram.setWebhook(url)`)
2. Убрать ngrok — сервер будет иметь свой URL
3. Добавить pm2 или systemd для автоперезапуска
4. Настроить nginx как reverse proxy (опционально)
