# MarketPulse — CLAUDE.md

## Project Overview

Price tracking SaaS. Users track product prices from Amazon/AliExpress.
Scraper runs via BullMQ workers using ScraperAPI proxy to avoid bans.
Real-time alerts via SSE when price drops below threshold.
Claude AI analyzes trends via MCP Server.

Three pages: Dashboard (`/`), Product Detail (`/products/:id`), Settings (`/settings`).

## Architecture

```
Client (React + TanStack Query + Zustand + SSE)
    |
Nginx (reverse proxy, SSL, rate limiting, gzip)
    |
NestJS API (port 3000)
    ├── Auth / Products / Scraper / SSE / MCP Server
    └── BullMQ Workers (ScraperWorker, AlertWorker, ExportWorker)
         |
         ├── PostgreSQL (RDS) — price history partitioned by month
         ├── Redis (ElastiCache) — cache, rate limit, distributed locks
         └── ScraperAPI — anti-ban proxy with headless Chrome
              |
              └── AWS: S3 · Lambda · CloudFront · SES · Secrets Manager · CloudWatch
                        |
                   MCP Server (Claude AI tools: analyze_price_trend, predict_best_buy_time, generate_market_report)
```

## Local Setup (5 minutes)

```bash
# 1. Copy env
cp .env.example .env

# 2. Start all services
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# 3. Run migrations (after backend is up)
docker compose exec api npm run migration:run

# Services:
#   API:            http://localhost:3000
#   Frontend:       http://localhost:5173
#   Swagger docs:   http://localhost:3000/api/docs
#   Adminer (DB):   http://localhost:8080
#   Redis UI:       http://localhost:8081
#   LocalStack:     http://localhost:4566
```

## Sub-Agents

### @scraper-agent
**Role**: Handles all scraping logic, BullMQ jobs, anti-ban patterns
**Files**: `backend/src/scraper/**`, `backend/src/workers/**`
**Best practices**:
- Always use ScraperAPI client, never direct fetch to target sites
- Every job must have: `attempts: 3`, `backoff: exponential`, `removeOnComplete: 100`
- Store raw HTML in S3 before parsing (for debugging)
- Log each scrape attempt with jobId, productId, duration, status
- Respect robots.txt: check before adding new target sites
- Use distributed Redis lock per product to prevent duplicate scraping
- Rate: max 1 scrape per product per 30 minutes (configurable in settings)

### @database-agent
**Role**: Migrations, repository pattern, query optimization
**Files**: `backend/src/*/repositories/**`, `migrations/**`
**Best practices**:
- All migrations: expand-and-contract pattern (never DROP column directly)
- Every new column: nullable first, backfill, then add constraint
- Always use EXPLAIN ANALYZE before committing any new query
- Index naming: `idx_{table}_{columns}`
- Use transactions for multi-table writes
- Never `SELECT *` — always select specific columns
- `price_history` table is partitioned by month — always include `created_at` in WHERE
- Use Read Replica for analytics queries (`GET /products/:id/history`)

### @api-agent
**Role**: NestJS controllers, services, DTOs, Guards
**Files**: `backend/src/**/*.controller.ts`, `backend/src/**/*.service.ts`
**Best practices**:
- Validate every input: class-validator + class-transformer
- Every endpoint must have: `@UseGuards(JwtAuthGuard)`, `@Throttle()`
- Never expose internal errors to client: use exception filters
- Rate limit scraper trigger endpoints: max 5/minute per user
- Idempotency-Key on scrape-trigger POST endpoint
- Use Response DTOs (never return raw DB entity)
- Log every request with requestId (interceptor)
- SSE endpoint: always handle client disconnect (`req.on('close')`)

### @frontend-agent
**Role**: React components, hooks, TanStack Query, Zustand
**Files**: `frontend/src/**`
**Best practices**:
- Feature-Sliced Design structure (app/pages/widgets/features/entities/shared)
- Server state: TanStack Query only (no Redux for server data)
- UI state: Zustand (alerts panel open, filters, theme)
- Every data-fetching component: show skeleton, not spinner
- SSE: connect in useEffect, cleanup on unmount (`eventSource.close()`)
- Invalidate TanStack Query cache on SSE price-update event
- Forms: React Hook Form + Zod for validation
- No `any` types — strict TypeScript
- Optimize re-renders: `memo()` for ProductCard list items

### @infrastructure-agent
**Role**: Docker, AWS, Terraform, CI/CD
**Files**: `terraform/**`, `.github/workflows/**`, `docker-compose.yml`, `nginx/**`
**Best practices**:
- Never hardcode secrets — use AWS Secrets Manager
- All AWS resources: tagged with `project=market-pulse`, `env=prod/staging`
- Terraform: always plan before apply, store state in S3
- Docker images: multi-stage build, non-root USER, healthcheck
- Nginx: always set rate limits, security headers, gzip
- EC2: use IAM role (not access keys) for S3/Secrets access
- RDS: enable `deletion_protection=true` in prod
- CI/CD: run tests before build, build before deploy

## Code Style

- TypeScript strict mode everywhere
- ESLint + Prettier enforced in CI
- Commit format: `feat/fix/chore/refactor: description`
- Branch naming: `feature/TASK-N-description`
- No `console.log` in production code — use Logger (NestJS) or structured logging
- All async functions: proper error handling (try/catch or Result type)

## Security Rules

- JWT: access_token 15m, refresh_token 30d, rotation on use
- Passwords: bcrypt cost=12
- SQL: TypeORM only (never raw string interpolation in queries)
- CORS: only allowed origins from env
- CSP headers via Nginx
- Dependency audit: `npm audit` in CI, fail on high severity
- ScraperAPI key: Secrets Manager only, never in env files committed to git

## Common Tasks

### Add a new site parser
1. Create `backend/src/scraper/parsers/{site}.parser.ts` implementing `IParser`
2. Register in `scraper.service.ts` `detectParser()` switch by hostname
3. Add unit test in `backend/src/scraper/parsers/{site}.parser.spec.ts`

### Add a new alert type
1. Add value to `AlertType` enum in `alert-event.entity.ts`
2. Add check logic in `scraping.processor.ts`
3. Add job to `alerts` BullMQ queue with new type
4. Handle in `alerts.processor.ts`
5. Add SSE event type in `sse.service.ts`
6. Handle in frontend `useSse.ts`

### Add a new field to Product (migration pattern)
1. Add nullable column in new migration (expand)
2. Backfill existing rows
3. Add NOT NULL constraint in follow-up migration (contract)
4. Update `product.entity.ts`, DTO, repository

### Add a new BullMQ job
1. Define job data interface in `backend/src/workers/types/`
2. Add processor method in relevant `*.processor.ts` with `@Process('job-name')`
3. Inject queue and call `queue.add('job-name', data, { attempts: 3, backoff: { type: 'exponential', delay: 30000 } })`

### Add a new SSE event type
1. Add to `SseEventType` union in `sse.service.ts`
2. Emit via `sseService.sendToUser()` in the relevant processor/service
3. Add listener in `frontend/src/shared/hooks/useSse.ts`
4. Invalidate relevant TanStack Query keys or update Zustand store

## Troubleshooting

**Scraper returned null**
- Check raw HTML in S3: `raw/{productId}/{timestamp}.html`
- Verify CSS selectors haven't changed (Amazon/AliExpress update their markup)
- Run with `render=true` ScraperAPI option for JS-heavy pages

**SSE not reaching client**
- Check Nginx config: `proxy_buffering off` must be set for `/api/sse/stream`
- Check `Connection: ''` header (no Upgrade for SSE)
- Verify `req.on('close')` cleanup is working (no memory leak)

**BullMQ job stuck**
- Check Redis: `redis-cli LRANGE bull:scraping:waiting 0 -1`
- Check for distributed lock not released: `redis-cli DEL product:lock:{productId}`
- View failed jobs: Redis Commander at `http://localhost:8081`

**Migration failed**
- Revert: `npm run migration:revert` (reverts one migration)
- Check `typeorm_migrations` table for state
- Follow expand-and-contract: never drop columns in same migration as adding them
