-- Vibeship · таблици за абонаменти и кредити
-- Съответства на migrations/0009_military_rocket_raccoon.sql
--
-- Пусни това в конзолата на D1 (Cloudflare Dashboard → Storage & Databases →
-- D1 → vibeship-db → Console), АКО базата вече има таблиците на платформата
-- (users, apps и т.н.). За празна база ползвай full_schema.sql вместо това.
--
-- Всички заявки са с IF NOT EXISTS, така че повторно пускане е безобидно.

CREATE TABLE IF NOT EXISTS `billing_events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`user_id` text,
	`payload` text,
	`processed_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE INDEX IF NOT EXISTS `billing_events_type_idx` ON `billing_events` (`type`);
CREATE INDEX IF NOT EXISTS `billing_events_user_idx` ON `billing_events` (`user_id`);
CREATE TABLE IF NOT EXISTS `credit_balances` (
	`user_id` text PRIMARY KEY NOT NULL,
	`monthly_allowance` integer DEFAULT 0 NOT NULL,
	`monthly_used` integer DEFAULT 0 NOT NULL,
	`rollover_credits` integer DEFAULT 0 NOT NULL,
	`rollover_expires_at` integer,
	`topup_credits` integer DEFAULT 0 NOT NULL,
	`period_start` integer NOT NULL,
	`period_end` integer NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS `credit_balances_period_end_idx` ON `credit_balances` (`period_end`);
CREATE TABLE IF NOT EXISTS `credit_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`app_id` text,
	`kind` text NOT NULL,
	`action` text,
	`amount` integer NOT NULL,
	`balance_after` integer NOT NULL,
	`description` text,
	`stripe_event_id` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE INDEX IF NOT EXISTS `credit_ledger_user_idx` ON `credit_ledger` (`user_id`);
CREATE INDEX IF NOT EXISTS `credit_ledger_user_created_idx` ON `credit_ledger` (`user_id`,`created_at`);
CREATE INDEX IF NOT EXISTS `credit_ledger_app_idx` ON `credit_ledger` (`app_id`);
CREATE INDEX IF NOT EXISTS `credit_ledger_kind_idx` ON `credit_ledger` (`kind`);
CREATE TABLE IF NOT EXISTS `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`plan_id` text DEFAULT 'free' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`stripe_customer_id` text,
	`stripe_subscription_id` text,
	`stripe_price_id` text,
	`current_period_start` integer,
	`current_period_end` integer,
	`cancel_at_period_end` integer DEFAULT false,
	`seats` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE UNIQUE INDEX IF NOT EXISTS `subscriptions_user_idx` ON `subscriptions` (`user_id`);
CREATE INDEX IF NOT EXISTS `subscriptions_stripe_customer_idx` ON `subscriptions` (`stripe_customer_id`);
CREATE UNIQUE INDEX IF NOT EXISTS `subscriptions_stripe_subscription_idx` ON `subscriptions` (`stripe_subscription_id`);
CREATE INDEX IF NOT EXISTS `subscriptions_status_idx` ON `subscriptions` (`status`);
