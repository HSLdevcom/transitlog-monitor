import express from "express";
import pg from "pg";
import { HOURLY_TASK_SCHEDULE, DAILY_TASK_SCHEDULE, POSTGRES_HOST, POSTGRES_PORT, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB} from "./constants.js";
import { reportInfo, reportError } from "./reporter.js";
import { createScheduledImport, startScheduledImport } from "./schedule.js";

const { Pool } = pg;

const pool = new Pool({
  user: POSTGRES_USER,
  host: POSTGRES_HOST,
  database: POSTGRES_DB,
  password: POSTGRES_PASSWORD,
  port: POSTGRES_PORT,
  ssl: true
})

const partitionMaintenanceTables = [
  "lightpriorityevent",
  "passengercount",
  "stopevent",
  "unsignedevent",
  "vehicleposition",
  "otherevent",
];

const checkLastCronScheduledPartition = () => {
  pool.query("SELECT * FROM public.get_cron_job_run_details(10);", (err, res) => {
    if (err) {
      reportError(`Error while checking partition maintenance logs: ${err.message}`);
      return;
    }

    const results = partitionMaintenanceTables.map((table) => {
      const maintenanceRow = res.rows.find((row) => {
        return row.command && row.command.includes(`public.${table}`);
      });

      if (!maintenanceRow) {
        return {
          succeeded: false,
          message: `public.${table}: no run found in the latest 10 cron job runs.`,
        };
      }

      if (maintenanceRow.status === "succeeded") {
        return {
          succeeded: true,
          message: `public.${table}: succeeded at ${maintenanceRow.end_time}.`,
        };
      }

      const returnMessage = maintenanceRow.return_message || "No message.";
      return {
        succeeded: false,
        message: `public.${table}: failed. Return message: ${returnMessage}`,
      };
    });

    const message = `Partition maintenance results:\n${results.map((result) => result.message).join("\n")}`;
    if (results.every((result) => result.succeeded)) {
      reportInfo(message);
    } else {
      reportError(message);
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


const checkVehiclepositionData = () => {
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

const checkApcData = () => {
  const now = new Date();
  const oneHourAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours() - 1, now.getUTCMinutes(), now.getUTCSeconds()));
  const query = "SELECT COUNT(*) FROM passengercount WHERE tst > $1";

  pool.query(query, [oneHourAgo.toISOString()], (err, res) => {
    if (err) {
      reportError(`Error while checking passengercount data: ${err.message}`);
      return;
    }

    const count = res.rows[0].count;
    if (count > 0) {
      reportInfo(`Passengercount data is up to date. Records in the last hour: ${count}`);
    } else {
      reportError("No new passengercount data in the last hour.");
    }
  });
};

createScheduledImport("checkVehiclePositionData", HOURLY_TASK_SCHEDULE, async (onComplete = () => {}) => {
  checkVehiclepositionData();
  onComplete();
});

createScheduledImport("checkApcData", HOURLY_TASK_SCHEDULE, async (onComplete = () => {}) => {
  checkApcData();
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
startScheduledImport("checkApcData");
server();