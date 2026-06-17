# MarketPulse — Price Tracker & Market Analytics

A fullstack price monitoring service. Users add product URLs from Amazon/AliExpress, the system periodically scrapes prices via ScraperAPI (anti-ban proxy), stores history, and sends real-time SSE alerts when a price drops below a threshold. Claude AI analyzes trends and recommends the best time to buy.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite + TanStack Query + Zustand |
| Backend | NestJS (TypeScript) |
| Database | PostgreSQL 16 (partitioned price_history) |
| Cache / Queue | Redis 7 + BullMQ |
| Real-time | SSE (Server-Sent Events) |
| Scraping | ScraperAPI (proxy rotation + headless Chrome) |
| AI Analysis | Claude via MCP Server (Anthropic SDK) |
| Storage | AWS S3 (images, raw HTML, CSV exports) |
| Email | AWS SES |
| Infra | EC2 + RDS + ElastiCache + CloudFront + Lambda |
| IaC | Terraform |
| Proxy | Nginx (SSL, rate limiting, gzip) |
| CI/CD | GitHub Actions |
| Containers | Docker + Docker Compose |

## Quick Start (Local)

### Prerequisites
- Docker & Docker Compose
- Node.js 20+

### 1. Clone and configure

```bash
git clone git@github.com:cstruchevs/marketPulse.git
cd marketPulse
cp .env.example .env
# Edit .env and fill in your SCRAPER_API_KEY and ANTHROPIC_API_KEY
```

### 2. Start all services

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

This starts:
- **PostgreSQL** on `localhost:5432`
- **Redis** on `localhost:6379`
- **Adminer** (DB UI) on `http://localhost:8080`
- **Redis Commander** on `http://localhost:8081`
- **LocalStack** (AWS emulation) on `http://localhost:4566`
- **NestJS API** on `http://localhost:3000` (hot reload)
- **React Frontend** on `http://localhost:5173` (hot reload)

### 3. Run database migrations

```bash
docker compose exec api npm run migration:run
```

### 4. Open the app

| URL | Description |
|-----|-------------|
| `http://localhost:5173` | React frontend |
| `http://localhost:3000/api/docs` | Swagger API docs |
| `http://localhost:8080` | Adminer (PostgreSQL UI) |
| `http://localhost:8081` | Redis Commander |

## Project Structure

```
marketPulse/
├── .github/workflows/      # CI/CD (GitHub Actions)
│   ├── backend.yml
│   ├── frontend.yml
│   └── lambda.yml
├── backend/                # NestJS API + BullMQ Workers
│   └── src/
│       ├── auth/           # JWT + refresh token rotation
│       ├── users/          # User entity & repository
│       ├── products/       # Product CRUD
│       ├── price-history/  # Timeseries price data
│       ├── scraper/        # ScraperAPI client + parsers
│       ├── workers/        # BullMQ processors + scheduler
│       ├── alerts/         # Alert rules + events
│       ├── sse/            # Server-Sent Events
│       ├── export/         # CSV export
│       ├── mcp/            # MCP Server (Claude AI tools)
│       └── common/         # Filters, interceptors, guards
├── frontend/               # React + Vite (Feature-Sliced Design)
│   └── src/
│       ├── app/            # Providers, router, stores
│       ├── pages/          # Dashboard, ProductDetail, Settings
│       ├── widgets/        # Header, AlertsPanel, ProductList
│       ├── features/       # AddProduct, PriceChart, ExportCsv, AiAnalysis
│       ├── entities/       # product/, user/ (API + types + UI)
│       └── shared/         # axios, hooks, UI primitives
├── nginx/                  # Nginx config (SSL, rate limiting, SSE)
├── terraform/              # AWS infrastructure (VPC, EC2, RDS, S3, Lambda)
├── lambda/csv-generator/   # AWS Lambda for CSV export generation
├── docker-compose.yml      # Base services (Postgres, Redis, tooling)
├── docker-compose.dev.yml  # Dev overrides (API + frontend with hot reload)
├── .env.example            # All required environment variables
└── CLAUDE.md               # AI agent instructions & project context
```

## Pages

| Page | Route | Description |
|------|-------|-------------|
| Dashboard | `/` | Tracked products list, current prices, scraper status, real-time alerts |
| Product Detail | `/products/:id` | Price history chart, alert threshold, AI trend analysis, CSV export |
| Settings | `/settings` | Scrape interval, notifications, account management, queue stats |

## Development Commands

```bash
# Start dev environment
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# View logs
docker compose logs -f api
docker compose logs -f frontend

# Run migrations
docker compose exec api npm run migration:run

# Revert last migration
docker compose exec api npm run migration:revert

# Run backend tests
docker compose exec api npm run test
docker compose exec api npm run test:e2e

# Stop everything
docker compose -f docker-compose.yml -f docker-compose.dev.yml down
```

## Environment Variables

See [.env.example](.env.example) for all required variables.

Key variables:
- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` — Redis connection string
- `JWT_SECRET` / `JWT_REFRESH_SECRET` — JWT signing secrets
- `SCRAPER_API_KEY` — ScraperAPI key (get at scraperapi.com)
- `ANTHROPIC_API_KEY` — Claude API key for AI analysis
- `AWS_*` — AWS credentials and configuration
