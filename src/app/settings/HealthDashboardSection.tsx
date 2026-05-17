interface HealthDashboardSectionProps {
  app: {
    version: string;
    buildLabel: string;
    buildTitle: string;
    startedLabel: string | null;
    uptimeLabel: string;
  };
  quota: {
    requestsUsed: number;
    requestsLimit: number | null;
    requestsRemaining: number | null;
    resetLabel: string | null;
  };
  database: {
    sizeLabel: string;
    updatedLabel: string | null;
    latestBackupLabel: string | null;
    latestBackupSizeLabel: string | null;
    backupCount: number;
  };
}

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

function HealthTile({
  label,
  value,
  hint,
  title,
  className = "",
}: {
  label: string;
  value: string | number;
  hint?: string | null;
  title?: string;
  className?: string;
}) {
  return (
    <div
      className={`min-w-0 rounded-xl border border-black/6 bg-black/[0.02] px-3 py-2.5 dark:border-white/8 dark:bg-white/[0.03] ${className}`}
    >
      <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">
        {label}
      </p>
      <p
        className="mt-1 truncate text-sm font-bold leading-tight tabular-nums text-gray-950 dark:text-white"
        title={title ?? String(value)}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-1 truncate text-[11px] text-gray-500 dark:text-white/45" title={hint}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export default function HealthDashboardSection({
  app,
  quota,
  database,
}: HealthDashboardSectionProps) {
  const quotaLabel =
    quota.requestsLimit == null
      ? `${formatCount(quota.requestsUsed)} used`
      : `${formatCount(quota.requestsRemaining ?? 0)} / ${formatCount(quota.requestsLimit)} left`;

  return (
    <section className="settings-panel glass min-w-0 rounded-2xl p-6 shadow-md shadow-black/5">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            System Overview
          </h2>
          <p className="mt-0.5 text-sm text-gray-400">
            App build, scraper quota, database, and backup status.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 xl:grid-cols-5">
        <HealthTile
          label="App version"
          value={app.version}
          hint={app.buildLabel}
          title={`${app.version} / ${app.buildTitle}`}
          className="col-span-2 sm:col-span-1"
        />
        <HealthTile label="Uptime" value={app.uptimeLabel} hint={app.startedLabel} />
        <HealthTile label="Scraper quota" value={quotaLabel} hint={quota.resetLabel ?? "No reset observed"} />
        <HealthTile
          label="Database"
          value={database.sizeLabel}
          hint={database.updatedLabel ? `Updated ${database.updatedLabel}` : "File stat unavailable"}
        />
        <HealthTile
          label="Latest backup"
          value={database.latestBackupLabel ?? "--"}
          hint={
            database.latestBackupSizeLabel
              ? `${database.latestBackupSizeLabel} / ${formatCount(database.backupCount)} backups`
              : `${formatCount(database.backupCount)} backups`
          }
        />
      </div>
    </section>
  );
}
