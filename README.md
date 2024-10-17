# Crons Convex Component

[![npm version](https://badge.fury.io/js/@convex-dev%2Fcrons.svg)](https://badge.fury.io/js/@convex-dev%2Fcrons)

**Note: Convex Components are currently in beta.**

<!-- START: Include on https://convex.dev/components -->

This Convex component provides functionality for registering and managing cron
jobs at runtime. Convex comes with built-in support for cron jobs but they must
be statically defined at deployment time. This library allows for dynamic
registration of cron jobs at runtime.

It supports intervals in milliseconds as well as cron schedules with the same
format as the unix `cron` command:

```
 *  *  *  *  *  *
 ┬  ┬  ┬  ┬  ┬  ┬
 │  │  │  │  │  |
 │  │  │  │  │  └── day of week (0 - 7, 1L - 7L) (0 or 7 is Sun)
 │  │  │  │  └───── month (1 - 12)
 │  │  │  └──────── day of month (1 - 31, L)
 │  │  └─────────── hour (0 - 23)
 │  └────────────── minute (0 - 59)
 └───────────────── second (0 - 59, optional)
```

### Design

The design of this component is based on the Cronvex demo app that's described in
[this Stack post](https://stack.convex.dev/cron-jobs).

## Pre-requisite: Convex

You'll need an existing Convex project to use the component.
Convex is a hosted backend platform, including a database, serverless functions,
and a ton more you can learn about [here](https://docs.convex.dev/get-started).

Run `npm create convex` or follow any of the [quickstarts](https://docs.convex.dev/home) to set one up.

## Installation

Install the component package:

```ts
npm install @convex-dev/crons
```

Create a `convex.config.ts` file in your app's `convex/` folder and install the component by calling `use`:

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import crons from "@convex-dev/crons/convex.config";

const app = defineApp();
app.use(crons);

export default app;
```

## Usage

A `Crons` wrapper can be instantiated within your Convex code as:

```ts
import { components } from "./_generated/api";
import { Crons } from "@convex-dev/crons";

const crons = new Crons(components.crons);
```

The `Crons` wrapper class provides the following methods:

- `register(ctx, schedule, fn, args, name?)`: Registers a new cron job.
- `get(ctx, { name | id })`: Gets a cron job by name or ID.
- `list(ctx)`: Lists all cron jobs.
- `delete(ctx, { name | id })`: Deletes a cron job by name or ID.

Example usage:

```ts
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

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
      "hourly-test"
    );
    console.log("Registered new cron job with ID:", namedCronId);
    const unnamedCronId = await crons.register(
      ctx,
      { kind: "cron", cronspec: "0 * * * *" },
      internal.example.logStuff,
      { message: "Minutely cron test" }
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
```

If you'd like to statically define cronjobs like in the built-in `crons.ts`
Convex feature you can do so via an init script that idempotently registers a
cron with a given name. e.g., in an `init.ts` file that gets run on every
deploy via `convex dev --run init`.

```ts
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
        "daily"
      );
    }
  },
});
```

Crons are created transactionally and will be guaranteed to exist after the
mutation that creates them has run. It's thus possible to write workflows like
the following that schedules a cron and then deletes itself as soon as it runs,
without any additional error handling about the cron not existing.

```ts
// This will schedule a cron job to run every 10 seconds but then delete itself
// the first time it runs.
export const selfDeletingCron = internalMutation({
  handler: async (ctx) => {
    const cronId = await crons.register(
      ctx,
      { kind: "interval", ms: 10000 },
      internal.example.deleteSelf,
      { name: "self-deleting-cron" },
      "self-deleting-cron"
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
```

<!-- END: Include on https://convex.dev/components -->
