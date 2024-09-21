# Crons Convex Component

[![npm version](https://badge.fury.io/js/@convex-dev%2Fcrons.svg)](https://badge.fury.io/js/@convex-dev%2Fcrons)

**Note: Convex Components are currently in beta.**

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

### Convex App

You'll need a Convex App to use the component. Run `npm create convex` or
follow any of the [Convex quickstarts](https://docs.convex.dev/home) to set one up.

## Installation

Install the component package:

```ts
npm install @convex-dev/crons
```

Create a `convex.config.ts` file in your app's `convex/` folder and install the component by calling `use`:

```ts
// convex/convex.config.js
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

# 🧑‍🏫 What is Convex?

[Convex](https://convex.dev) is a hosted backend platform with a
built-in database that lets you write your
[database schema](https://docs.convex.dev/database/schemas) and
[server functions](https://docs.convex.dev/functions) in
[TypeScript](https://docs.convex.dev/typescript). Server-side database
[queries](https://docs.convex.dev/functions/query-functions) automatically
[cache](https://docs.convex.dev/functions/query-functions#caching--reactivity) and
[subscribe](https://docs.convex.dev/client/react#reactivity) to data, powering a
[realtime `useQuery` hook](https://docs.convex.dev/client/react#fetching-data) in our
[React client](https://docs.convex.dev/client/react). There are also clients for
[Python](https://docs.convex.dev/client/python),
[Rust](https://docs.convex.dev/client/rust),
[ReactNative](https://docs.convex.dev/client/react-native), and
[Node](https://docs.convex.dev/client/javascript), as well as a straightforward
[HTTP API](https://docs.convex.dev/http-api/).

The database supports
[NoSQL-style documents](https://docs.convex.dev/database/document-storage) with
[opt-in schema validation](https://docs.convex.dev/database/schemas),
[relationships](https://docs.convex.dev/database/document-ids) and
[custom indexes](https://docs.convex.dev/database/indexes/)
(including on fields in nested objects).

The
[`query`](https://docs.convex.dev/functions/query-functions) and
[`mutation`](https://docs.convex.dev/functions/mutation-functions) server functions have transactional,
low latency access to the database and leverage our
[`v8` runtime](https://docs.convex.dev/functions/runtimes) with
[determinism guardrails](https://docs.convex.dev/functions/runtimes#using-randomness-and-time-in-queries-and-mutations)
to provide the strongest ACID guarantees on the market:
immediate consistency,
serializable isolation, and
automatic conflict resolution via
[optimistic multi-version concurrency control](https://docs.convex.dev/database/advanced/occ) (OCC / MVCC).

The [`action` server functions](https://docs.convex.dev/functions/actions) have
access to external APIs and enable other side-effects and non-determinism in
either our
[optimized `v8` runtime](https://docs.convex.dev/functions/runtimes) or a more
[flexible `node` runtime](https://docs.convex.dev/functions/runtimes#nodejs-runtime).

Functions can run in the background via
[scheduling](https://docs.convex.dev/scheduling/scheduled-functions) and
[cron jobs](https://docs.convex.dev/scheduling/cron-jobs).

Development is cloud-first, with
[hot reloads for server function](https://docs.convex.dev/cli#run-the-convex-dev-server) editing via the
[CLI](https://docs.convex.dev/cli),
[preview deployments](https://docs.convex.dev/production/hosting/preview-deployments),
[logging and exception reporting integrations](https://docs.convex.dev/production/integrations/),
There is a
[dashboard UI](https://docs.convex.dev/dashboard) to
[browse and edit data](https://docs.convex.dev/dashboard/deployments/data),
[edit environment variables](https://docs.convex.dev/production/environment-variables),
[view logs](https://docs.convex.dev/dashboard/deployments/logs),
[run server functions](https://docs.convex.dev/dashboard/deployments/functions), and more.

There are built-in features for
[reactive pagination](https://docs.convex.dev/database/pagination),
[file storage](https://docs.convex.dev/file-storage),
[reactive text search](https://docs.convex.dev/text-search),
[vector search](https://docs.convex.dev/vector-search),
[https endpoints](https://docs.convex.dev/functions/http-actions) (for webhooks),
[snapshot import/export](https://docs.convex.dev/database/import-export/),
[streaming import/export](https://docs.convex.dev/production/integrations/streaming-import-export), and
[runtime validation](https://docs.convex.dev/database/schemas#validators) for
[function arguments](https://docs.convex.dev/functions/args-validation) and
[database data](https://docs.convex.dev/database/schemas#schema-validation).

Everything scales automatically, and it’s [free to start](https://www.convex.dev/plans).
