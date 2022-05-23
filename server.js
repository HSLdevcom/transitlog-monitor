import express from "express";
import {Pool} from 'pg';
import { findIndex } from "lodash";
import { exec } from "child_process";
import { DAILY_TASK_SCHEDULE, EVERY_MINUTE_TASK_SCHEDULE, POSTGRES_HOST, POSTGRES_PORT, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB} from "./constants";
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
  pool.query("SELECT * FROM cron.job_run_details ORDER BY start_time DESC", (err, res) => {
    if (err) {
      reportError(err)
    }
    if (!res) {
      reportError('No response.')
      return;
    }
    const partmanMaintenanceRowIndex = findIndex(res.rows, (row) => { return row.command.includes('partman.run_maintenance'); })
    const partmanMaintenanceRow = res.rows[partmanMaintenanceRowIndex];
    if (partmanMaintenanceRow && partmanMaintenanceRow.status === 'succeeded') {
      reportInfo(`Partition maintenance successfully ended at ${partmanMaintenanceRow.end_time} `)
    } else {
      const returnMessage = partmanMaintenanceRow.return_message ? partmanMaintenanceRow.return_message : 'No message.';
      const message = `Partition maintenance failed. Return message:\n
      ${returnMessage}`;
      reportError(message)
    }
  })
}

createScheduledImport("checkHfpSplitSink", EVERY_MINUTE_TASK_SCHEDULE, async (onComplete = () => {}) => {
  const environment = process.env.ENVIRONMENT;
  const serviceName = `transitlog-sink-${environment}_transitlog_hfp_split_sink`;
  console.log('serviceName', serviceName)
  exec(`docker service inspect -f '{{ .UpdateStatus.StartedAt }}' ${serviceName}`, (error, stdout, stderr) => {
    console.log(`docker service inspect -f '{{ .UpdateStatus.StartedAt }}`)
    const startedAt = stdout.trim();
    console.log(stdout);
    console.log(startedAt);
    const diff = Date.now() - Date.parse(startedAt);
    const diffInMinutes = diff / 60000;
    let errorMessage = null;
    if (diffInMinutes < 3) {
      errorMessage = `${serviceName} low uptime. Currently up for ${diffInMinutes} minutes.`
    }
    if (!diffInMinutes) {
      errorMessage = `${serviceName} is down.`
    }
    console.log("diff: " + diffInMinutes)
    if (errorMessage) {
      console.log(errorMessage)
      // reportError(errorMessage);
    }
  });
  onComplete();
  return;
});

createScheduledImport("checkPartition", DAILY_TASK_SCHEDULE, async (onComplete = () => {}) => {
  checkLastCronScheduledPartition();
  onComplete();
  return;
});

export const server = () => {
  const app = express();

  app.use(express.urlencoded({ extended: true }));

  app.listen(9000, () => {
    console.log(`Server is listening on port 9000`);
  });
};
startScheduledImport("checkHfpSplitSink");
startScheduledImport("checkPartition");
server();