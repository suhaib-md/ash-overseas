CREATE TABLE `app_credentials` (
	`id` integer PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
