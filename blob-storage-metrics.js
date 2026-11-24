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
    let csvCount = 0;
    let totalBytes = 0;

    for await (const blob of containerClient.listBlobsFlat({ prefix: `${dateStr}T` })) {
      if (!blob.name.endsWith(".csv.zst")) continue;
      const size = blob.properties.contentLength;
      if (!Number.isSafeInteger(size) || size < 0 || !Number.isSafeInteger(totalBytes + size)) {
        throw new Error(`Invalid content length for blob ${blob.name}`);
      }
      csvCount += 1;
      totalBytes += size;
    }

    await database.query(
      `INSERT INTO monitoring.blob_storage_metrics (metric_date, csv_file_count, total_size_bytes)
       VALUES ($1, $2, $3)
       ON CONFLICT (metric_date) DO UPDATE SET
         csv_file_count = EXCLUDED.csv_file_count,
         total_size_bytes = EXCLUDED.total_size_bytes,
         updated_at = CURRENT_TIMESTAMP`,
      [dateStr, csvCount, totalBytes],
    );
    console.log(`Blob storage metrics for ${dateStr}: ${csvCount} CSV files, ${totalBytes} bytes`);
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
