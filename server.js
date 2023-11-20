import express from "express";
import {Pool} from 'pg';
import { findIndex } from "lodash";
import { HOURLY_TASK_SCHEDULE, DAILY_TASK_SCHEDULE, POSTGRES_HOST, POSTGRES_PORT, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB} from "./constants";
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
    const partmanMaintenanceRowIndex = findIndex(res.rows, (row) => { return row.command.includes('partman.run_maintenance'); })
    const partmanMaintenanceRow = res.rows[partmanMaintenanceRowIndex];
    if (partmanMaintenanceRow && partmanMaintenanceRow.status === 'succeeded') {
      reportInfo(`Partition maintenance successfully ended at ${partmanMaintenanceRow.end_time} `)
    } else {
      const returnMessage = partmanMaintenanceRow.return_message;
      const message = `Partition maintenance failed. Return message:\n
      ${returnMessage}`;
      reportError(message)
    }
  })
}
createScheduledImport("checkPartition", DAILY_TASK_SCHEDULE, async (onComplete = () => {}) => {
  checkLastCronScheduledPartition();
  onComplete();
  return;
});


const checkRecentDataInVehiclePosition = () => {
  const now = new Date();
  const oneHourAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours() - 1, now.getUTCMinutes(), now.getUTCSeconds()));
  const query = "SELECT COUNT(*) FROM vehicleposition WHERE tst > $1";

  pool.query(query, [oneHourAgo.toISOString()], (err, res) => {
    if (err) {
      reportError(`Error while checking vehicleposition data: ${err.message}`);
      return;
    }

    const count = res.rows[0].count;
    if (count > 0) {
      reportInfo(`Vehicle position data is up to date. Records in the last hour: ${count}`);
    } else {
      reportError("No new vehicle position data in the last hour.");
    }
  });
};

createScheduledImport("checkVehiclePositionData", HOURLY_TASK_SCHEDULE, async (onComplete = () => {}) => {
  checkRecentDataInVehiclePosition();
  onComplete();
});



export const server = () => {
  const app = express();
  app.use(express.urlencoded({ extended: true }));

  app.listen(9000, () => {
    console.log(`Server is listening on port 9000`);
  });
};
startScheduledImport("checkPartition");
startScheduledImport("checkVehiclePositionData");
server();