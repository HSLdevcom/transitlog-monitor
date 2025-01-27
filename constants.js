
export const MONITOR_SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || "";
export const SLACK_MONITOR_MENTION = process.env.SLACK_MONITOR_MENTION || "";
export const DAILY_TASK_SCHEDULE = process.env.DAILY_TASK_SCHEDULE || "0 0 12 * * *";
export const HOURLY_TASK_SCHEDULE = process.env.HOURLY_TASK_SCHEDULE || "0 0 * * * *";

export const ENVIRONMENT = process.env.ENVIRONMENT || "unknown";

export const POSTGRES_HOST = process.env.POSTGRES_HOST || "";
export const POSTGRES_PORT = process.env.POSTGRES_PORT || "";
export const POSTGRES_USER = process.env.POSTGRES_USER || "";
export const POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "";
export const POSTGRES_DB = process.env.POSTGRES_DB || "";
