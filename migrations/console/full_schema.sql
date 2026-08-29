-- Vibeship · пълна схема на базата
--
-- Генерирана от worker/database/schema.ts с `drizzle-kit export` — това е
-- крайното състояние след всички миграции, без междинните стъпки.
-- Пусни я в конзолата на D1 само върху ПРАЗНА база.
--
-- Всички заявки са с IF NOT EXISTS, така че повторно пускане е безобидно.
--
-- Внимание: след ръчно пускане тук wrangler не знае, че миграциите са
-- минали. Ако после пуснеш `bun run db:migrate:remote`, той ще опита да ги
-- приложи отново — заявките за таблици и индекси ще се разминат безобидно,
-- но ALTER TABLE стъпките в по-старите миграции ще гръмнат. Избери един от
-- двата пътя и се придържай към него.

CREATE TABLE IF NOT EXISTS `ai_gateways` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`cloudflare_account_id` text NOT NULL,
	`gateway_id` text NOT NULL,
	`gateway_name` text NOT NULL,
	`gateway_slug` text NOT NULL,
	`credits_remaining` real DEFAULT 0,
	`credits_last_updated` integer,
	`auto_created` integer DEFAULT false,
	`is_active` integer DEFAULT false,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`cloudflare_account_id`) REFERENCES `cloudflare_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS `ai_gateways_user_idx` ON `ai_gateways` (`user_id`);
CREATE INDEX IF NOT EXISTS `ai_gateways_account_idx` ON `ai_gateways` (`cloudflare_account_id`);
CREATE INDEX IF NOT EXISTS `ai_gateways_user_account_idx` ON `ai_gateways` (`user_id`,`cloudflare_account_id`);
CREATE UNIQUE INDEX IF NOT EXISTS `ai_gateways_gateway_id_idx` ON `ai_gateways` (`cloudflare_account_id`,`gateway_id`);
CREATE TABLE IF NOT EXISTS `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`key_hash` text NOT NULL,
	`key_preview` text NOT NULL,
	`scopes` text NOT NULL,
	`is_active` integer DEFAULT true,
	`last_used` integer,
	`request_count` integer DEFAULT 0,
	`expires_at` integer,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE UNIQUE INDEX IF NOT EXISTS `api_keys_key_hash_unique` ON `api_keys` (`key_hash`);
CREATE INDEX IF NOT EXISTS `api_keys_user_id_idx` ON `api_keys` (`user_id`);
CREATE INDEX IF NOT EXISTS `api_keys_key_hash_idx` ON `api_keys` (`key_hash`);
CREATE INDEX IF NOT EXISTS `api_keys_is_active_idx` ON `api_keys` (`is_active`);
CREATE INDEX IF NOT EXISTS `api_keys_expires_at_idx` ON `api_keys` (`expires_at`);
CREATE TABLE IF NOT EXISTS `app_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`user_id` text NOT NULL,
	`content` text NOT NULL,
	`parent_comment_id` text,
	`is_edited` integer DEFAULT false,
	`is_deleted` integer DEFAULT false,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS `app_comments_app_idx` ON `app_comments` (`app_id`);
CREATE INDEX IF NOT EXISTS `app_comments_user_idx` ON `app_comments` (`user_id`);
CREATE INDEX IF NOT EXISTS `app_comments_parent_idx` ON `app_comments` (`parent_comment_id`);
CREATE TABLE IF NOT EXISTS `app_likes` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`user_id` text NOT NULL,
	`reaction_type` text DEFAULT 'like' NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE UNIQUE INDEX IF NOT EXISTS `app_likes_app_user_idx` ON `app_likes` (`app_id`,`user_id`);
CREATE INDEX IF NOT EXISTS `app_likes_user_idx` ON `app_likes` (`user_id`);
CREATE TABLE IF NOT EXISTS `app_views` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`user_id` text,
	`session_token` text,
	`ip_address_hash` text,
	`viewer_hash` text,
	`referrer` text,
	`user_agent` text,
	`device_type` text,
	`viewed_at` integer DEFAULT CURRENT_TIMESTAMP,
	`duration_seconds` integer,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS `app_views_app_idx` ON `app_views` (`app_id`);
CREATE INDEX IF NOT EXISTS `app_views_user_idx` ON `app_views` (`user_id`);
CREATE INDEX IF NOT EXISTS `app_views_viewed_at_idx` ON `app_views` (`viewed_at`);
CREATE INDEX IF NOT EXISTS `app_views_app_viewed_at_idx` ON `app_views` (`app_id`,`viewed_at`);
CREATE UNIQUE INDEX IF NOT EXISTS `app_views_app_viewer_idx` ON `app_views` (`app_id`,`viewer_hash`);
CREATE TABLE IF NOT EXISTS `apps` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`icon_url` text,
	`original_prompt` text NOT NULL,
	`final_prompt` text,
	`framework` text,
	`user_id` text,
	`session_token` text,
	`visibility` text DEFAULT 'private' NOT NULL,
	`status` text DEFAULT 'generating' NOT NULL,
	`deployment_id` text,
	`github_repository_url` text,
	`github_repository_visibility` text,
	`is_archived` integer DEFAULT false,
	`is_featured` integer DEFAULT false,
	`version` integer DEFAULT 1,
	`parent_app_id` text,
	`preview_version` integer DEFAULT 0 NOT NULL,
	`screenshot_url` text,
	`screenshot_captured_at` integer,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP,
	`last_deployed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS `apps_user_idx` ON `apps` (`user_id`);
CREATE INDEX IF NOT EXISTS `apps_status_idx` ON `apps` (`status`);
CREATE INDEX IF NOT EXISTS `apps_visibility_idx` ON `apps` (`visibility`);
CREATE INDEX IF NOT EXISTS `apps_session_token_idx` ON `apps` (`session_token`);
CREATE INDEX IF NOT EXISTS `apps_parent_app_idx` ON `apps` (`parent_app_id`);
CREATE INDEX IF NOT EXISTS `apps_search_idx` ON `apps` (`title`,`description`);
CREATE INDEX IF NOT EXISTS `apps_framework_status_idx` ON `apps` (`framework`,`status`);
CREATE INDEX IF NOT EXISTS `apps_visibility_status_idx` ON `apps` (`visibility`,`status`);
CREATE INDEX IF NOT EXISTS `apps_created_at_idx` ON `apps` (`created_at`);
CREATE INDEX IF NOT EXISTS `apps_updated_at_idx` ON `apps` (`updated_at`);
CREATE TABLE IF NOT EXISTS `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`old_values` text,
	`new_values` text,
	`ip_address` text,
	`user_agent` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE INDEX IF NOT EXISTS `audit_logs_user_idx` ON `audit_logs` (`user_id`);
CREATE INDEX IF NOT EXISTS `audit_logs_entity_idx` ON `audit_logs` (`entity_type`,`entity_id`);
CREATE INDEX IF NOT EXISTS `audit_logs_created_at_idx` ON `audit_logs` (`created_at`);
CREATE TABLE IF NOT EXISTS `auth_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`identifier` text NOT NULL,
	`attempt_type` text NOT NULL,
	`success` integer NOT NULL,
	`ip_address` text NOT NULL,
	`user_agent` text,
	`attempted_at` integer DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS `auth_attempts_lookup_idx` ON `auth_attempts` (`identifier`,`attempted_at`);
CREATE INDEX IF NOT EXISTS `auth_attempts_ip_idx` ON `auth_attempts` (`ip_address`,`attempted_at`);
CREATE INDEX IF NOT EXISTS `auth_attempts_success_idx` ON `auth_attempts` (`success`,`attempted_at`);
CREATE INDEX IF NOT EXISTS `auth_attempts_type_idx` ON `auth_attempts` (`attempt_type`,`attempted_at`);
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
CREATE TABLE IF NOT EXISTS `cloudflare_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`account_name` text NOT NULL,
	`account_email` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP,
	`last_synced_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS `cloudflare_accounts_user_idx` ON `cloudflare_accounts` (`user_id`);
CREATE INDEX IF NOT EXISTS `cloudflare_accounts_account_id_idx` ON `cloudflare_accounts` (`account_id`);
CREATE UNIQUE INDEX IF NOT EXISTS `cloudflare_accounts_user_account_idx` ON `cloudflare_accounts` (`user_id`,`account_id`);
CREATE TABLE IF NOT EXISTS `comment_likes` (
	`id` text PRIMARY KEY NOT NULL,
	`comment_id` text NOT NULL,
	`user_id` text NOT NULL,
	`reaction_type` text DEFAULT 'like' NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`comment_id`) REFERENCES `app_comments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE UNIQUE INDEX IF NOT EXISTS `comment_likes_comment_user_idx` ON `comment_likes` (`comment_id`,`user_id`);
CREATE INDEX IF NOT EXISTS `comment_likes_user_idx` ON `comment_likes` (`user_id`);
CREATE INDEX IF NOT EXISTS `comment_likes_comment_idx` ON `comment_likes` (`comment_id`);
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
CREATE TABLE IF NOT EXISTS `email_verification_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`email` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used` integer DEFAULT false,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE UNIQUE INDEX IF NOT EXISTS `email_verification_tokens_token_hash_unique` ON `email_verification_tokens` (`token_hash`);
CREATE INDEX IF NOT EXISTS `email_verification_tokens_lookup_idx` ON `email_verification_tokens` (`token_hash`);
CREATE INDEX IF NOT EXISTS `email_verification_tokens_expiry_idx` ON `email_verification_tokens` (`expires_at`);
CREATE TABLE IF NOT EXISTS `favorites` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`app_id` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE UNIQUE INDEX IF NOT EXISTS `favorites_user_app_idx` ON `favorites` (`user_id`,`app_id`);
CREATE INDEX IF NOT EXISTS `favorites_user_idx` ON `favorites` (`user_id`);
CREATE INDEX IF NOT EXISTS `favorites_app_idx` ON `favorites` (`app_id`);
CREATE TABLE IF NOT EXISTS `oauth_states` (
	`id` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`provider` text NOT NULL,
	`redirect_uri` text,
	`scopes` text DEFAULT '[]',
	`user_id` text,
	`code_verifier` text,
	`nonce` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`expires_at` integer NOT NULL,
	`is_used` integer DEFAULT false,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE UNIQUE INDEX IF NOT EXISTS `oauth_states_state_unique` ON `oauth_states` (`state`);
CREATE UNIQUE INDEX IF NOT EXISTS `oauth_states_state_idx` ON `oauth_states` (`state`);
CREATE INDEX IF NOT EXISTS `oauth_states_expires_at_idx` ON `oauth_states` (`expires_at`);
CREATE TABLE IF NOT EXISTS `password_reset_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used` integer DEFAULT false,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE UNIQUE INDEX IF NOT EXISTS `password_reset_tokens_token_hash_unique` ON `password_reset_tokens` (`token_hash`);
CREATE INDEX IF NOT EXISTS `password_reset_tokens_lookup_idx` ON `password_reset_tokens` (`token_hash`);
CREATE INDEX IF NOT EXISTS `password_reset_tokens_expiry_idx` ON `password_reset_tokens` (`expires_at`);
CREATE TABLE IF NOT EXISTS `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`device_info` text,
	`user_agent` text,
	`ip_address` text,
	`is_revoked` integer DEFAULT false,
	`revoked_at` integer,
	`revoked_reason` text,
	`access_token_hash` text NOT NULL,
	`refresh_token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`last_activity` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS `sessions_user_id_idx` ON `sessions` (`user_id`);
CREATE INDEX IF NOT EXISTS `sessions_expires_at_idx` ON `sessions` (`expires_at`);
CREATE INDEX IF NOT EXISTS `sessions_access_token_hash_idx` ON `sessions` (`access_token_hash`);
CREATE INDEX IF NOT EXISTS `sessions_refresh_token_hash_idx` ON `sessions` (`refresh_token_hash`);
CREATE INDEX IF NOT EXISTS `sessions_last_activity_idx` ON `sessions` (`last_activity`);
CREATE INDEX IF NOT EXISTS `sessions_is_revoked_idx` ON `sessions` (`is_revoked`);
CREATE TABLE IF NOT EXISTS `stars` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`app_id` text NOT NULL,
	`starred_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE UNIQUE INDEX IF NOT EXISTS `stars_user_app_idx` ON `stars` (`user_id`,`app_id`);
CREATE INDEX IF NOT EXISTS `stars_user_idx` ON `stars` (`user_id`);
CREATE INDEX IF NOT EXISTS `stars_app_idx` ON `stars` (`app_id`);
CREATE INDEX IF NOT EXISTS `stars_app_starred_at_idx` ON `stars` (`app_id`,`starred_at`);
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
CREATE TABLE IF NOT EXISTS `system_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`value` text,
	`description` text,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP,
	`updated_by` text,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE UNIQUE INDEX IF NOT EXISTS `system_settings_key_unique` ON `system_settings` (`key`);
CREATE UNIQUE INDEX IF NOT EXISTS `system_settings_key_idx` ON `system_settings` (`key`);
CREATE TABLE IF NOT EXISTS `user_model_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`agent_action_name` text NOT NULL,
	`model_name` text,
	`max_tokens` integer,
	`temperature` real,
	`reasoning_effort` text,
	`provider_override` text,
	`fallback_model` text,
	`is_active` integer DEFAULT true,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE UNIQUE INDEX IF NOT EXISTS `user_model_configs_user_agent_idx` ON `user_model_configs` (`user_id`,`agent_action_name`);
CREATE INDEX IF NOT EXISTS `user_model_configs_user_idx` ON `user_model_configs` (`user_id`);
CREATE INDEX IF NOT EXISTS `user_model_configs_is_active_idx` ON `user_model_configs` (`is_active`);
CREATE TABLE IF NOT EXISTS `user_model_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`base_url` text NOT NULL,
	`secret_id` text,
	`is_active` integer DEFAULT true,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE UNIQUE INDEX IF NOT EXISTS `user_model_providers_user_name_idx` ON `user_model_providers` (`user_id`,`name`);
CREATE INDEX IF NOT EXISTS `user_model_providers_user_idx` ON `user_model_providers` (`user_id`);
CREATE INDEX IF NOT EXISTS `user_model_providers_is_active_idx` ON `user_model_providers` (`is_active`);
CREATE TABLE IF NOT EXISTS `user_oauth_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_id` text NOT NULL,
	`email` text,
	`email_verified` integer DEFAULT false,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE UNIQUE INDEX IF NOT EXISTS `user_oauth_identities_provider_unique_idx` ON `user_oauth_identities` (`provider`,`provider_id`);
CREATE INDEX IF NOT EXISTS `user_oauth_identities_user_idx` ON `user_oauth_identities` (`user_id`);
CREATE TABLE IF NOT EXISTS `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`username` text,
	`display_name` text NOT NULL,
	`avatar_url` text,
	`bio` text,
	`provider` text NOT NULL,
	`provider_id` text NOT NULL,
	`email_verified` integer DEFAULT false,
	`password_hash` text,
	`failed_login_attempts` integer DEFAULT 0,
	`locked_until` integer,
	`password_changed_at` integer,
	`preferences` text DEFAULT '{}',
	`theme` text DEFAULT 'system',
	`timezone` text DEFAULT 'UTC',
	`ai_gateway_enabled` integer,
	`is_active` integer DEFAULT true,
	`is_suspended` integer DEFAULT false,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP,
	`last_active_at` integer,
	`deleted_at` integer
);

CREATE UNIQUE INDEX IF NOT EXISTS `users_email_unique` ON `users` (`email`);
CREATE UNIQUE INDEX IF NOT EXISTS `users_username_unique` ON `users` (`username`);
CREATE INDEX IF NOT EXISTS `users_email_idx` ON `users` (`email`);
CREATE UNIQUE INDEX IF NOT EXISTS `users_provider_unique_idx` ON `users` (`provider`,`provider_id`);
CREATE INDEX IF NOT EXISTS `users_username_idx` ON `users` (`username`);
CREATE INDEX IF NOT EXISTS `users_failed_login_attempts_idx` ON `users` (`failed_login_attempts`);
CREATE INDEX IF NOT EXISTS `users_locked_until_idx` ON `users` (`locked_until`);
CREATE INDEX IF NOT EXISTS `users_is_active_idx` ON `users` (`is_active`);
CREATE INDEX IF NOT EXISTS `users_last_active_at_idx` ON `users` (`last_active_at`);
CREATE TABLE IF NOT EXISTS `verification_otps` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`otp` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used` integer DEFAULT false,
	`used_at` integer,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS `verification_otps_email_idx` ON `verification_otps` (`email`);
CREATE INDEX IF NOT EXISTS `verification_otps_expires_at_idx` ON `verification_otps` (`expires_at`);
CREATE INDEX IF NOT EXISTS `verification_otps_used_idx` ON `verification_otps` (`used`);
