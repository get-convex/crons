# Crons Convex Component

This Convex component provides functionality for registering and managing cron
jobs at runtime. Convex comes with built-in support for cron jobs but they must
be statically defined at deployment time. This library allows for dynamic
registration of cron jobs at runtime.

It supports intervals in ms as well as cron schedules with the same format as
the unix `cron` command:

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

See `example/convex/example.ts` for a simple example of how to use this library.

The component must first be defined in convex.config.ts:

```typescript
const app = defineApp();
app.use(component, { name: "crons" });
```

and can then be used from Convex functions via the `Crons` wrapper class:

```typescript
const crons = new Crons(components.crons);

// ...

if ((await crons.get(ctx, { name: "daily" })) === null) {
  await crons.register(
    ctx,
    { kind: "cron", cronspec: "0 0 * * *" },
    internal.example.logStuff,
    { message: "daily cron" },
    "daily"
  );
}
```

If you'd like to statically define cronjobs like in the built-in `crons.ts`
Convex feature you can do so via an init script that idempotently registers a
cron with a given name. e.g., in an `init.ts` file that gets run on every
deploy via `convex dev --run init`.

The design of this component is based on the Cronvex demo app that's described in
[this Stack post](https://stack.convex.dev/cron-jobs).
