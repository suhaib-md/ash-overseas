CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` integer,
	`before_json` text,
	`after_json` text,
	`at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `dealers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`contact` text,
	`address` text,
	`gstin` text,
	`state_code` text,
	`type` text DEFAULT 'both' NOT NULL,
	`is_archived` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_dealers_archived` ON `dealers` (`is_archived`);--> statement-breakpoint
CREATE TABLE `ledger_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dealer_id` integer NOT NULL,
	`account` text NOT NULL,
	`entry_date` integer NOT NULL,
	`source_type` text NOT NULL,
	`source_id` integer,
	`debit_paise` integer DEFAULT 0 NOT NULL,
	`credit_paise` integer DEFAULT 0 NOT NULL,
	`running_balance_paise` integer NOT NULL,
	`label` text,
	`description` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`dealer_id`) REFERENCES `dealers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_ledger_dealer_account_date` ON `ledger_entries` (`dealer_id`,`account`,`entry_date`,`id`);--> statement-breakpoint
CREATE TABLE `money_movements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dealer_id` integer NOT NULL,
	`mode` text,
	`date` integer NOT NULL,
	`direction` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`method` text,
	`reference` text,
	`account_scope` text DEFAULT 'actual' NOT NULL,
	`notes` text,
	`is_voided` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`dealer_id`) REFERENCES `dealers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_movements_dealer` ON `money_movements` (`dealer_id`);--> statement-breakpoint
CREATE TABLE `transaction_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`transaction_id` integer NOT NULL,
	`item_name` text NOT NULL,
	`quantity` real NOT NULL,
	`unit` text,
	`actual_rate_paise` integer NOT NULL,
	`actual_amount_paise` integer NOT NULL,
	`current_rate_paise` integer NOT NULL,
	`current_amount_paise` integer NOT NULL,
	`gst_rate` real DEFAULT 0 NOT NULL,
	`gst_amount_paise` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`human_id` text NOT NULL,
	`reference_tag` text,
	`mode` text NOT NULL,
	`dealer_id` integer NOT NULL,
	`date` integer NOT NULL,
	`tax_type` text DEFAULT 'intra' NOT NULL,
	`invoice_no` text,
	`invoice_date` integer,
	`irn` text,
	`eway_bill` text,
	`discount_paise` integer DEFAULT 0 NOT NULL,
	`freight_paise` integer DEFAULT 0 NOT NULL,
	`round_off_paise` integer DEFAULT 0 NOT NULL,
	`is_credit_debit_note` integer DEFAULT false NOT NULL,
	`notes` text,
	`is_voided` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`dealer_id`) REFERENCES `dealers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_human_id_unique` ON `transactions` (`human_id`);--> statement-breakpoint
CREATE INDEX `idx_transactions_dealer` ON `transactions` (`dealer_id`);