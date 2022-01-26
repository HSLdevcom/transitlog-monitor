import { mapValues, orderBy } from "lodash";
import fs from "fs-extra";

const SECRETS_PATH = "/run/secrets/";

// Check each env var and see if it has a value in the secrets. In that case, use the
// secret value. Otherwise use the env var. Using sync fs methods for the sake of
// simplicity, since this will only run once when staring the app, sync is OK.
const secrets = (fs.existsSync(SECRETS_PATH) && fs.readdirSync(SECRETS_PATH)) || [];

const secretsEnv = mapValues(process.env, (value, key) => {
  const matchingSecrets = secrets.filter((secretFile) => secretFile.startsWith(key));

  const currentSecret =
    orderBy(
      matchingSecrets,
      (secret) => {
        const secretVersion = parseInt(secret[secret.length - 1], 10);
        return isNaN(secretVersion) ? 0 : secretVersion;
      },
      "desc",
    )[0] || null;

  const filepath = SECRETS_PATH + currentSecret;

  if (fs.existsSync(filepath)) {
    return (fs.readFileSync(filepath, { encoding: "utf8" }) || "").trim();
  }

  return value;
});

export const MONITOR_SLACK_WEBHOOK_URL = secretsEnv.MONITOR_SLACK_WEBHOOK_URL || "";
export const SLACK_MONITOR_MENTION = secretsEnv.SLACK_MONITOR_MENTION || "";
export const DAILY_TASK_SCHEDULE = secretsEnv.DAILY_TASK_SCHEDULE || "0 0 12 * * *";
export const ENVIRONMENT = secretsEnv.ENVIRONMENT || "unknown";

export const POSTGRES_HOST = secretsEnv.POSTGRES_HOST || "";
export const POSTGRES_PORT = secretsEnv.POSTGRES_PORT || "";
export const POSTGRES_USER = secretsEnv.POSTGRES_USER || "";
export const POSTGRES_PASSWORD = secretsEnv.POSTGRES_PASSWORD || "";
export const POSTGRES_DB = secretsEnv.POSTGRES_DB || "";