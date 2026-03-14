CREATE TABLE `articles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`source` text NOT NULL,
	`summary` text NOT NULL,
	`comment` text NOT NULL,
	`tags` text NOT NULL,
	`impact` integer NOT NULL,
	`is_paper` integer DEFAULT 0 NOT NULL,
	`published_at` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `articles_url_unique` ON `articles` (`url`);--> statement-breakpoint
CREATE TABLE `llm_model_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`model_name` text NOT NULL,
	`provider` text NOT NULL,
	`score` real,
	`input_price` real NOT NULL,
	`output_price` real NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`changed_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `llm_models` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`model_name` text NOT NULL,
	`provider` text NOT NULL,
	`score` real,
	`input_price` real NOT NULL,
	`output_price` real NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `llm_models_model_name_unique` ON `llm_models` (`model_name`);--> statement-breakpoint
CREATE TABLE `page_comments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `releases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`repo` text NOT NULL,
	`tag` text NOT NULL,
	`version` text NOT NULL,
	`type` text NOT NULL,
	`published_at` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `releases_repo_tag_unique` ON `releases` (`repo`,`tag`);--> statement-breakpoint
CREATE TABLE `repo_stats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`repo` text NOT NULL,
	`stars` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `security_daily` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comment` text NOT NULL,
	`vuln_ids` text,
	`release_ids` text,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `subscription_plan_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`service` text NOT NULL,
	`plan_name` text NOT NULL,
	`price` real NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`models` text NOT NULL,
	`limits` text,
	`changed_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `subscription_plans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`service` text NOT NULL,
	`plan_name` text NOT NULL,
	`price` real NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`models` text NOT NULL,
	`limits` text,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sub_plans_service_plan_unique` ON `subscription_plans` (`service`,`plan_name`);--> statement-breakpoint
CREATE TABLE `tracking_repos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`repo` text NOT NULL,
	`display_name` text NOT NULL,
	`description` text,
	`language` text,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tracking_repos_repo_unique` ON `tracking_repos` (`repo`);--> statement-breakpoint
CREATE TABLE `vulnerabilities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cve_id` text NOT NULL,
	`title` text NOT NULL,
	`cvss_score` real,
	`published_at` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vulnerabilities_cve_id_unique` ON `vulnerabilities` (`cve_id`);--> statement-breakpoint
CREATE TABLE `weekly_summaries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`content` text NOT NULL,
	`created_at` text DEFAULT (datetime('now'))
);
