import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000001000 implements MigrationInterface {
  name = 'InitialSchema1700000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // ── users ────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id"            UUID NOT NULL DEFAULT uuid_generate_v4(),
        "email"         VARCHAR(255) NOT NULL,
        "password_hash" VARCHAR NOT NULL,
        "name"          VARCHAR(100),
        "settings"      JSONB NOT NULL DEFAULT '{"scrapeInterval":60,"emailAlerts":false}',
        "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_users" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_email" UNIQUE ("email")
      )
    `);

    // ── refresh_tokens ───────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id"          UUID NOT NULL DEFAULT uuid_generate_v4(),
        "token_hash"  VARCHAR(64) NOT NULL,
        "user_id"     UUID NOT NULL,
        "expires_at"  TIMESTAMPTZ NOT NULL,
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_refresh_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "FK_refresh_tokens_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_refresh_tokens_user_id" ON "refresh_tokens"("user_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_refresh_tokens_hash" ON "refresh_tokens"("token_hash")`,
    );

    // ── product_status enum ──────────────────────────────────────────────────
    await queryRunner.query(
      `CREATE TYPE "product_status_enum" AS ENUM ('active', 'paused', 'error')`,
    );

    // ── products ─────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "products" (
        "id"              UUID NOT NULL DEFAULT uuid_generate_v4(),
        "user_id"         UUID NOT NULL,
        "url"             TEXT NOT NULL,
        "name"            VARCHAR(500),
        "image_url"       TEXT,
        "current_price"   DECIMAL(12,2),
        "currency"        VARCHAR(3) NOT NULL DEFAULT 'USD',
        "status"          "product_status_enum" NOT NULL DEFAULT 'active',
        "alert_threshold" DECIMAL(12,2),
        "alert_enabled"   BOOLEAN NOT NULL DEFAULT FALSE,
        "last_scraped_at" TIMESTAMPTZ,
        "next_scrape_at"  TIMESTAMPTZ,
        "error_message"   TEXT,
        "scrapes_count"   INT NOT NULL DEFAULT 0,
        "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_products" PRIMARY KEY ("id"),
        CONSTRAINT "FK_products_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_products_user_id" ON "products"("user_id")`,
    );
    // Partial index — only active products need scraping
    await queryRunner.query(`
      CREATE INDEX "idx_products_next_scrape"
        ON "products"("next_scrape_at")
        WHERE "status" = 'active'
    `);

    // ── price_history (partitioned by scraped_at) ────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "price_history" (
        "id"               BIGSERIAL,
        "product_id"       UUID NOT NULL,
        "price"            DECIMAL(12,2) NOT NULL,
        "currency"         VARCHAR(3) NOT NULL,
        "scraped_at"       TIMESTAMPTZ NOT NULL,
        "raw_data_s3_key"  TEXT,
        "created_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_price_history" PRIMARY KEY ("id", "scraped_at"),
        CONSTRAINT "FK_price_history_product"
          FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE
      ) PARTITION BY RANGE ("scraped_at")
    `);

    // Partitions — quarterly 2025 + 2026
    await queryRunner.query(`
      CREATE TABLE "price_history_2025_q1" PARTITION OF "price_history"
        FOR VALUES FROM ('2025-01-01') TO ('2025-04-01')
    `);
    await queryRunner.query(`
      CREATE TABLE "price_history_2025_q2" PARTITION OF "price_history"
        FOR VALUES FROM ('2025-04-01') TO ('2025-07-01')
    `);
    await queryRunner.query(`
      CREATE TABLE "price_history_2025_q3" PARTITION OF "price_history"
        FOR VALUES FROM ('2025-07-01') TO ('2025-10-01')
    `);
    await queryRunner.query(`
      CREATE TABLE "price_history_2025_q4" PARTITION OF "price_history"
        FOR VALUES FROM ('2025-10-01') TO ('2026-01-01')
    `);
    await queryRunner.query(`
      CREATE TABLE "price_history_2026_q1" PARTITION OF "price_history"
        FOR VALUES FROM ('2026-01-01') TO ('2026-04-01')
    `);
    await queryRunner.query(`
      CREATE TABLE "price_history_2026_q2" PARTITION OF "price_history"
        FOR VALUES FROM ('2026-04-01') TO ('2026-07-01')
    `);
    await queryRunner.query(`
      CREATE TABLE "price_history_2026_q3" PARTITION OF "price_history"
        FOR VALUES FROM ('2026-07-01') TO ('2026-10-01')
    `);
    await queryRunner.query(`
      CREATE TABLE "price_history_2026_q4" PARTITION OF "price_history"
        FOR VALUES FROM ('2026-10-01') TO ('2027-01-01')
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_ph_product_scraped"
        ON "price_history"("product_id", "scraped_at" DESC)
    `);

    // ── alert_type enum + alert_events ───────────────────────────────────────
    await queryRunner.query(
      `CREATE TYPE "alert_type_enum" AS ENUM ('price_drop', 'price_spike', 'error')`,
    );
    await queryRunner.query(`
      CREATE TABLE "alert_events" (
        "id"          UUID NOT NULL DEFAULT uuid_generate_v4(),
        "product_id"  UUID NOT NULL,
        "user_id"     UUID NOT NULL,
        "type"        "alert_type_enum" NOT NULL,
        "old_price"   DECIMAL(12,2) NOT NULL,
        "new_price"   DECIMAL(12,2) NOT NULL,
        "threshold"   DECIMAL(12,2) NOT NULL,
        "sent_at"     TIMESTAMPTZ,
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_alert_events" PRIMARY KEY ("id"),
        CONSTRAINT "FK_alert_events_product"
          FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_alert_events_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_alert_events_user_id" ON "alert_events"("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_alert_events_product_id" ON "alert_events"("product_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "alert_events"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "alert_type_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "price_history" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "products"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "product_status_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP EXTENSION IF EXISTS "uuid-ossp"`);
  }
}
