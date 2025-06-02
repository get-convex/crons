// Implementation of crons in user space.
//
// See ../client/index.ts for the public API.

import { FunctionHandle } from "convex/server";
import { v } from "convex/values";
import {
  MutationCtx,
  mutation,
  query,
  internalMutation,
} from "./_generated/server.js";
import { internal } from "./_generated/api.js";
import { Doc, Id } from "./_generated/dataModel.js";
import parser from "cron-parser";
import schema from "./schema.js";

// TODO (james): should we add helpers for minutely, hourly, etc schedules?
export type Schedule =
  | {
      /** A schedule using a cron specification string. */
      kind: "cron";
      /**
       * A cron specification string.
       * ```
       *  *  *  *  *  *  *
       *  ┬  ┬  ┬  ┬  ┬  ┬
       *  │  │  │  │  │  |
       *  │  │  │  │  │  └── day of week (0 - 7, 1L - 7L) (0 or 7 is Sun)
       *  │  │  │  │  └───── month (1 - 12)
       *  │  │  │  └──────── day of month (1 - 31, L)
       *  │  │  └─────────── hour (0 - 23)
       *  │  └────────────── minute (0 - 59)
       *  └───────────────── second (0 - 59, optional)
       * ```
       */
      cronspec: string;
      tz?: string; // Optional timezone, e.g. "America/New_York".
    }
  | {
      /** A schedule using an interval in milliseconds. */
      kind: "interval";
      /** The interval in milliseconds. */
      ms: number;
    };
const scheduleValidator = schema.tables.crons.validator.fields.schedule;

export type CronInfo = {
  id: string;
  name?: string;
  functionHandle: FunctionHandle<"mutation" | "action">;
  args: Record<string, unknown>;
  schedule: Schedule;
};
const cronInfoValidator = v.object({
  id: v.id("crons"),
  name: v.optional(v.string()),
  functionHandle: v.string(),
  args: v.record(v.string(), v.any()),
  schedule: scheduleValidator,
});

/**
 * Schedule a mutation or action to run on a cron schedule or interval.
 *
 * @param name - Optional unique name for the job. Will throw if a name is
 *        provided and a job with the same name already exists.
 * @param schedule - Either a cron specification string or an interval in
 *        milliseconds. For intervals, ms must be >= 1000.
 * @param functionHandle - A {@link FunctionHandle} string for the function to
 *        schedule.
 * @param args - The arguments to the function.
 * @returns The ID of the scheduled job.
 */
export const register = mutation({
  args: {
    name: v.optional(v.string()),
    schedule: scheduleValidator,
    functionHandle: v.string(),
    args: v.record(v.string(), v.any()),
  },
  returns: v.id("crons"),
  handler: async (ctx, { name, schedule, functionHandle, args }) => {
    if (
      name &&
      (await ctx.db
        .query("crons")
        .withIndex("name", (q) => q.eq("name", name))
        .unique())
    ) {
      throw new Error(`Cron with name "${name}" already exists`);
    }
    validateSchedule(schedule);

    const id = await ctx.db.insert("crons", {
      functionHandle,
      args,
      name,
      schedule,
    });
    console.log(
      `Scheduling cron "${name}" (${id}) on schedule ${JSON.stringify(schedule)}`
    );

    await scheduleNextRun(ctx, id, new Date(), schedule);
    return id;
  },
});

function validateSchedule(schedule: Schedule) {
  if (schedule.kind === "interval" && schedule.ms < 1000) {
    throw new Error("Interval must be >= 1000ms");
  }
  if (schedule.kind === "cron") {
    try {
      parser.parseExpression(schedule.cronspec, { tz: schedule.tz });
    } catch {
      throw new Error(`Invalid cronspec: "${schedule.cronspec}"`);
    }
  }
}

async function scheduleNextRun(
  ctx: MutationCtx,
  id: Id<"crons">,
  lastScheduled: Date,
  schedule: Schedule
) {
  const nextRun = calculateNextRun(lastScheduled, schedule);
  const schedulerJobId = await ctx.scheduler.runAt(
    nextRun,
    internal.public.rescheduler,
    { id }
  );
  await ctx.db.patch(id, { schedulerJobId });
}

function calculateNextRun(lastScheduled: Date, schedule: Schedule): Date {
  if (schedule.kind === "interval") {
    return new Date(lastScheduled.getTime() + schedule.ms);
  } else {
    const cron = parser.parseExpression(schedule.cronspec, {
      currentDate: lastScheduled,
      tz: schedule.tz,
    });
    return cron.next().toDate();
  }
}

/**
 * List all user space cron jobs.
 *
 * @returns List of `cron` table rows.
 */
export const list = query({
  args: {},
  returns: v.array(cronInfoValidator),
  handler: async (ctx) => {
    const crons = await ctx.db.query("crons").collect();
    return crons.map((cron) => ({
      id: cron._id,
      ...(cron.name && { name: cron.name }),
      functionHandle: cron.functionHandle,
      args: cron.args,
      schedule: cron.schedule,
    }));
  },
});

/**
 * Get an existing cron job by id or name.
 *
 * @param identifier - Either the ID or name of the cron job.
 * @returns Cron job document or null if not found.
 */
export const get = query({
  args: {
    identifier: v.union(
      v.object({ id: v.id("crons") }),
      v.object({ name: v.string() })
    ),
  },
  returns: v.union(cronInfoValidator, v.null()),
  handler: async (ctx, { identifier }) => {
    const cron =
      "id" in identifier
        ? await ctx.db.get(identifier.id)
        : await ctx.db
            .query("crons")
            .withIndex("name", (q) => q.eq("name", identifier.name))
            .unique();
    if (!cron) return null;
    return {
      id: cron._id,
      ...(cron.name && { name: cron.name }),
      functionHandle: cron.functionHandle,
      args: cron.args,
      schedule: cron.schedule,
    };
  },
});

/**
 * Delete and deschedule a cron job by id or name.
 *
 * @param identifier - Either the ID or name of the cron job.
 */
export const del = mutation({
  args: {
    identifier: v.union(
      v.object({ id: v.id("crons") }),
      v.object({ name: v.string() })
    ),
  },
  returns: v.null(),
  handler: async (ctx, { identifier }) => {
    let cron: Doc<"crons"> | null;
    if ("id" in identifier) {
      cron = await ctx.db.get(identifier.id);
      if (!cron) {
        throw new Error(`Cron ${identifier.id} not found`);
      }
    } else {
      cron = await ctx.db
        .query("crons")
        .withIndex("name", (q) => q.eq("name", identifier.name))
        .unique();
      if (!cron) {
        throw new Error(`Cron "${identifier.name}" not found`);
      }
    }
    if (!cron.schedulerJobId) {
      throw new Error(`Cron ${cron._id} not scheduled`);
    }
    console.log(`Canceling scheduler job ${cron.schedulerJobId}`);
    await ctx.scheduler.cancel(cron.schedulerJobId);
    if (cron.executionJobId) {
      console.log(`Canceling execution job ${cron.executionJobId}`);
      await ctx.scheduler.cancel(cron.executionJobId);
    }
    console.log(`Deleting cron ${cron._id}`);
    await ctx.db.delete(cron._id);
  },
});

// Continue rescheduling a cron job.
//
// This is the main worker function that does the scheduling but also schedules
// the target function so that it runs in a different context. As a result this
// function probably *shouldn't* fail since it isn't doing much, but under heavy
// OCC contention it's possible it may eventually fail. In this case the cron
// will be lost and we'll need a janitor job to recover it.
export const rescheduler = internalMutation({
  args: {
    id: v.id("crons"),
  },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    // Cron job is the logical concept we're rescheduling repeatedly.
    const cronJob = await ctx.db.get(id);
    if (!cronJob) {
      throw Error(`Cron ${id} not found`);
    }
    if (!cronJob.schedulerJobId) {
      throw Error(`Cron ${id} not scheduled`);
    }

    // Scheduler job is the job that's running right now, that we use to trigger
    // repeated executions.
    const schedulerJob = await ctx.db.system.get(cronJob.schedulerJobId);
    if (!schedulerJob) {
      throw Error(`Scheduler job ${cronJob.schedulerJobId} not found`);
    }
    if (
      schedulerJob.state.kind !== "pending" &&
      schedulerJob.state.kind !== "inProgress"
    ) {
      throw Error(
        `We are running in job ${schedulerJob._id} but state is ${schedulerJob.state.kind}`
      );
    }

    // Execution job is the previous job used to actually do the work of the cron.
    let stillRunning = false;
    if (cronJob.executionJobId) {
      const executionJob = await ctx.db.system.get(cronJob.executionJobId);
      if (
        executionJob &&
        (executionJob.state.kind === "pending" ||
          executionJob.state.kind === "inProgress")
      ) {
        stillRunning = true;
      }
    }
    if (stillRunning) {
      console.log(`Cron ${cronJob._id} still running, skipping this run.`);
    } else {
      console.log(`Running cron ${cronJob._id}.`);
      await ctx.scheduler.runAfter(
        0,
        cronJob.functionHandle as FunctionHandle<"mutation" | "action">,
        cronJob.args
      );
    }

    await scheduleNextRun(
      ctx,
      id,
      new Date(schedulerJob.scheduledTime),
      cronJob.schedule
    );
  },
});
