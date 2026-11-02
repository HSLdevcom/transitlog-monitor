import assert from "node:assert/strict";
import test from "node:test";
import { createScheduledImport, runScheduledImportNow } from "../schedule.js";

test("manual runs do not overlap and can run again after completion", () => {
  const taskName = "schedule-test";
  let executions = 0;
  let completeTask;

  createScheduledImport(taskName, "0 0 1 1 *", (onComplete) => {
    executions += 1;
    completeTask = onComplete;
  });

  runScheduledImportNow(taskName);
  assert.equal(executions, 1);

  runScheduledImportNow(taskName);
  assert.equal(executions, 1);

  completeTask();
  runScheduledImportNow(taskName);
  assert.equal(executions, 2);

  completeTask();
});
