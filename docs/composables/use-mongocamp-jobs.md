# useMongocampJobs

Wraps `jobApi` (note: the property on `useMongocampApi()` is `jobApi`, singular — the underlying class is `JobsApi`) for managing MongoCamp's scheduled background jobs.

```ts
const {
  listJobs,         // () => Promise<JobInformation[]>
  listPossibleJobs, // () => Promise<string[]>
  registerJob,      // (jobConfig: JobConfig) => Promise<JobInformation>
  updateJob,        // (jobGroup: string, jobName: string, jobConfig: JobConfig) => Promise<JobInformation>
  executeJob,       // (jobGroup: string, jobName: string) => Promise<boolean>
  deleteJob,        // (jobGroup: string, jobName: string) => Promise<boolean>
} = useMongocampJobs()
```

## `JobConfig` vs `JobInformation`

`registerJob`/`updateJob` take a `JobConfig` (the request shape); `listJobs` returns `JobInformation` (the response shape). They're not the same interface — most notably, the job's implementation class is named **`className`** on `JobConfig` but **`jobClassName`** on `JobInformation`:

```ts
interface JobConfig {
  name: string
  className: string       // note: className here
  description: string
  cronExpression: string  // Quartz cron syntax
  group: string
  priority: number
}

interface JobInformation {
  name: string
  group: string
  jobClassName: string    // note: jobClassName here
  description: string
  cronExpression: string
  priority: number
  lastScheduledFireTime?: Date
  nextScheduledFireTime?: Date
  scheduleInformation?: string
}
```

`listPossibleJobs()` returns the available job implementation class names — use it to populate a `className` select when registering a new job, rather than expecting the user to type a fully-qualified class name from memory.

## `updateJob` replaces the whole `JobConfig`

There's no partial update — `updateJob(jobGroup, jobName, jobConfig)` replaces every field. When building an edit form, shallow-clone the `JobInformation` down into a `JobConfig`-shaped object first (remapping `jobClassName` → `className`) rather than binding the live list item directly, per the same clone-before-bind principle used for role grants.

## `executeJob` / `deleteJob` return a plain boolean

Both unwrap the underlying `JsonValueBoolean` (`{ value: boolean }`) response for you — no need to reach into `.value` yourself.
