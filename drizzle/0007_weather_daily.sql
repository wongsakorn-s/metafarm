CREATE TABLE `weather_daily` (
	`date` text PRIMARY KEY NOT NULL,
	`t_max` real,
	`t_min` real,
	`rain_mm` real,
	`humidity` real,
	`source` text DEFAULT 'nasa-power' NOT NULL,
	`fetched_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
