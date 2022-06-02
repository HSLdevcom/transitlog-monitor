import express from "express";
import {Pool} from 'pg';
import { findIndex } from "lodash";
import fs from 'fs';
import { DAILY_TASK_SCHEDULE, HOURLY_TASK_SCHEDULE, POSTGRES_HOST, POSTGRES_PORT, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB} from "./constants";
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
createScheduledImport("checkHfpSplitSink", HOURLY_TASK_SCHEDULE, async (onComplete = () => {}) => {
  const environment = process.env.ENVIRONMENT;
  const serviceName = `transitlog-sink-${environment}_transitlog_hfp_split_sink`;

  const pipePath = "/hostpipe/hostpipe"
  const outputPath = "/hostpipe/output.txt"
  const commandToRun = `docker service ps ${serviceName} --format {{.CurrentState}}`

  if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
  
  const wstream = fs.createWriteStream(pipePath)
  wstream.write(commandToRun)
  wstream.close()

  const timeout = 10000
  const timeoutStart = Date.now()
  console.log(serviceName);
  const myLoop = setInterval(function () {
      if (Date.now() - timeoutStart > timeout) {
          clearInterval(myLoop);
          console.log("Timed out. Could not find docker output.")
          reportError(`${serviceName} monitoring error: Timed out. Could not find docker output.`);
      } else {
          if (fs.existsSync(outputPath)) {
              clearInterval(myLoop);
              const data = fs.readFileSync(outputPath).toString().trim();
              if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
              const splitByRow = data.split('ago');
              if (!splitByRow || !splitByRow.length) {
                console.log("Something went wrong. No docker service data.");
                return;
              }
              const currentUpTime = splitByRow[0].includes('Running') ? splitByRow[0].match(/\d+/)[0] : 0;
              const failCountWithinHour = splitByRow.reduce(
                (accumulator, currentValue) => accumulator.concat(currentValue), []
              ).filter(item => (item.includes('Failed') || item.includes('Shutdown')) && item.includes('minutes')).length
              console.log(`${serviceName} failed ${failCountWithinHour} times within last hour. Currently up for ${currentUpTime} minutes.`);
              if (failCountWithinHour > 3) {
                const errorMessage = `${serviceName} failed ${failCountWithinHour} times within last hour. Latest instance: ${splitByRow[0]}`;
                reportError(errorMessage);
              }

          }
      }
  }, 300);
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