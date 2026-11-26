import { BlobServiceClient } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";
import pg from "pg";
import {
  AZURE_STORAGE_ACCOUNT_NAME, AZURE_BLOB_CONTAINER_NAME,
  POSTGRES_HOST, POSTGRES_PORT, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB,
} from "./constants.js";

const { Pool } = pg;
const pool = new Pool({
  user: POSTGRES_USER,
  host: POSTGRES_HOST,
  database: POSTGRES_DB,
  password: POSTGRES_PASSWORD,
  port: POSTGRES_PORT,
  ssl: true,
});

export async function collectBlobStorageMetrics(containerClient, database, now = new Date()) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

  for (const date of [yesterday, today]) {
    const dateStr = date.toISOString().slice(0, 10);
    const lastHour = date.getTime() === today.getTime() ? now.getUTCHours() : 23;
    const counts = Array(lastHour + 1).fill(0);
    const sizes = Array(lastHour + 1).fill(0);

    for await (const blob of containerClient.listBlobsFlat({ prefix: `${dateStr}T` })) {
      if (!blob.name.endsWith(".csv.zst")) continue;
      const hourMatch = blob.name.slice(dateStr.length + 1).match(/^([01]\d|2[0-3])-/);
      if (!hourMatch) {
        throw new Error(`Invalid UTC hour in blob name ${blob.name}`);
      }
      const hour = Number(hourMatch[1]);
      if (hour > lastHour) continue;
      const size = blob.properties.contentLength;
      if (!Number.isSafeInteger(size) || size < 0 || !Number.isSafeInteger(sizes[hour] + size)) {
        throw new Error(`Invalid content length for blob ${blob.name}`);
      }
      counts[hour] += 1;
      sizes[hour] += size;
    }

    const hours = counts.map((_, hour) => `${dateStr}T${String(hour).padStart(2, "0")}:00:00.000Z`);
    await database.query(
      `INSERT INTO monitoring.blob_storage_hourly_metrics (metric_hour, csv_file_count, total_size_bytes)
       SELECT * FROM unnest($1::timestamptz[], $2::integer[], $3::bigint[])
       ON CONFLICT (metric_hour) DO UPDATE SET
         csv_file_count = EXCLUDED.csv_file_count,
         total_size_bytes = EXCLUDED.total_size_bytes,
         updated_at = CURRENT_TIMESTAMP`,
      [hours, counts, sizes],
    );
    console.log(`Blob storage hourly metrics refreshed for ${dateStr} through hour ${lastHour} UTC`);
  }
}

export async function refreshBlobStorageMetrics() {
  if (!AZURE_STORAGE_ACCOUNT_NAME || !AZURE_BLOB_CONTAINER_NAME) {
    throw new Error("AZURE_STORAGE_ACCOUNT_NAME and AZURE_BLOB_CONTAINER_NAME must be configured");
  }
  const client = new BlobServiceClient(
    `https://${AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net`,
    new DefaultAzureCredential(),
  );
  await collectBlobStorageMetrics(client.getContainerClient(AZURE_BLOB_CONTAINER_NAME), pool);
}
