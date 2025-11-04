// Examples of using the Crons component to register cron jobs.

import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { components, internal } from "./_generated/api";
import { Crons } from "@convex-dev/crons";

const crons = new Crons(components.crons);

// Register a daily cron job. This could be called from an init script to make
// sure it's always registered, like the built-in crons in Convex.
export const registerDailyCron = internalMutation({
  handler: async (ctx) => {
    if ((await crons.get(ctx, { name: "daily" })) === null) {
      await crons.register(
        ctx,
        { kind: "cron", cronspec: "0 0 * * *" },
        internal.example.logStuff,
        {
          message: "daily cron",
        },
        "daily",
      );
    }
  },
});

// Dummy function that we're going to schedule.
export const logStuff = internalMutation({
  args: {
    message: v.string(),
  },
  handler: async (_ctx, args) => {
    console.log(args.message);
  },
});

// Run a bunch of cron operations as a test. Note that this function runs as a
// transaction and cleans up after itself so you won't actually see these crons
// showing up in the database while it's in progress.
export const doSomeStuff = internalMutation({
  handler: async (ctx) => {
    // Register some crons.
    const namedCronId = await crons.register(
      ctx,
      { kind: "interval", ms: 3600000 },
      internal.example.logStuff,
      { message: "Hourly cron test" },
      "hourly-test",
    );
    console.log("Registered new cron job with ID:", namedCronId);
    const unnamedCronId = await crons.register(
      ctx,
      { kind: "cron", cronspec: "0 * * * *" },
      internal.example.logStuff,
      { message: "Minutely cron test" },
    );
    console.log("Registered new cron job with ID:", unnamedCronId);

    // Get the cron job by name.
    const cronByName = await crons.get(ctx, { name: "hourly-test" });
    console.log("Retrieved cron job by name:", cronByName);

    // Get the cron job by ID.
    const cronById = await crons.get(ctx, { id: unnamedCronId });
    console.log("Retrieved cron job by ID:", cronById);

    // List all cron jobs.
    const allCrons = await crons.list(ctx);
    console.log("All cron jobs:", allCrons);

    // Delete the cron jobs.
    await crons.delete(ctx, { name: "hourly-test" });
    console.log("Deleted cron job by name:", "hourly-test");
    await crons.delete(ctx, { id: unnamedCronId });
    console.log("Deleted cron job by ID:", unnamedCronId);

    // Verify deletion.
    const deletedCronByName = await crons.get(ctx, { name: "hourly-test" });
    console.log("Deleted cron job (should be null):", deletedCronByName);
    const deletedCronById = await crons.get(ctx, { id: unnamedCronId });
    console.log("Deleted cron job (should be null):", deletedCronById);
  },
});

// This will schedule a cron job to run every 10 seconds but then delete itself
// the first time it runs.
export const selfDeletingCron = internalMutation({
  handler: async (ctx) => {
    const cronId = await crons.register(
      ctx,
      { kind: "interval", ms: 10000 },
      internal.example.deleteSelf,
      { name: "self-deleting-cron" },
      "self-deleting-cron",
    );

    console.log("Registered self-deleting cron job with ID:", cronId);
  },
});

// Worker function that deletes a cron job.
export const deleteSelf = internalMutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    console.log("Self-deleting cron job running. Name:", name);
    await crons.delete(ctx, { name });
    console.log("Self-deleting cron job has been deleted. Name:", name);
  },
});
