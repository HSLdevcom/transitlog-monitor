import express from "express";
import {Pool} from 'pg';
import { findIndex } from "lodash";
import { DAILY_TASK_SCHEDULE, POSTGRES_HOST, POSTGRES_PORT, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB} from "./constants";
import { reportInfo, reportError } from "./reporter";
import { createScheduledImport, startScheduledImport } from "./schedule";

const pool = new Pool({
  user: POSTGRES_USER,
  host: POSTGRES_HOST,
  dbname: POSTGRES_DB,
  password: POSTGRES_PASSWORD,
  port: POSTGRES_PORT,
  ssl: true
})

const checkLastCronScheduledPartition = () => {
  pool.query("SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10", (err, res) => {
    const partmanMaintenanceRowIndex = findIndex(res.rows, (row) => { return row.command.includes('partman.run_maintenance'); })
    const partmanMaintenanceRow = res.rows[partmanMaintenanceRowIndex];
    if (partmanMaintenanceRow && partmanMaintenanceRow.status === 'succeeded') {
      reportInfo(`Partition maintenance successfully ended at ${partmanMaintenanceRow.end_time} `)
    } else {
      reportError(`Partition maintenance failed.`)
    }
  })
}

createScheduledImport("checkPartition", DAILY_TASK_SCHEDULE, async (onComplete = () => {}) => {
  checkLastCronScheduledPartition()
  return;
});

export const server = () => {
  const app = express();

  app.use(express.urlencoded({ extended: true }));

  app.listen(9000, () => {
    console.log(`Server is listening on port 9000`);
  });
};

startScheduledImport("checkPartition");
server();