# 🛒 MarketPulse — Price Tracker & Market Analytics

> Fullstack проект для практики: React + NestJS + Redis + BullMQ + PostgreSQL + Docker + AWS + SSE + Nginx + MCP + CI/CD

---

## 💡 Описание проекта

**MarketPulse** — сервис мониторинга цен на товары маркетплейсов (Amazon, AliExpress). Пользователь добавляет ссылку на товар, система периодически скрапит цену через proxy-сервис (ScraperAPI) для обхода банов, хранит историю, уведомляет через SSE когда цена падает ниже порога. Claude-агент анализирует тренды и даёт рекомендации — когда покупать выгоднее.

### Три страницы

| Страница | URL | Описание |
|----------|-----|----------|
| **Dashboard** | `/` | Список отслеживаемых товаров, текущие цены, статус скрапера, real-time алерты |
| **Product Detail** | `/products/:id` | График истории цен, настройка порога алерта, AI-анализ тренда, экспорт CSV |
| **Settings** | `/settings` | Интервал скрапинга, уведомления, управление аккаунтом, статус очередей |

---

## 🏗️ Архитектура

```
┌─────────────────────────────────────────────────────────────────┐
│                         КЛИЕНТ (React)                          │
│   Dashboard │ Product Detail │ Settings                        │
│   TanStack Query + Zustand + SSE EventSource                   │
└──────────────────────┬──────────────────────────────────────────┘
                       │ HTTPS
┌──────────────────────▼──────────────────────────────────────────┐
│                    Nginx (EC2)                                   │
│   Reverse proxy, SSL termination, rate limiting, gzip           │
└──────┬───────────────────────────────────────┬──────────────────┘
       │                                       │
┌──────▼───────────┐                 ┌─────────▼──────────┐
│   NestJS API     │                 │   Static React     │
│   (EC2 / Docker) │                 │   (S3 + CloudFront)│
│                  │                 └────────────────────┘
│  ┌────────────┐  │
│  │ Auth       │  │     ┌──────────────────────────────┐
│  │ Products   │  │     │      BullMQ Workers           │
│  │ Scraper    ├──┼────►│  ScraperWorker               │
│  │ SSE        │  │     │  ExportWorker                │
│  │ MCP Server │  │     │  AlertWorker                 │
│  └────────────┘  │     └──────────┬───────────────────┘
└──────┬───────────┘                │
       │                            │
┌──────▼──────┐  ┌──────────┐  ┌───▼──────────────────┐
│  PostgreSQL │  │  Redis   │  │  ScraperAPI / Oxylabs│
│  (RDS)      │  │(ElastiC.)│  │  (Anti-ban proxy)    │
└─────────────┘  └──────────┘  └──────────────────────┘
       │
┌──────▼──────────────────────────────────────────────┐
│               AWS Services                           │
│  S3 (exports, assets)  │  Lambda (CSV gen, resize)  │
│  CloudWatch (logs)     │  SES (email alerts)        │
│  CloudFront (CDN)      │  Secrets Manager           │
└─────────────────────────────────────────────────────┘
       │
┌──────▼──────────────────────┐
│    MCP Server (Claude AI)    │
│  analyze_price_trend         │
│  predict_best_buy_time       │
│  generate_market_report      │
└─────────────────────────────┘
```

### Почему каждая технология

| Технология | Зачем используется |
|------------|-------------------|
| **React + TanStack Query** | SPA с серверным кэшем, инвалидацией при SSE событии |
| **NestJS** | API сервер, Guards для auth, BullMQ интеграция, SSE |
| **PostgreSQL (RDS)** | История цен (timeseries), пользователи, товары, алерты |
| **Redis (ElastiCache)** | Кэш текущих цен, rate limiting ScraperAPI, distributed lock |
| **BullMQ** | Очередь задач скрапинга (cron + retry + DLQ), экспорта |
| **SSE** | Push уведомления на клиент (цена упала) без WebSocket |
| **Nginx** | Reverse proxy, SSL, rate limiting `/api`, gzip React build |
| **Docker** | Локальная разработка, деплой на EC2 |
| **EC2** | Основной сервер (NestJS + Nginx + Workers) |
| **S3** | Хранение CSV экспортов, скриншотов товаров |
| **Lambda** | Генерация CSV (тяжёлая задача вне основного процесса) |
| **CloudFront** | CDN для React build (быстрая загрузка) |
| **RDS** | Managed PostgreSQL с Multi-AZ, Read Replica |
| **SES** | Email уведомления при срабатывании алерта |
| **Secrets Manager** | DB password, API keys (не в .env файлах) |
| **MCP Server** | Claude анализирует тренды цен через кастомные tools |
| **CI/CD (GitHub Actions)** | Автоматический деплой при push в main |
| **ScraperAPI** | Proxy ротация, headless browser, CAPTCHA solving |

---

## 📁 Структура проекта

```
market-pulse/
├── .github/
│   └── workflows/
│       ├── backend.yml
│       └── frontend.yml
├── CLAUDE.md                    ← главный файл для Claude Code
├── backend/                     ← NestJS
│   ├── src/
│   │   ├── auth/
│   │   ├── products/
│   │   ├── scraper/
│   │   ├── alerts/
│   │   ├── sse/
│   │   ├── export/
│   │   └── mcp/                ← MCP Server
│   ├── Dockerfile
│   └── package.json
├── frontend/                    ← React (Vite)
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard/
│   │   │   ├── ProductDetail/
│   │   │   └── Settings/
│   │   ├── features/
│   │   ├── entities/
│   │   └── shared/
│   ├── Dockerfile
│   └── package.json
├── nginx/
│   └── nginx.conf
├── terraform/                   ← AWS инфраструктура
│   ├── main.tf
│   ├── rds.tf
│   ├── ec2.tf
│   └── s3.tf
├── docker-compose.yml
├── docker-compose.dev.yml
└── .env.example
```

---

## 📋 CLAUDE.md (содержимое файла для проекта)

```markdown
# MarketPulse — CLAUDE.md

## Project Overview
Price tracking SaaS. Users track product prices from Amazon/AliExpress.
Scraper runs via BullMQ workers using ScraperAPI proxy to avoid bans.
Real-time alerts via SSE when price drops below threshold.
Claude AI analyzes trends via MCP Server.

## Architecture
- Backend: NestJS (TypeScript), port 3000
- Frontend: React + Vite, port 5173 (dev) / S3+CloudFront (prod)
- Database: PostgreSQL 16 (local: docker, prod: RDS)
- Cache/Queue: Redis 7 (local: docker, prod: ElastiCache)
- Proxy: ScraperAPI for web scraping

## Sub-Agents

### @scraper-agent
**Role**: Handles all scraping logic, BullMQ jobs, anti-ban patterns
**Files**: backend/src/scraper/**, backend/src/workers/**
**Best practices**:
- Always use ScraperAPI client, never direct fetch to target sites
- Every job must have: attempts: 3, backoff: exponential, removeOnComplete: 100
- Store raw HTML in S3 before parsing (for debugging)
- Log each scrape attempt with jobId, productId, duration, status
- Respect robots.txt: check before adding new target sites
- Use distributed Redis lock per product to prevent duplicate scraping
- Rate: max 1 scrape per product per 30 minutes (configurable in settings)

### @database-agent
**Role**: Migrations, repository pattern, query optimization
**Files**: backend/src/*/repositories/**, migrations/**
**Best practices**:
- All migrations: expand-and-contract pattern (never DROP column directly)
- Every new column: nullable first, backfill, then add constraint
- Always use EXPLAIN ANALYZE before committing any new query
- Index naming: idx_{table}_{columns}
- Use transactions for multi-table writes
- Never SELECT * — always select specific columns
- price_history table is partitioned by month — always include created_at in WHERE
- Use Read Replica for analytics queries (GET /products/:id/history)

### @api-agent
**Role**: NestJS controllers, services, DTOs, Guards
**Files**: backend/src/**/*.controller.ts, backend/src/**/*.service.ts
**Best practices**:
- Validate every input: class-validator + class-transformer
- Every endpoint must have: @UseGuards(JwtAuthGuard), @Throttle()
- Never expose internal errors to client: use exception filters
- Rate limit scraper trigger endpoints: max 5/minute per user
- Idempotency-Key on scrape-trigger POST endpoint
- Use Response DTOs (never return raw DB entity)
- Log every request with requestId (interceptor)
- SSE endpoint: always handle client disconnect (req.on('close'))

### @frontend-agent
**Role**: React components, hooks, TanStack Query, Zustand
**Files**: frontend/src/**
**Best practices**:
- Feature-Sliced Design structure (app/pages/widgets/features/entities/shared)
- Server state: TanStack Query only (no Redux for server data)
- UI state: Zustand (alerts panel open, filters, theme)
- Every data-fetching component: show skeleton, not spinner
- SSE: connect in useEffect, cleanup on unmount (eventSource.close())
- Invalidate TanStack Query cache on SSE price-update event
- Forms: React Hook Form + Zod for validation
- No any types — strict TypeScript
- Optimize re-renders: memo() for ProductCard list items

### @infrastructure-agent
**Role**: Docker, AWS, Terraform, CI/CD
**Files**: terraform/**, .github/workflows/**, docker-compose.yml, nginx/**
**Best practices**:
- Never hardcode secrets — use AWS Secrets Manager
- All AWS resources: tagged with project=market-pulse, env=prod/staging
- Terraform: always plan before apply, store state in S3
- Docker images: multi-stage build, non-root USER, healthcheck
- Nginx: always set rate limits, security headers, gzip
- EC2: use IAM role (not access keys) for S3/Secrets access
- RDS: enable deletion_protection=true in prod
- CI/CD: run tests before build, build before deploy

## Code Style
- TypeScript strict mode everywhere
- ESLint + Prettier enforced in CI
- Commit format: feat/fix/chore/refactor: description
- Branch naming: feature/TASK-N-description
- No console.log in production code — use Logger (NestJS) or structured logging
- All async functions: proper error handling (try/catch or Result type)

## Security Rules
- JWT: access_token 15m, refresh_token 30d, rotation on use
- Passwords: bcrypt cost=12
- SQL: TypeORM only (never raw string interpolation in queries)
- CORS: only allowed origins from env
- CSP headers via Nginx
- Dependency audit: npm audit in CI, fail on high severity
- ScraperAPI key: Secrets Manager only, never in env files committed to git
```

---

# 🗺️ ДЕТАЛЬНЫЙ ПЛАН — ШАГИ ДЛЯ CLAUDE CODE

> Каждый шаг — отдельное задание для Claude Code. Давай по одному.

---

## ═══════════════════════════════════
## ФАЗА 1: ПРОЕКТ И ЛОКАЛЬНАЯ СРЕДА
## ═══════════════════════════════════

---

### ШАГ 1 — Инициализация монорепо и CLAUDE.md

**Задание для Claude Code:**
```
Создай структуру монорепо проекта MarketPulse:

1. Создай корневой package.json с workspaces: ["backend", "frontend"]
2. Создай .gitignore (node_modules, dist, .env*, *.local, .DS_Store, coverage)
3. Создай .env.example со всеми переменными (без реальных значений):
   - DATABASE_URL, REDIS_URL
   - JWT_SECRET, JWT_REFRESH_SECRET
   - SCRAPER_API_KEY
   - AWS_REGION, S3_BUCKET_NAME, S3_BUCKET_EXPORTS
   - AWS_SES_FROM_EMAIL
   - FRONTEND_URL
   - NODE_ENV
4. Создай CLAUDE.md в корне — скопируй содержимое из PROJECT_PLAN.md секции CLAUDE.md
5. Создай папки: backend/, frontend/, nginx/, terraform/, .github/workflows/
6. Инициализируй git: git init, добавь .gitignore
7. Создай README.md с описанием проекта, технологий, как запустить локально

Проверь: все папки созданы, .env.example содержит все нужные переменные.
```

---

### ШАГ 2 — Docker Compose для локальной разработки

**Задание для Claude Code:**
```
Создай docker-compose.yml и docker-compose.dev.yml для локальной разработки MarketPulse.

docker-compose.yml (базовый):
- service: postgres
  image: postgres:16-alpine
  env: POSTGRES_USER=mp_user, POSTGRES_PASSWORD=mp_secret, POSTGRES_DB=market_pulse
  ports: 5432:5432
  volumes: postgres_data:/var/lib/postgresql/data
  healthcheck: pg_isready -U mp_user

- service: redis
  image: redis:7-alpine
  ports: 6379:6379
  command: redis-server --appendonly yes
  volumes: redis_data:/data

- service: redis-commander (UI для Redis)
  image: rediscommander/redis-commander:latest
  ports: 8081:8081
  env: REDIS_HOSTS=local:redis:6379

- service: adminer (UI для PostgreSQL)
  image: adminer:latest
  ports: 8080:8080

docker-compose.dev.yml (override для разработки):
- service: api
  build: context: ./backend, target: development
  volumes: ./backend/src:/app/src (hot reload)
  ports: 3000:3000, 9229:9229 (debugger)
  env_file: .env
  depends_on: postgres (healthy), redis
  command: npm run start:dev

- service: frontend
  build: context: ./frontend, target: development
  volumes: ./frontend/src:/app/src
  ports: 5173:5173
  command: npm run dev -- --host

Команда запуска (добавь в README):
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d

Проверь: все сервисы корректно настроены, healthcheck у postgres работает.
```

---

### ШАГ 3 — NestJS Backend: инициализация и базовая структура

**Задание для Claude Code:**
```
Инициализируй NestJS проект в папке backend/ с TypeScript strict mode.

1. Создай NestJS проект: npm install -g @nestjs/cli && nest new backend --skip-git
2. Установи зависимости:
   npm install @nestjs/config @nestjs/typeorm typeorm pg
   npm install @nestjs/jwt @nestjs/passport passport passport-jwt passport-local
   npm install @nestjs/bull bull bullmq ioredis
   npm install @nestjs/throttler
   npm install @nestjs/swagger swagger-ui-express
   npm install class-validator class-transformer
   npm install bcrypt argon2
   npm install @aws-sdk/client-s3 @aws-sdk/client-ses @aws-sdk/client-secrets-manager
   npm install @aws-sdk/s3-request-presigner
   npm install axios cheerio
   npm install @modelcontextprotocol/sdk
   npm install --save-dev @types/bcrypt @types/passport-jwt @types/passport-local

3. Настрой tsconfig.json: strict: true, paths aliases (@/* → src/*)

4. Создай структуру папок в src/:
   src/
   ├── auth/            (login, register, JWT, refresh tokens)
   ├── users/           (user entity, repository)
   ├── products/        (product entity, CRUD, repository)
   ├── price-history/   (timeseries цен, repository)
   ├── scraper/         (scraper service, ScraperAPI client)
   ├── workers/         (BullMQ processors)
   ├── alerts/          (alert rules, alert events)
   ├── sse/             (SSE controller и сервис)
   ├── export/          (CSV export, S3 upload)
   ├── mcp/             (MCP Server)
   ├── common/          (filters, interceptors, guards, decorators)
   └── config/          (configuration service)

5. Создай src/common/filters/http-exception.filter.ts:
   - Перехватывает все HTTP исключения
   - Возвращает { statusCode, message, timestamp, path }
   - Логирует через Logger

6. Создай src/common/interceptors/logging.interceptor.ts:
   - Логирует: method, url, requestId (uuid), userId, duration, statusCode
   - requestId генерируется и добавляется в заголовок X-Request-ID

7. Создай src/common/interceptors/transform.interceptor.ts:
   - Оборачивает ответ в { data: ..., timestamp: ..., requestId: ... }

8. Настрой main.ts:
   - ValidationPipe globally (whitelist: true, forbidNonWhitelisted: true, transform: true)
   - Swagger на /api/docs
   - CORS только из FRONTEND_URL
   - Helmet для security headers
   - Глобальный exception filter
   - Глобальный transform interceptor

9. Создай Dockerfile для backend (multi-stage: deps → builder → development → production)
   - development stage: npm run start:dev
   - production stage: USER node, CMD node dist/main.js, HEALTHCHECK

Проверь: docker build --target development работает, npm run start:dev запускается.
```

---

### ШАГ 4 — База данных: Entities и Migrations

**Задание для Claude Code:**
```
Создай TypeORM entities и первую миграцию для MarketPulse.

1. Настрой TypeORM в src/config/database.config.ts:
   - type: postgres, url: DATABASE_URL
   - entities: [__dirname + '/../**/*.entity{.ts,.js}']
   - migrations: [__dirname + '/../migrations/*{.ts,.js}']
   - migrationsRun: false
   - logging: ['query', 'error'] в development, только ['error'] в production
   - ssl: { rejectUnauthorized: false } если prod (для RDS)

2. Создай entities:

src/users/user.entity.ts:
  - id: uuid (primary, generated)
  - email: varchar(255), unique, not null
  - passwordHash: varchar не null (bcrypt)
  - name: varchar(100)
  - settings: jsonb (scrapeInterval, emailAlerts: boolean)
  - createdAt, updatedAt (автоматически)
  - @OneToMany → Product, RefreshToken

src/auth/refresh-token.entity.ts:
  - id: uuid
  - tokenHash: varchar(64) — не plaintext!
  - userId: uuid, FK → users
  - expiresAt: timestamptz
  - createdAt: timestamptz

src/products/product.entity.ts:
  - id: uuid
  - userId: uuid, FK → users
  - url: text, not null (ссылка на товар)
  - name: varchar(500) — парсится скрапером
  - imageUrl: text — URL из S3 (мы кэшируем изображение)
  - currentPrice: decimal(12,2)
  - currency: varchar(3) default 'USD'
  - status: enum ('active', 'paused', 'error')
  - alertThreshold: decimal(12,2) nullable — порог для алерта
  - alertEnabled: boolean default false
  - lastScrapedAt: timestamptz nullable
  - nextScrapeAt: timestamptz nullable
  - errorMessage: text nullable
  - scrapesCount: int default 0
  - createdAt, updatedAt
  - @OneToMany → PriceHistory

src/price-history/price-history.entity.ts:
  - id: bigint (BIGSERIAL — много записей)
  - productId: uuid, FK → products
  - price: decimal(12,2)
  - currency: varchar(3)
  - scrapedAt: timestamptz not null (для партиционирования)
  - rawDataS3Key: text nullable (путь к raw HTML в S3)
  - createdAt: timestamptz

  ВАЖНО: добавь комментарий что эта таблица будет партиционирована по scrapedAt

src/alerts/alert-event.entity.ts:
  - id: uuid
  - productId: uuid, FK → products
  - userId: uuid, FK → users
  - type: enum ('price_drop', 'price_spike', 'error')
  - oldPrice: decimal(12,2)
  - newPrice: decimal(12,2)
  - threshold: decimal(12,2)
  - sentAt: timestamptz nullable (когда отправили email)
  - createdAt: timestamptz

3. Создай src/migrations/1700000001-InitialSchema.ts:
   - CREATE TABLE users (все поля)
   - CREATE TABLE refresh_tokens
   - CREATE TABLE products с индексами:
     - idx_products_user_id ON products(user_id)
     - idx_products_next_scrape ON products(next_scrape_at) WHERE status = 'active'
   - CREATE TABLE price_history PARTITION BY RANGE (scraped_at)
   - CREATE TABLE price_history_2024_q4 PARTITION OF price_history
     FOR VALUES FROM ('2024-10-01') TO ('2025-01-01')
   - CREATE TABLE price_history_2025_q1 PARTITION OF price_history
     FOR VALUES FROM ('2025-01-01') TO ('2025-04-01')
   - CREATE INDEX idx_ph_product_scraped ON price_history(product_id, scraped_at DESC)
   - CREATE TABLE alert_events

4. Создай npm scripts в package.json:
   "migration:generate": "typeorm migration:generate"
   "migration:run": "typeorm migration:run"
   "migration:revert": "typeorm migration:revert"

Проверь: npm run migration:run работает без ошибок, все таблицы созданы.
```

---

### ШАГ 5 — Auth модуль: JWT + Refresh Token Rotation

**Задание для Claude Code:**
```
Реализуй auth модуль NestJS с JWT access/refresh токенами и rotation паттерном.

1. src/auth/auth.service.ts:
   - register(dto): хэшируем пароль через bcrypt cost=12, создаём пользователя
   - login(dto): проверяем пароль, создаём access + refresh токены
   - refresh(refreshToken): 
     * Найти токен в БД по хэшу
     * Если не найден → throw UnauthorizedException (возможная кража)
     * Если найден но expired → удалить, throw
     * DELETE старый токен, создать новый (rotation!)
     * При обнаружении reuse (токен уже использован) → удалить ВСЕ токены пользователя
   - logout(refreshToken): удалить токен из БД
   - generateTokens(userId): создаёт access_token (15m) + refresh_token (30d)
   - Refresh токен в БД: хранить SHA-256 хэш, не plaintext

2. src/auth/auth.controller.ts:
   - POST /auth/register → регистрация
   - POST /auth/login → вход
   - POST /auth/refresh → обновление токенов
   - POST /auth/logout → выход (удалить refresh token)
   
   Для refresh и logout: читать refresh_token из httpOnly cookie
   Для login: устанавливать refresh_token как httpOnly cookie (Secure, SameSite=strict)

3. src/auth/strategies/jwt.strategy.ts:
   - Читает токен из Authorization: Bearer header
   - Верифицирует JWT_SECRET
   - Возвращает { userId, email }

4. src/auth/guards/jwt-auth.guard.ts:
   - Расширяет AuthGuard('jwt')

5. src/common/decorators/current-user.decorator.ts:
   - @CurrentUser() — достаёт userId из request

6. DTO с валидацией:
   - RegisterDto: email (IsEmail), password (MinLength 8, Matches regex для сложности), name
   - LoginDto: email, password

7. Throttling на auth endpoints: @Throttle({ default: { limit: 5, ttl: 60000 } })
   - /auth/login: 5 попыток в минуту (защита от brute force)
   - /auth/register: 3 в минуту

8. Добавь @UseGuards(JwtAuthGuard) на все остальные роуты кроме /auth/*

Проверь: POST /auth/register → 201, POST /auth/login → JWT, POST /auth/refresh → новый JWT.
```

---

### ШАГ 6 — Products модуль: CRUD и репозиторий

**Задание для Claude Code:**
```
Реализуй products модуль: CRUD операции, репозиторий паттерн, валидация URL.

1. src/products/products.service.ts:
   - create(userId, dto): создать продукт, поставить в очередь первый скрап
   - findAll(userId): получить все товары пользователя с текущей ценой
   - findOne(userId, productId): один товар (проверить userId === product.userId!)
   - update(userId, productId, dto): обновить порог, паузу
   - remove(userId, productId): удалить товар + историю цен
   - triggerScrape(userId, productId): ручной запуск скрапинга

2. src/products/repositories/product.repository.ts:
   - findByIdAndUserId(id, userId): BOLA защита — всегда проверяем userId
   - findDueForScraping(): товары у которых nextScrapeAt <= NOW() AND status = 'active'
     Использует индекс idx_products_next_scrape
   - updateAfterScrape(id, price, status, nextScrapeAt)

3. src/price-history/price-history.repository.ts:
   - findByProductId(productId, limit, offset): история с пагинацией
     ВАЖНО: добавить scraped_at в WHERE для partition pruning
   - findLatestPrice(productId): последняя цена
   - findPriceStats(productId, days): min, max, avg за N дней (для аналитики)
     Используй Read Replica connection для этого запроса

4. src/products/dto/create-product.dto.ts:
   - url: IsUrl(), только http/https, макс 2000 символов
   - alertThreshold: IsOptional, IsNumber, IsPositive
   - alertEnabled: IsOptional, IsBoolean

5. src/products/dto/product-response.dto.ts:
   - Никогда не возвращаем userId, rawDataS3Key
   - Включаем: id, url, name, imageUrl, currentPrice, currency, status,
     alertThreshold, alertEnabled, lastScrapedAt, priceChange (% от предыдущей цены)

6. src/products/products.controller.ts:
   - GET /products — список товаров пользователя
   - POST /products — добавить товар
   - GET /products/:id — один товар с историей
   - PATCH /products/:id — обновить настройки
   - DELETE /products/:id — удалить
   - POST /products/:id/scrape — ручной запуск
     @Throttle({ default: { limit: 5, ttl: 60 * 1000 } })

7. Swagger документация через @ApiTags, @ApiOperation, @ApiResponse на каждом методе

Проверь: все эндпоинты защищены JwtAuthGuard, BOLA проверка в каждом методе (userId).
```

---

### ШАГ 7 — ScraperAPI клиент и Scraper сервис

**Задание для Claude Code:**
```
Реализуй scraper сервис с использованием ScraperAPI для обхода банов.

1. src/scraper/scraperapi.client.ts:
   ScraperAPI — сервис с proxy ротацией, headless Chrome, CAPTCHA solving.
   Документация: https://www.scraperapi.com/documentation/
   
   Методы:
   - scrapeUrl(url: string, options?: ScraperOptions): Promise<ScraperResult>
     * Использует axios: GET https://api.scraperapi.com/?api_key=KEY&url=TARGET_URL
     * Options: render=true (JavaScript rendering), country_code='us', retry=3
     * Timeout: 60 секунд (ScraperAPI может быть медленным)
     * При 429 (rate limit) → exponential backoff
     * Логировать: requestId, targetUrl, duration, statusCode, attempts
   
   - checkAccountStatus(): проверить остаток запросов в аккаунте

2. src/scraper/parsers/amazon.parser.ts:
   Парсит HTML страницы Amazon:
   - name: title товара (CSS: #productTitle)
   - price: текущая цена (CSS: .a-price-whole + .a-price-fraction)
   - imageUrl: главное фото (CSS: #landingImage data-old-hires)
   - currency: 'USD'
   - Использует cheerio для парсинга HTML
   - Возвращает ParsedProduct | null (если не смог распарсить)

3. src/scraper/parsers/aliexpress.parser.ts:
   Парсит AliExpress:
   - Цена в JSON внутри <script> тега (window.runParams)
   - Достать через regex: /window\.runParams\s*=\s*({.*?});/s
   - Парсить JSON и извлечь name, price, currency

4. src/scraper/scraper.service.ts:
   - scrapeProduct(product: Product): Promise<ScrapeResult>
     * Определить парсер по URL (amazon.com → AmazonParser, aliexpress.com → AliExpressParser)
     * Сохранить raw HTML в S3: key = raw/{productId}/{timestamp}.html
     * Парсить данные
     * Вернуть { name, price, currency, imageUrl, rawS3Key }
   
   - detectParser(url: string): IParser
     * Switch по hostname
     * Если неизвестный сайт → throw UnsupportedSiteException

5. src/scraper/interfaces/parser.interface.ts:
   interface IParser {
     parse(html: string, url: string): ParsedProduct | null;
   }

6. Хранить SCRAPER_API_KEY в AWS Secrets Manager:
   src/config/secrets.service.ts:
   - При старте приложения: загрузить секреты из Secrets Manager
   - Кэшировать в памяти (не обращаться на каждый запрос)
   - В development: брать из .env

Проверь: вручную вызови scrapeProduct с тестовым Amazon URL, убедись что цена парсится.
```

---

### ШАГ 8 — BullMQ: очереди скрапинга и воркеры

**Задание для Claude Code:**
```
Настрой BullMQ очереди для фонового скрапинга с retry, DLQ, cron.

1. Установи зависимости если не установлены:
   npm install @nestjs/bullmq bullmq

2. Создай src/workers/queues.config.ts:
   Три очереди:
   - 'scraping': основная очередь скрапинга
   - 'alerts': очередь для отправки email алертов
   - 'export': очередь для генерации CSV (через Lambda)

3. Настрой BullMQ в AppModule:
   BullModule.forRootAsync с Redis конфигурацией из ConfigService
   BullModule.registerQueue({ name: 'scraping' }, { name: 'alerts' }, { name: 'export' })

4. src/workers/scraping.processor.ts:
   @Processor('scraping')
   
   @Process('scrape-product')
   async scrapeProduct(job: Job<{ productId: string }>):
   - Получить продукт из БД
   - Проверить distributed lock в Redis: SET product:lock:{productId} 1 NX EX 300
     Если locked → skip (другой воркер уже скрапит)
   - Вызвать scraperService.scrapeProduct()
   - Сохранить новую цену в price_history
   - Обновить product.currentPrice, lastScrapedAt, nextScrapeAt (+ interval)
   - Проверить alert: если новая цена <= alertThreshold → добавить в очередь 'alerts'
   - При успехе: удалить Redis lock
   - При ошибке: 
     * Обновить product.status = 'error', product.errorMessage
     * Удалить Redis lock в finally блоке
   
   job options:
   - attempts: 3
   - backoff: { type: 'exponential', delay: 30000 }
   - removeOnComplete: { count: 100 }
   - removeOnFail: { count: 50 }

5. src/workers/alerts.processor.ts:
   @Processor('alerts')
   
   @Process('send-price-alert')
   async sendAlert(job: Job<{ productId, userId, oldPrice, newPrice, threshold }>):
   - Получить пользователя, товар
   - Проверить что alertEnabled = true (могли отключить после добавления в очередь)
   - Отправить email через AWS SES
   - Сохранить AlertEvent в БД (sentAt = now)
   - Отправить SSE событие пользователю

6. src/workers/scraping.scheduler.ts:
   @Injectable()
   - В конструкторе: @InjectQueue('scraping')
   - @Cron('*/5 * * * *') — каждые 5 минут:
     * findDueForScraping() — товары которым пора скрапиться
     * Для каждого: добавить в очередь если нет job с таким productId
     * ВНИМАНИЕ: не добавлять дубли — проверить через getJobs(['waiting', 'active'])
   
   - При старте приложения (@OnApplicationBootstrap):
     * Запустить один раз немедленно для товаров с nextScrapeAt в прошлом

7. src/workers/export.processor.ts:
   @Processor('export')
   
   @Process('generate-csv-export')
   async generateExport(job: Job<{ productId, userId, dateFrom, dateTo }>):
   - Вызвать Lambda функцию через AWS SDK (InvokeCommand)
   - Lambda генерирует CSV и кладёт в S3
   - Получить presigned URL из S3 (expire 1 hour)
   - Отправить SSE событие пользователю: { type: 'export-ready', downloadUrl }

8. Мониторинг очередей — добавь в src/workers/queue-monitor.service.ts:
   - getQueueStats(): { waiting, active, completed, failed } для каждой очереди
   - Используется в Settings страницы через GET /settings/queue-stats

Проверь: создай товар, убедись что через 5 минут появляется запись в price_history.
```

---

### ШАГ 9 — SSE (Server-Sent Events) модуль

**Задание для Claude Code:**
```
Реализуй SSE для real-time уведомлений клиенту о падении цен и статусе скрапинга.

1. src/sse/sse.service.ts:
   - Храни Map<userId, Response[]> — один пользователь может иметь несколько вкладок
   - addClient(userId: string, res: Response): void
   - removeClient(userId: string, res: Response): void
   - sendToUser(userId: string, event: SseEvent): void
     * Если нет клиентов — сохранить в Redis list (буфер на 5 минут) как missed events
     * При подключении нового клиента — отправить пропущенные события
   - sendToAll(event: SseEvent): void (для системных уведомлений)
   
   SseEvent: { type: string, data: Record<string, any>, id: string }

2. src/sse/sse.controller.ts:
   @Controller('sse')
   
   @Get('stream')
   @UseGuards(JwtAuthGuard)
   @Sse()
   stream(@CurrentUser() user, @Req() req, @Res() res):
   - Установить заголовки: Content-Type: text/event-stream, Cache-Control: no-cache, Connection: keep-alive
   - Зарегистрировать клиента: sseService.addClient(userId, res)
   - Отправить missed events из Redis
   - Keepalive ping каждые 30 секунд (чтобы соединение не закрылось proxy)
   - req.on('close'): sseService.removeClient(userId, res) — ОБЯЗАТЕЛЬНО для предотвращения утечки памяти
   - Вернуть Observable через RxJS

3. Типы SSE событий:
   - price-update: { productId, name, oldPrice, newPrice, change, currency }
   - price-alert: { productId, name, newPrice, threshold, currency }
   - scrape-started: { productId, name }
   - scrape-completed: { productId, name, price, currency }
   - scrape-error: { productId, name, error }
   - export-ready: { exportId, downloadUrl, expiresAt }
   - queue-stats: { waiting, active, completed, failed }

4. Обнови scraping.processor.ts — добавь SSE события:
   - При старте job: sseService.sendToUser(userId, { type: 'scrape-started', ... })
   - При успехе: sendToUser({ type: 'scrape-completed', ... })
   - При ошибке: sendToUser({ type: 'scrape-error', ... })

5. Frontend hook (frontend/src/shared/hooks/useSse.ts):
   import { useEffect, useRef } from 'react';
   import { useQueryClient } from '@tanstack/react-query';
   
   export function useSse(userId: string | null) {
     const queryClient = useQueryClient();
     const eventSourceRef = useRef<EventSource | null>(null);
   
     useEffect(() => {
       if (!userId) return;
       
       const es = new EventSource('/api/sse/stream', { withCredentials: true });
       eventSourceRef.current = es;
       
       es.addEventListener('price-update', (e) => {
         const data = JSON.parse(e.data);
         // Инвалидируем кэш TanStack Query — данные обновятся автоматически
         queryClient.invalidateQueries({ queryKey: ['products'] });
         queryClient.invalidateQueries({ queryKey: ['product', data.productId] });
       });
       
       es.addEventListener('price-alert', (e) => {
         const data = JSON.parse(e.data);
         // Добавляем в локальный стор уведомлений (Zustand)
         useAlertsStore.getState().addAlert(data);
       });
       
       es.addEventListener('export-ready', (e) => {
         const { downloadUrl } = JSON.parse(e.data);
         window.open(downloadUrl); // или показать toast
       });
       
       es.onerror = () => {
         // EventSource автоматически переподключается
       };
       
       // ОБЯЗАТЕЛЬНО закрыть при unmount
       return () => {
         es.close();
         eventSourceRef.current = null;
       };
     }, [userId, queryClient]);
   }

Проверь: открой /api/sse/stream в браузере, вручную вызови sseService.sendToUser — данные должны прийти.
```

---

### ШАГ 10 — MCP Server для Claude AI

**Задание для Claude Code:**
```
Создай MCP (Model Context Protocol) сервер, который предоставляет Claude инструменты для анализа цен.

1. src/mcp/mcp.server.ts:
   Используй @modelcontextprotocol/sdk
   
   Инициализируй Server с тремя tools:

   Tool 1: analyze_price_trend
   Описание: "Analyze price history of a product and identify trend"
   Input: { productId: string, days: number (7-90) }
   Handler:
   - Получить историю цен из БД за N дней
   - Рассчитать: min, max, avg, медиану, стандартное отклонение, % изменения
   - Вернуть статистику + сырые данные в виде JSON
   - Claude получит эти данные и напишет текстовый анализ

   Tool 2: predict_best_buy_time
   Описание: "Based on historical price patterns, suggest optimal time to buy"
   Input: { productId: string }
   Handler:
   - Получить данные за последние 90 дней
   - Рассчитать паттерны по дням недели (понедельник обычно дешевле?)
   - Рассчитать паттерны по числам месяца
   - Вернуть { dayOfWeek: { Mon: avgPrice, Tue: avgPrice... }, dayOfMonth: {...} }

   Tool 3: generate_market_report
   Описание: "Generate a comprehensive price analysis report for a product"
   Input: { productId: string }
   Handler:
   - Объединить данные из analyze_price_trend и predict_best_buy_time
   - Добавить текущую цену vs средняя
   - Определить: сейчас покупать выгодно или нет (сравни с avg)
   - Вернуть структурированный JSON

2. src/mcp/mcp.module.ts и регистрация в AppModule

3. src/mcp/mcp.controller.ts:
   - POST /mcp/analyze/:productId
     Вызывает Claude API через Anthropic SDK с tools из MCP сервера
     Возвращает текстовый анализ от Claude
   - GET /mcp/report/:productId
     Полный отчёт с рекомендацией

4. Настрой Anthropic SDK:
   npm install @anthropic-ai/sdk
   
   В сервисе:
   const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
   const response = await anthropic.messages.create({
     model: 'claude-opus-4-6',
     max_tokens: 1024,
     tools: mcpServer.getTools(),
     messages: [{ role: 'user', content: 'Analyze price trend for this product...' }],
   });

5. ANTHROPIC_API_KEY — добавить в Secrets Manager, в .env.example

Проверь: POST /mcp/analyze/:productId возвращает текстовый анализ от Claude.
```

---

### ШАГ 11 — AWS S3: хранение файлов

**Задание для Claude Code:**
```
Реализуй S3 интеграцию для хранения raw HTML, изображений товаров, CSV экспортов.

1. src/storage/s3.service.ts:
   Используй @aws-sdk/client-s3 и @aws-sdk/s3-request-presigner
   
   Методы:
   
   - uploadRawHtml(productId: string, html: string): Promise<string>
     * key: raw/{productId}/{Date.now()}.html
     * ContentType: text/html
     * Вернуть S3 key (не URL — URL генерируем отдельно)
   
   - uploadProductImage(productId: string, imageBuffer: Buffer, mimeType: string): Promise<string>
     * Скачать изображение с оригинального URL (axios)
     * key: images/{productId}/main.{ext}
     * ContentType: image/jpeg или image/png
     * Кэшировать в Redis: product:image:{productId} → s3Key (TTL 24h)
   
   - generatePresignedUrl(key: string, expiresIn: number = 3600): Promise<string>
     * Для скачивания CSV экспортов
     * GetObjectCommand + getSignedUrl
   
   - uploadCsvExport(userId: string, csv: string): Promise<string>
     * key: exports/{userId}/{Date.now()}.csv
     * ContentType: text/csv
     * Вернуть presigned URL (expire 1 hour)
   
   - deleteOldRawHtml(productId: string, keepLast: number = 10):
     * Удалить старые raw HTML файлы (оставить только keepLast штук)
     * Вызывается после каждого успешного скрапинга

2. Два S3 бакета:
   - market-pulse-assets: изображения товаров (публичный доступ для чтения)
   - market-pulse-private: raw HTML + CSV экспорты (приватный, только presigned URLs)

3. Конфигурация в локальной разработке:
   Используй LocalStack (эмулятор AWS) в docker-compose:
   - image: localstack/localstack
   - ports: 4566:4566
   - environment: SERVICES=s3,ses,secretsmanager
   
   Создать бакеты при старте через init script

4. В S3Service: если AWS_REGION не задан → использовать LocalStack endpoint

Проверь: загрузи тестовый HTML через uploadRawHtml, убедись что файл появился в S3/LocalStack.
```

---

### ШАГ 12 — Lambda функция для генерации CSV

**Задание для Claude Code:**
```
Создай Lambda функцию для генерации CSV экспорта истории цен.

1. Создай папку lambda/csv-generator/:
   - package.json: { "type": "module" }
   - index.mjs: основной handler
   
   Handler принимает event: { productId, userId, dateFrom, dateTo }
   
   Логика:
   - Подключиться к RDS PostgreSQL (connection string из environment)
   - SELECT price, currency, scraped_at FROM price_history
     WHERE product_id = $1 AND scraped_at BETWEEN $2 AND $3
     ORDER BY scraped_at ASC
   - Сформировать CSV: "Date,Price,Currency\n{rows}"
   - Загрузить в S3: exports/{userId}/{productId}/{timestamp}.csv
   - Вернуть presigned URL (expire 2 часа)
   - Закрыть DB соединение

2. Особенности Lambda + RDS:
   - НЕ использовать connection pool — Lambda не держит persistent соединения
   - Создавать соединение в handler, закрывать в finally
   - Environment variables Lambda: DATABASE_URL (из Secrets Manager через Layer), S3_BUCKET
   - VPC: Lambda должна быть в той же VPC что и RDS

3. Создай scripts/deploy-lambda.sh:
   - zip -r csv-generator.zip lambda/csv-generator/
   - aws lambda update-function-code --function-name mp-csv-generator --zip-file fileb://csv-generator.zip

4. В export.processor.ts (BullMQ воркер):
   const lambda = new LambdaClient({ region: AWS_REGION });
   const result = await lambda.send(new InvokeCommand({
     FunctionName: 'mp-csv-generator',
     Payload: JSON.stringify({ productId, userId, dateFrom, dateTo }),
   }));
   const { downloadUrl } = JSON.parse(Buffer.from(result.Payload).toString());
   // Отправить SSE событие с downloadUrl

Проверь: вызови Lambda напрямую через aws cli с тестовыми данными, убедись что CSV создаётся.
```

---

### ШАГ 13 — Nginx конфигурация

**Задание для Claude Code:**
```
Создай production-ready Nginx конфигурацию для MarketPulse.

nginx/nginx.conf:

1. Upstream блок:
   upstream api {
     least_conn;
     server api:3000;
     keepalive 64;
   }

2. Rate limiting зоны:
   - limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s (общий API)
   - limit_req_zone $binary_remote_addr zone=auth:10m rate=5r/m (auth endpoints)
   - limit_req_zone $binary_remote_addr zone=scrape:10m rate=5r/m (ручной скрапинг)

3. Server блок (HTTP → redirect to HTTPS):
   - 80 → 301 to https

4. Server блок (HTTPS):
   - listen 443 ssl http2
   - ssl_certificate /etc/nginx/ssl/cert.pem
   - ssl_certificate_key /etc/nginx/ssl/key.pem
   - ssl_protocols TLSv1.2 TLSv1.3
   - ssl_session_cache shared:SSL:10m

5. Security headers:
   - X-Frame-Options DENY
   - X-Content-Type-Options nosniff
   - X-XSS-Protection 1; mode=block
   - Referrer-Policy strict-origin-when-cross-origin
   - Content-Security-Policy: default-src 'self'; script-src 'self'; connect-src 'self' wss:
   - Strict-Transport-Security max-age=31536000; includeSubDomains

6. Locations:
   
   location /api/sse/stream {
     proxy_pass http://api;
     proxy_http_version 1.1;
     proxy_set_header Connection '';              # НЕ upgrade — SSE не WebSocket
     proxy_buffering off;                         # КРИТИЧНО для SSE!
     proxy_cache off;
     proxy_read_timeout 300s;                     # Долгое соединение
     chunked_transfer_encoding on;
   }
   
   location /api/auth/ {
     limit_req zone=auth burst=3 nodelay;
     proxy_pass http://api;
     # Стандартные proxy headers
   }
   
   location /api/products/ {
     limit_req zone=api burst=10 nodelay;
     # Rate limit на ручной scrape:
     location ~ /api/products/[^/]+/scrape {
       limit_req zone=scrape burst=2 nodelay;
       proxy_pass http://api;
     }
     proxy_pass http://api;
   }
   
   location /api/ {
     limit_req zone=api burst=20 nodelay;
     proxy_pass http://api;
     proxy_set_header Host $host;
     proxy_set_header X-Real-IP $remote_addr;
     proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
     proxy_set_header X-Forwarded-Proto $scheme;
   }
   
   location / {
     root /usr/share/nginx/html;
     try_files $uri $uri/ /index.html;
     
     # Кэш для статики с хешем в имени
     location ~* \.(js|css|png|jpg|woff2)$ {
       expires 1y;
       add_header Cache-Control "public, immutable";
     }
   }

7. Gzip:
   gzip on;
   gzip_types text/plain text/css application/json application/javascript;
   gzip_min_length 1000;

8. Добавь nginx в docker-compose.yml:
   nginx:
     image: nginx:alpine
     ports: 80:80, 443:443
     volumes:
       - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
       - ./nginx/ssl:/etc/nginx/ssl:ro
     depends_on: api

Проверь: nginx -t не выдаёт ошибок, SSE соединение держится > 30 секунд.
```

---

### ШАГ 14 — React Frontend: инициализация и структура

**Задание для Claude Code:**
```
Инициализируй React frontend с Vite, TypeScript, TanStack Query, Zustand, Feature-Sliced Design.

1. Создай React проект:
   npm create vite@latest frontend -- --template react-ts

2. Установи зависимости:
   npm install @tanstack/react-query @tanstack/react-query-devtools
   npm install zustand
   npm install react-router-dom
   npm install react-hook-form @hookform/resolvers zod
   npm install axios
   npm install recharts (для графиков цен)
   npm install @radix-ui/react-dialog @radix-ui/react-toast (UI primitives)
   npm install clsx tailwind-merge
   npm install --save-dev tailwindcss autoprefixer postcss

3. Настрой Tailwind CSS

4. Настрой path aliases в vite.config.ts и tsconfig.json:
   @/* → src/*

5. Структура по Feature-Sliced Design:
   src/
   ├── app/
   │   ├── providers/
   │   │   ├── QueryProvider.tsx    (TanStack Query)
   │   │   ├── RouterProvider.tsx
   │   │   └── SseProvider.tsx      (подключение SSE)
   │   ├── store/
   │   │   └── alerts.store.ts      (Zustand: уведомления)
   │   └── App.tsx
   ├── pages/
   │   ├── Dashboard/
   │   │   ├── index.tsx
   │   │   └── Dashboard.tsx
   │   ├── ProductDetail/
   │   │   ├── index.tsx
   │   │   └── ProductDetail.tsx
   │   └── Settings/
   │       ├── index.tsx
   │       └── Settings.tsx
   ├── widgets/
   │   ├── Header/                  (навигация, профиль)
   │   ├── AlertsPanel/             (панель уведомлений из SSE)
   │   └── ProductList/             (список товаров)
   ├── features/
   │   ├── add-product/             (форма добавления)
   │   ├── price-chart/             (график Recharts)
   │   ├── export-csv/              (кнопка экспорта + статус)
   │   └── ai-analysis/             (запрос к Claude MCP)
   ├── entities/
   │   ├── product/
   │   │   ├── api/products.api.ts
   │   │   ├── model/product.types.ts
   │   │   └── ui/ProductCard.tsx   (memo обёртка!)
   │   └── user/
   │       ├── api/auth.api.ts
   │       └── model/user.types.ts
   └── shared/
       ├── api/
       │   └── axios.instance.ts    (базовый axios с interceptors)
       ├── hooks/
       │   ├── useSse.ts
       │   └── useDebounce.ts
       ├── ui/
       │   ├── Button.tsx
       │   ├── Input.tsx
       │   ├── Skeleton.tsx
       │   └── Toast.tsx
       └── lib/
           └── queryClient.ts

6. Настрой axios instance (shared/api/axios.instance.ts):
   - baseURL: '/api'
   - withCredentials: true (для cookie refresh token)
   - Request interceptor: добавить X-Request-ID header
   - Response interceptor: при 401 → автоматически вызвать /auth/refresh → retry запроса
   - При повторном 401 → редирект на /login

7. QueryClient настройки (shared/lib/queryClient.ts):
   - defaultOptions: queries: { staleTime: 30_000, retry: 1 }
   - onError глобально: показывать Toast с ошибкой

8. Настрой роутинг (app/providers/RouterProvider.tsx):
   - / → Dashboard (protected)
   - /products/:id → ProductDetail (protected)
   - /settings → Settings (protected)
   - /login → LoginPage (public)
   - /register → RegisterPage (public)
   - Protected route: если нет токена → /login

9. Dockerfile для frontend (multi-stage):
   - builder: npm run build
   - production: nginx:alpine + React build + nginx.conf для SPA

Проверь: npm run dev запускается, роутинг работает, axios настроен с token refresh.
```

---

### ШАГ 15 — Frontend: Dashboard страница

**Задание для Claude Code:**
```
Реализуй Dashboard страницу — главная страница с списком товаров и real-time обновлениями.

1. entities/product/api/products.api.ts:
   - getProducts(): GET /products → Product[]
   - getProduct(id): GET /products/:id → ProductDetail
   - createProduct(dto): POST /products
   - deleteProduct(id): DELETE /products/:id
   - updateProduct(id, dto): PATCH /products/:id
   - triggerScrape(id): POST /products/:id/scrape

2. features/add-product/AddProductForm.tsx:
   - Input для URL (валидация Zod: z.string().url())
   - Input для alertThreshold (опционально)
   - Checkbox alertEnabled
   - React Hook Form + Zod resolver
   - При submit: useMutation → POST /products
   - После успеха: invalidate queryKey ['products']

3. entities/product/ui/ProductCard.tsx (обёрнут в React.memo):
   - Название товара (или skeleton если ещё не скрапили)
   - Текущая цена + валюта
   - Изменение цены: цветной badge (зелёный -5%, красный +3%)
   - Статус: active/paused/error с иконкой
   - Последнее обновление: "3 минуты назад" (relative time)
   - Кнопка "Обновить" (trigger scrape) с loading state
   - Клик → перейти на /products/:id

4. pages/Dashboard/Dashboard.tsx:
   - useQuery(['products'], api.getProducts, { refetchInterval: false })
   - useSse() — подключить SSE (при price-update invalidate query)
   - Кнопка "Добавить товар" → открыть AddProductForm в Modal
   - Список ProductCard через virtual list если > 50 товаров
   - Skeleton: показывать 6 skeleton cards во время загрузки
   - Empty state: иллюстрация "Добавьте первый товар"

5. widgets/AlertsPanel/AlertsPanel.tsx:
   - Колокольчик в Header с badge (количество непрочитанных)
   - Zustand store: alerts.store.ts хранит массив алертов
   - SSE 'price-alert' событие → добавить в store
   - Dropdown: список алертов с кнопкой "Перейти к товару"
   - Кнопка "Очистить всё"

Проверь: список товаров загружается, при SSE событии цена обновляется без перезагрузки.
```

---

### ШАГ 16 — Frontend: Product Detail страница

**Задание для Claude Code:**
```
Реализуй Product Detail страницу — история цен, график, AI анализ, экспорт.

1. entities/product/api/products.api.ts (добавить):
   - getPriceHistory(productId, params: { limit, offset, dateFrom, dateTo })
   - getAiAnalysis(productId): POST /mcp/analyze/:productId
   - exportCsv(productId, params): POST /export/csv

2. features/price-chart/PriceChart.tsx:
   Используй Recharts LineChart:
   - Ось X: дата (форматировать: "Dec 15")
   - Ось Y: цена
   - Tooltip: дата + цена + изменение от предыдущей
   - Горизонтальная линия: alertThreshold (если задан) — пунктир красный
   - Горизонтальная линия: средняя цена — пунктир синий
   - ResponsiveContainer для адаптивности
   - Loading: skeleton прямоугольник

3. features/ai-analysis/AiAnalysis.tsx:
   - Кнопка "Анализировать с Claude"
   - useMutation → POST /mcp/analyze/:productId
   - Показать текстовый анализ от Claude в красивом блоке
   - Skeleton во время загрузки (анализ занимает 3-10 секунд)
   - Иконка Claude

4. features/export-csv/ExportCsvButton.tsx:
   - Кнопка "Экспорт CSV"
   - DateRange picker: dateFrom, dateTo
   - useMutation → POST /export/csv
   - После отправки: показать "Экспорт готовится..." + spinner
   - SSE 'export-ready' событие → автоматически открыть downloadUrl
   - Альтернатива: polling GET /export/:exportId/status каждые 2 сек

5. pages/ProductDetail/ProductDetail.tsx:
   - useParams → productId
   - useQuery(['product', productId], api.getProduct)
   - useQuery(['price-history', productId], api.getPriceHistory)
   - Хлебные крошки: Dashboard / {product.name}
   - Карточка: имя, текущая цена, изменение, статус, последнее обновление
   - Кнопки: "Пауза" / "Возобновить", "Удалить", "Обновить сейчас"
   - PriceChart с историей цен
   - Форма алерта: установить порог (PATCH /products/:id)
   - AiAnalysis блок
   - ExportCsvButton
   - При SSE 'scrape-completed' для этого productId → invalidate queries

Проверь: график отображает реальные данные, кнопка анализа возвращает текст от Claude.
```

---

### ШАГ 17 — Frontend: Settings страница

**Задание для Claude Code:**
```
Реализуй Settings страницу — настройки аккаунта, очереди, уведомления.

1. pages/Settings/Settings.tsx:
   Секции:

   А. Профиль:
   - Форма: имя (React Hook Form + Zod)
   - PATCH /users/me → обновить имя
   - Смена пароля: currentPassword, newPassword, confirmPassword

   Б. Настройки скрапинга:
   - Интервал: select (30 мин / 1 час / 6 часов / 12 часов / 24 часа)
   - PATCH /users/me/settings → сохранить
   - Автоматически применяется ко всем товарам пользователя

   В. Email уведомления:
   - Toggle: включить/выключить алерты по email
   - Показать текущий email (из JWT)
   - При включении: отправить тестовый email

   Г. Статус очередей (только читать):
   - useQuery(['queue-stats'], api.getQueueStats, { refetchInterval: 10_000 })
   - Таблица: очередь | waiting | active | completed | failed
   - Цветовая индикация: failed > 10 → красный

   Д. Опасная зона:
   - Кнопка "Удалить аккаунт" → confirm dialog → DELETE /users/me
   - Кнопка "Выйти со всех устройств" → DELETE /auth/sessions/all

2. src/users/users.controller.ts (добавить в backend):
   - GET /users/me → профиль
   - PATCH /users/me → обновить имя/настройки
   - PATCH /users/me/password → смена пароля
   - DELETE /users/me → удаление аккаунта
   - POST /users/me/test-email → тестовый email через SES

3. GET /settings/queue-stats в NestJS:
   @Get('queue-stats')
   @UseGuards(JwtAuthGuard)
   async getQueueStats() {
     return this.queueMonitorService.getQueueStats();
   }

Проверь: все три страницы работают, навигация между ними корректна.
```

---

## ═══════════════════════════════════
## ФАЗА 2: AWS ИНФРАСТРУКТУРА
## ═══════════════════════════════════

---

### ШАГ 18 — Terraform: базовая AWS инфраструктура

**Задание для Claude Code:**
```
Создай Terraform конфигурацию для AWS инфраструктуры MarketPulse.

1. terraform/variables.tf:
   - aws_region (default: us-east-1)
   - environment (prod/staging)
   - db_password (sensitive: true)
   - project_name (default: market-pulse)

2. terraform/main.tf:
   - Provider: aws, region из variable
   - Backend: S3 для хранения state
     terraform { backend "s3" { bucket = "mp-terraform-state" } }
   
   - VPC (10.0.0.0/16):
     * Public subnets (2 AZ): 10.0.1.0/24, 10.0.2.0/24 — для EC2, ALB
     * Private subnets (2 AZ): 10.0.3.0/24, 10.0.4.0/24 — для RDS, ElastiCache
     * Internet Gateway
     * NAT Gateway (для Lambda в private subnet)
   
   - Security Groups:
     * sg_alb: ingress 80, 443 from 0.0.0.0/0
     * sg_ec2: ingress 80, 443 from sg_alb; ingress 22 from your IP; ingress 3000 from sg_alb
     * sg_rds: ingress 5432 from sg_ec2 and sg_lambda only
     * sg_redis: ingress 6379 from sg_ec2 only
     * sg_lambda: egress all (нужен интернет для ScraperAPI)

3. terraform/rds.tf:
   - aws_db_instance:
     * engine: postgres, engine_version: 16.1
     * instance_class: db.t3.micro (dev) / db.t3.small (prod)
     * multi_az: true (prod only)
     * storage_encrypted: true
     * deletion_protection: true
     * backup_retention_period: 7
     * db_name: market_pulse, username: mp_user
     * password: var.db_password (из Secrets Manager)
     * vpc_security_group_ids: [sg_rds]
     * db_subnet_group_name: private subnets

4. terraform/ec2.tf:
   - aws_instance:
     * ami: Amazon Linux 2023
     * instance_type: t3.small
     * security_groups: [sg_ec2]
     * iam_instance_profile: mp-ec2-profile (доступ к S3, Secrets Manager, SES)
     * user_data: скрипт установки Docker + docker-compose
   
   - aws_iam_role mp-ec2-role:
     * AmazonS3FullAccess (только к нашим бакетам через policy)
     * SecretsManagerReadWrite
     * AmazonSESFullAccess
     * CloudWatchAgentServerPolicy

5. terraform/s3.tf:
   - aws_s3_bucket mp-assets: публичный (изображения)
   - aws_s3_bucket mp-private: приватный (raw HTML, CSV экспорты)
   - aws_s3_bucket mp-terraform-state: для Terraform state
   - Lifecycle policy для mp-private: удалять raw HTML старше 30 дней
   - CloudFront distribution перед mp-assets

6. terraform/elasticache.tf:
   - aws_elasticache_cluster:
     * engine: redis, node_type: cache.t3.micro
     * num_cache_nodes: 1
     * security_group_ids: [sg_redis]
     * subnet_group: private subnets

7. terraform/secrets.tf:
   - aws_secretsmanager_secret mp-secrets
   - aws_secretsmanager_secret_version с JSON:
     {
       "DATABASE_URL": "...",
       "SCRAPER_API_KEY": "...",
       "JWT_SECRET": "...",
       "JWT_REFRESH_SECRET": "...",
       "ANTHROPIC_API_KEY": "..."
     }

8. terraform/lambda.tf:
   - aws_lambda_function mp-csv-generator:
     * runtime: nodejs20.x
     * handler: index.handler
     * vpc_config: private subnets + sg_lambda
     * environment: DATABASE_URL, S3_BUCKET
     * role: mp-lambda-role (S3 access + VPC access)
     * timeout: 60

9. outputs.tf:
   - ec2_public_ip
   - rds_endpoint
   - redis_endpoint
   - cloudfront_domain

Проверь: terraform validate, terraform plan не выдаёт ошибок.
```

---

### ШАГ 19 — AWS SES: email уведомления

**Задание для Claude Code:**
```
Настрой AWS SES для отправки email алертов о падении цен.

1. src/notifications/email.service.ts:
   Используй @aws-sdk/client-ses
   
   - sendPriceAlert(to: string, data: PriceAlertData): Promise<void>
     * Template: HTML email с:
       - Название товара
       - Старая цена → Новая цена (выделить зелёным)
       - % снижения
       - Кнопка "Посмотреть товар" → ссылка на /products/:id
       - Кнопка "Отключить алерт"
     
     SES SendEmailCommand:
       From: 'MarketPulse <alerts@yourdomain.com>'
       To: [to]
       Subject: `💰 Цена упала! ${product.name} — ${newPrice} ${currency}`
   
   - sendTestEmail(to: string): Promise<void>
     * Простое письмо для проверки что SES работает

2. В alerts.processor.ts после отправки email:
   - Обновить alertEvent.sentAt = new Date()
   - Сохранить в БД

3. SES configuration:
   - Для разработки: verify sender email в SES sandbox
   - Для прода: выйти из sandbox (submit request в AWS Console)
   - DKIM + SPF настроить для домена

4. Unsubscribe механизм (GDPR):
   - Добавить ссылку в каждое письмо: /api/alerts/unsubscribe?token=JWT
   - Endpoint PATCH /users/me/settings { emailAlerts: false }
   - JWT token в ссылке содержит userId (не требует авторизации)

Проверь: тестовый email доходит в SES sandbox окружении.
```

---

## ═══════════════════════════════════
## ФАЗА 3: CI/CD
## ═══════════════════════════════════

---

### ШАГ 20 — GitHub Actions CI/CD пайплайн

**Задание для Claude Code:**
```
Создай GitHub Actions пайплайны для автоматического тестирования и деплоя.

1. .github/workflows/backend.yml:

name: Backend CI/CD
on:
  push:
    branches: [main]
    paths: ['backend/**', 'docker-compose.yml']
  pull_request:
    branches: [main]
    paths: ['backend/**']

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env: { POSTGRES_DB: mp_test, POSTGRES_USER: mp_user, POSTGRES_PASSWORD: mp_secret }
        options: --health-cmd pg_isready
      redis:
        image: redis:7-alpine
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
        working-directory: backend
      - run: npm run lint
        working-directory: backend
      - run: npm audit --audit-level high  # fail on high severity vulnerabilities
        working-directory: backend
      - run: npm run test
        working-directory: backend
        env: { DATABASE_URL: postgresql://mp_user:mp_secret@localhost:5432/mp_test, ... }
      - run: npm run test:e2e
        working-directory: backend

  build-and-push:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
      - uses: aws-actions/amazon-ecr-login@v2
      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: backend
          push: true
          tags: ${{ secrets.ECR_REGISTRY }}/market-pulse-api:${{ github.sha }},${{ secrets.ECR_REGISTRY }}/market-pulse-api:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to EC2 via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ec2-user
          key: ${{ secrets.EC2_SSH_KEY }}
          script: |
            cd /app/market-pulse
            aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $ECR_REGISTRY
            docker pull $ECR_REGISTRY/market-pulse-api:latest
            docker compose up -d --no-deps api
            docker compose run --rm api npm run migration:run
            # Health check
            sleep 10
            curl -f http://localhost:3000/health || exit 1

2. .github/workflows/frontend.yml:

jobs:
  test-and-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci && npm run lint && npm run type-check && npm run build
        working-directory: frontend
      - name: Upload to S3 + invalidate CloudFront
        if: github.ref == 'refs/heads/main'
        run: |
          aws s3 sync frontend/dist s3://${{ secrets.S3_BUCKET_FRONTEND }} --delete
          aws cloudfront create-invalidation --distribution-id ${{ secrets.CF_DISTRIBUTION_ID }} --paths "/*"

3. .github/workflows/lambda.yml:
   - Триггер: изменения в lambda/**
   - Zip + deploy через aws lambda update-function-code

4. GitHub Secrets которые нужно настроить:
   - AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
   - ECR_REGISTRY
   - EC2_HOST, EC2_SSH_KEY
   - S3_BUCKET_FRONTEND
   - CF_DISTRIBUTION_ID

5. Branch protection для main:
   - Require status checks: test job
   - Require PR review (1 reviewer)
   - No force push

Проверь: создай PR → запускаются тесты. Merge в main → автоматический деплой.
```

---

## ═══════════════════════════════════
## ФАЗА 4: ТЕСТЫ И ФИНАЛИЗАЦИЯ
## ═══════════════════════════════════

---

### ШАГ 21 — Unit и Integration тесты Backend

**Задание для Claude Code:**
```
Напиши ключевые тесты для NestJS backend.

1. backend/src/scraper/scraper.service.spec.ts:
   - Mock ScraperAPI client (не делать реальных запросов)
   - Тест: scrapeProduct с валидным Amazon URL → возвращает ParsedProduct
   - Тест: scrapeProduct при ошибке ScraperAPI → выбрасывает исключение
   - Тест: определение парсера по URL

2. backend/src/auth/auth.service.spec.ts:
   - Тест: register → пароль хэшируется (не хранится plaintext)
   - Тест: login с неверным паролем → UnauthorizedException
   - Тест: refresh token rotation → старый токен инвалидируется
   - Тест: reuse detection → все токены пользователя удаляются

3. backend/src/products/products.service.spec.ts:
   - Тест: getProduct чужого пользователя → ForbiddenException (BOLA защита)
   - Тест: createProduct → добавляется в очередь скрапинга

4. backend/test/scraping.e2e-spec.ts (E2E с реальной БД в Docker):
   - Создать пользователя
   - Создать продукт
   - Мок ScraperAPI
   - Запустить BullMQ воркер
   - Проверить что price_history обновилась

5. backend/test/sse.e2e-spec.ts:
   - Подключиться к SSE endpoint
   - Вызвать price-update
   - Проверить что клиент получил событие

6. Общие требования к тестам:
   - Используй Jest
   - InMemoryUserRepository для unit тестов (Repository Pattern)
   - Покрытие: минимум 70% для services
   - Запуск: npm run test (unit), npm run test:e2e (интеграционные)

Проверь: npm run test → все тесты проходят.
```

---

### ШАГ 22 — Health check и мониторинг

**Задание для Claude Code:**
```
Добавь health check endpoint и CloudWatch мониторинг.

1. src/health/health.controller.ts:
   Используй @nestjs/terminus
   
   GET /health:
   - Проверить PostgreSQL соединение (TypeORM ping)
   - Проверить Redis соединение (PING команда)
   - Проверить BullMQ очереди (очередь доступна)
   - Вернуть: { status: 'ok'|'error', details: { postgres: {...}, redis: {...} } }
   
   GET /health/ready (для Kubernetes readiness probe):
   - Проверить что migrations выполнены
   - Проверить что конфиг загружен

2. Структурированное логирование:
   Заменить console.log на Winston logger с форматом JSON:
   {
     "timestamp": "...",
     "level": "info",
     "requestId": "...",
     "userId": "...",
     "service": "scraper",
     "message": "Product scraped",
     "productId": "...",
     "duration": 1234,
     "price": 99.99
   }
   
   В production: CloudWatch Logs через AWS SDK

3. AWS CloudWatch алерты (добавить в terraform/cloudwatch.tf):
   - CPU Utilization EC2 > 80% за 5 минут → SNS Email
   - RDS CPU > 70% → SNS Email
   - BullMQ failed jobs > 10 → SNS Email (через CloudWatch custom metric)
   - Ошибки 5xx > 1% запросов → SNS Email

4. Custom metrics (из NestJS → CloudWatch):
   - Каждый успешный скрап: mp.scrape.success +1
   - Каждый неудачный скрап: mp.scrape.failure +1
   - Время скрапинга: mp.scrape.duration histogram
   - Отправить через CloudWatch PutMetricData

Проверь: GET /health → { status: 'ok' }, все сервисы отвечают.
```

---

### ШАГ 23 — Production деплой: финальный шаг

**Задание для Claude Code:**
```
Выполни финальный деплой всего приложения на AWS.

1. Подготовка:
   - Убедись что все секреты в AWS Secrets Manager
   - Проверь что RDS создан и доступен из EC2
   - Проверь что ElastiCache доступен из EC2
   - Создай ECR репозиторий: aws ecr create-repository --repository-name market-pulse-api

2. На EC2 (настройка сервера):
   sudo yum update -y
   sudo yum install docker -y
   sudo systemctl start docker
   sudo usermod -aG docker ec2-user
   sudo curl -L "https://github.com/docker/compose/releases/..." -o /usr/local/bin/docker-compose
   sudo chmod +x /usr/local/bin/docker-compose
   
   Создать /app/market-pulse/ и скопировать docker-compose.yml (production версию)
   Создать .env из Secrets Manager:
   aws secretsmanager get-secret-value --secret-id mp-secrets | jq -r .SecretString | python3 -c "import sys,json; [print(f'{k}={v}') for k,v in json.load(sys.stdin).items()]" > .env

3. Production docker-compose.yml (на EC2):
   - api: image из ECR, restart: unless-stopped, health check
   - nginx: image nginx:alpine, restart: unless-stopped
   - НЕТ postgres/redis — они в RDS/ElastiCache
   
4. SSL сертификат:
   - Использовать AWS Certificate Manager (ACM) + ALB
   - Или Let's Encrypt на EC2:
     sudo yum install certbot python3-certbot-nginx -y
     sudo certbot --nginx -d yourdomain.com
     Настроить auto-renewal через cron

5. DNS:
   - Создать A запись: yourdomain.com → EC2 public IP (или ALB)
   - CNAME: www.yourdomain.com → yourdomain.com

6. Запуск:
   docker compose pull
   docker compose up -d
   docker compose exec api npm run migration:run
   
7. Smoke tests после деплоя:
   curl https://yourdomain.com/api/health → { status: 'ok' }
   curl https://yourdomain.com → React app загружается
   Зарегистрироваться → создать товар → проверить что скрапинг запустился

8. Создай DEPLOYMENT.md:
   - Как обновить приложение (docker pull + compose up)
   - Как откатить (docker tag previous stable, pull, up)
   - Как посмотреть логи (docker compose logs -f api)
   - Как зайти в БД (docker compose exec db psql или RDS connect)
   - Как очистить очередь BullMQ (redis-cli FLUSHDB - ОСТОРОЖНО)

Проверь: https://yourdomain.com работает, регистрация, добавление товара, скрапинг — всё работает.
```

---

## ═══════════════════════════════════
## ФИНАЛЬНАЯ СТРУКТУРА CLAUDE.md (субагенты)
## ═══════════════════════════════════

### ШАГ 24 — Создать финальный CLAUDE.md с субагентами

**Задание для Claude Code:**
```
Создай финальный CLAUDE.md в корне проекта.
Он должен содержать:

1. Project overview (3-4 абзаца)
2. Architecture diagram (ASCII art)
3. Local setup (как запустить за 5 минут)
4. Sub-agents секцию (из PROJECT_PLAN.md)
5. Code style секцию
6. Security rules секцию
7. Common tasks (быстрые примеры):
   - "Добавить новый парсер сайта"
   - "Добавить новый тип алерта"
   - "Добавить новое поле к продукту (migration паттерн)"
   - "Добавить новый BullMQ job"
   - "Добавить новый SSE event тип"
8. Troubleshooting:
   - Scraper вернул null → как дебажить
   - SSE не доходит → проверить Nginx buffering
   - BullMQ job завис → как очистить
   - Migration failed → как откатить

Формат: чёткий, markdown, разделы с ##.
Claude Code должен читать этот файл при каждой новой задаче.
```

---

## 🤖 Claude Skills & Plugins — что использовать и когда

Это не просто список. Здесь объяснено **на каком конкретном шаге** и **зачем** каждый инструмент реально помогает.

---

### 🛠️ Skills (встроенные навыки Claude)

---

#### `mcp-builder` ⭐⭐⭐ — критически важен для Шага 10

**Что делает**: содержит детальный гайд по созданию MCP серверов на Python (FastMCP) и Node/TypeScript (MCP SDK). Claude читает его перед написанием MCP кода.

**Когда использовать**: Шаг 10 — создание MCP Server в `backend/src/mcp/`.

**Почему важен**: MCP SDK имеет специфичный API (Server, Tool, ListToolsRequest и т.д.), который отличается от обычного REST. Без skill Claude может написать MCP код неправильно — tools не зарегистрируются, Anthropic SDK не сможет их вызвать. Skill даёт правильные паттерны регистрации tools, обработки ошибок, типизации входных/выходных данных.

**Как применить**: перед Шагом 10 скажи Claude Code:
```
Используй skill mcp-builder для написания MCP Server в backend/src/mcp/
```

---

#### `skill-creator` ⭐⭐ — полезен после завершения проекта

**Что делает**: помогает создавать и оптимизировать кастомные skills для Claude.

**Когда использовать**: после того как проект работает — создай кастомный skill специфичный для MarketPulse.

**Зачем создавать кастомный skill для проекта**:

Когда ты будешь работать над проектом долго, CLAUDE.md становится длинным и Claude тратит контекст на чтение всего файла. Skill позволяет вынести часто используемые инструкции в отдельный модуль:

```
Создать skill: market-pulse-scraper
Описание: "Rules for writing ScraperAPI parsers and BullMQ jobs in MarketPulse"
Содержание: паттерны парсеров, типы ошибок, как тестировать без реального запроса
```

Потом при работе над скрапером достаточно сказать:
```
Используй skill market-pulse-scraper для добавления парсера eBay
```

---

#### `schedule` ⭐⭐ — полезен для автоматизации разработки

**Что делает**: создаёт scheduled задачи в Cowork — задачи которые выполняются автоматически по расписанию.

**Когда использовать**: во время активной разработки.

**Реальные кейсы для MarketPulse**:

- **Ежедневный code review**: "Каждый день в 9:00 проверяй новые коммиты в backend/src/scraper/ на наличие прямых fetch запросов без ScraperAPI"
- **Мониторинг деплоя**: "Каждые 30 минут проверяй /api/health и уведоми если status != ok"
- **Напоминание о тестах**: "Каждую пятницу напомни запустить npm audit в backend/ и frontend/"
- **Синхронизация партиций**: "Каждое 1-е число месяца напомни создать новую партицию таблицы price_history"

---

#### `docx` ⭐ — для технической документации

**Что делает**: создаёт .docx файлы с форматированием, заголовками, таблицами.

**Когда использовать**: финальная стадия проекта.

**Зачем**: MarketPulse — хороший портфолио проект. Красиво оформленная документация в Word помогает при показе проекта на интервью:
- API documentation (все эндпоинты, примеры запросов/ответов)
- Architecture Decision Records (почему Redis а не Memcached, почему BullMQ а не SQS)
- Deployment runbook (пошаговая инструкция для нового разработчика)

---

#### `pptx` ⭐ — для презентации проекта на интервью

**Что делает**: создаёт .pptx презентации.

**Когда использовать**: когда проект готов и нужно его презентовать.

**Зачем**: на техническом интервью часто просят рассказать о своём проекте. Слайды помогают структурировать рассказ:
- Слайд 1: Проблема (цены меняются → сложно отследить лучший момент для покупки)
- Слайд 2: Архитектура (твоя ASCII схема → красивый диаграмма)
- Слайд 3: Технические решения (почему SSE а не WebSocket, как решили anti-ban)
- Слайд 4: Что узнал (BullMQ retry паттерны, partition pruning в PostgreSQL)
- Слайд 5: Demo screenshots

---

#### `xlsx` ⭐ — для анализа данных скрапинга

**Что делает**: создаёт и редактирует Excel файлы.

**Когда использовать**: если захочешь проанализировать данные вне приложения.

**Зачем**: экспортируй историю цен из PostgreSQL в CSV → попроси Claude создать Excel с:
- Pivot table: средняя цена по дням недели
- Граф трендов цен по месяцам
- Формулы для расчёта % отклонения от средней

Это поможет проверить что BullMQ scraper работает корректно и данные реалистичны.

---

### 🔌 Plugins (внешние интеграции)

---

#### `Prisma` ⭐⭐⭐ — важен для работы с базой данных

**Что делает**: подключается к твоей PostgreSQL БД и позволяет Claude видеть реальную схему, выполнять запросы, анализировать данные прямо из чата.

**Ты уже его видишь** — в этой сессии подключен Prisma-Local.

**Когда использовать**: активно на Шагах 4, 6, 7, 8, 21.

**Реальные кейсы**:

```
"Посмотри на реальные данные в таблице price_history за последнюю неделю
и скажи — partition pruning работает? Видишь ли ты Seq Scan в EXPLAIN?"
```

```
"В таблице products есть записи где status='error' больше 3 дней.
Покажи их и предложи SQL для массового сброса в 'active'"
```

```
"Проверь индекс idx_products_next_scrape — используется ли он в запросе
findDueForScraping()? Запусти EXPLAIN ANALYZE"
```

```
"Сколько записей в price_history за каждый месяц?
Убедись что партиционирование работает корректно"
```

**Почему ценнее чем просто писать SQL вручную**: Claude видит схему + данные + может сразу написать оптимизированный код в репозитории.

---

#### GitHub MCP ⭐⭐⭐ — для CI/CD и code review

**Что делает**: интеграция с GitHub — создавать PR, просматривать issues, комментировать код, анализировать CI/CD runs.

**Найти в реестре**: установи через Settings → Plugins → поиск "GitHub".

**Когда использовать**: Шаги 20–23 (CI/CD) и активная разработка.

**Реальные кейсы**:

```
"Посмотри на последний failed GitHub Actions run для backend.yml
и скажи что сломалось в тестах"
```

```
"Создай GitHub Issue для каждого TODO комментария в backend/src/scraper/"
```

```
"Проверь PR #5 — не нарушает ли он security rules из CLAUDE.md?
Конкретно: нет ли прямых fetch запросов без ScraperAPI?"
```

```
"GitHub Actions упал на npm audit. Покажи какие уязвимости нашёл
и предложи как исправить"
```

---

#### AWS MCP / Terraform MCP ⭐⭐ — для работы с инфраструктурой

**Что делает**: позволяет Claude управлять AWS ресурсами или читать Terraform state.

**Найти в реестре**: Settings → Plugins → поиск "AWS" или "Terraform".

**Когда использовать**: Шаги 18–23 (AWS инфраструктура).

**Реальные кейсы**:

```
"Посмотри на мой Terraform state и скажи — RDS instance
настроен с deletion_protection=true?"
```

```
"Проверь CloudWatch метрики за последние 24 часа.
Есть ли аномалии в BullMQ failed jobs?"
```

```
"EC2 CPU вырос до 85%. Посмотри какой процесс нагружает сервер
и предложи как оптимизировать"
```

---

#### Slack MCP ⭐ — для командных уведомлений

**Что делает**: отправляет сообщения в Slack каналы.

**Найти в реестре**: Settings → Plugins → поиск "Slack".

**Когда использовать**: если работаешь в команде или хочешь настроить алерты.

**Реальные кейсы для MarketPulse**:

```
"Когда BullMQ failed jobs > 10 — отправь уведомление в #alerts канал"
```

```
"После каждого успешного деплоя через CI/CD — отправь сообщение
в #deployments: версия, время деплоя, кто задеплоил"
```

---

### 📋 Как использовать это вместе

**Оптимальный workflow для разработки с Claude Code:**

```
1. Шаг 10 (MCP Server):
   → Активируй skill mcp-builder
   → Claude читает гайд → пишет правильный MCP код

2. Шаг 4-6 (БД и API):
   → Подключи Prisma plugin
   → Claude видит реальную схему → пишет оптимальные запросы с нужными индексами
   → "Посмотри на таблицу products и напиши EXPLAIN ANALYZE для findDueForScraping"

3. Шаг 20-21 (CI/CD и тесты):
   → Подключи GitHub plugin
   → "Почему упал последний Actions run? Исправь и создай PR"

4. Шаг 18 (AWS):
   → Подключи AWS/Terraform plugin
   → "Проверь что RDS в private subnet и недоступен из интернета"

5. Финал (документация):
   → Используй skill docx → создай API документацию
   → Используй skill pptx → создай презентацию для интервью

6. После запуска (кастомный skill):
   → Используй skill-creator → создай market-pulse-scraper skill
   → Теперь при добавлении нового парсера Claude автоматически следует всем правилам
```

**Ключевое правило**: не устанавливай все плагины сразу. Подключай по мере необходимости — лишние плагины добавляют контекст и замедляют Claude.

---

## 📊 Итоговая таблица технологий

| Технология | Где используется | Зачем |
|------------|-----------------|-------|
| React + Vite | frontend/ | SPA, 3 страницы |
| TanStack Query | frontend/ | Server state, кэш |
| Zustand | frontend/ | UI state (alerts) |
| NestJS | backend/ | REST API, модули |
| TypeORM | backend/ | ORM + migrations |
| PostgreSQL | RDS | Основная БД, партиционирование |
| Redis | ElastiCache | Кэш цен, rate limit, locks |
| BullMQ | backend/workers/ | Очереди скрапинга, алертов, экспорта |
| SSE | backend/sse/ | Real-time уведомления → клиент |
| ScraperAPI | backend/scraper/ | Anti-ban proxy для скрапинга |
| AWS EC2 | Продакшн | Основной сервер |
| AWS RDS | Продакшн | Managed PostgreSQL |
| AWS ElastiCache | Продакшн | Managed Redis |
| AWS S3 | Storage | Raw HTML, изображения, CSV |
| AWS Lambda | csv-generator/ | Генерация CSV без нагрузки на API |
| AWS CloudFront | CDN | React build из S3 |
| AWS SES | notifications/ | Email алерты |
| AWS Secrets Manager | config/ | Безопасное хранение секретов |
| AWS CloudWatch | monitoring/ | Логи, метрики, алерты |
| Nginx | nginx/ | Reverse proxy, SSL, rate limit |
| Docker | Dockerfile, compose | Контейнеризация, локальная среда |
| Terraform | terraform/ | IaC для AWS |
| GitHub Actions | .github/ | CI/CD автодеплой |
| MCP Server | backend/mcp/ | Claude инструменты для анализа |
| Anthropic SDK | backend/mcp/ | Вызов Claude API |

## 📝 Порядок выполнения

```
Шаг 1  → Структура проекта + CLAUDE.md
Шаг 2  → Docker Compose
Шаг 3  → NestJS инициализация
Шаг 4  → БД entities + migrations
Шаг 5  → Auth (JWT + refresh)
Шаг 6  → Products CRUD
Шаг 7  → ScraperAPI клиент + парсеры
Шаг 8  → BullMQ очереди + воркеры
Шаг 9  → SSE модуль
Шаг 10 → MCP Server + Claude AI
Шаг 11 → AWS S3 интеграция
Шаг 12 → Lambda CSV генератор
Шаг 13 → Nginx конфигурация
Шаг 14 → React frontend структура
Шаг 15 → Dashboard страница
Шаг 16 → Product Detail страница
Шаг 17 → Settings страница
Шаг 18 → Terraform AWS инфраструктура
Шаг 19 → AWS SES email
Шаг 20 → GitHub Actions CI/CD
Шаг 21 → Тесты
Шаг 22 → Health check + мониторинг
Шаг 23 → Production деплой
Шаг 24 → Финальный CLAUDE.md
```
