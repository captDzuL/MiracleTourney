function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200/80 ${className}`} />;
}

function SkeletonSection({ rows = 4 }: { rows?: number }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
      <SkeletonBlock className="h-5 w-48" />
      <SkeletonBlock className="mt-2 h-3 w-72 max-w-full" />
      <div className="mt-5 grid gap-3">
        {Array.from({ length: rows }, (_, index) => (
          <SkeletonBlock key={index} className="h-12 w-full" />
        ))}
      </div>
    </section>
  );
}

function DashboardHeaderSkeleton() {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
      <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50 px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <SkeletonBlock className="h-4 w-28" />
          <SkeletonBlock className="mt-3 h-8 w-80 max-w-full" />
          <SkeletonBlock className="mt-3 h-4 w-[36rem] max-w-full" />
        </div>
        <div className="flex flex-wrap gap-2">
          <SkeletonBlock className="h-8 w-24 rounded-full" />
          <SkeletonBlock className="h-8 w-36 rounded-full" />
          <SkeletonBlock className="h-8 w-28 rounded-full" />
        </div>
      </div>
      <div className="grid gap-px bg-slate-200 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="bg-white p-4">
            <SkeletonBlock className="h-3 w-28" />
            <SkeletonBlock className="mt-3 h-7 w-20" />
            <SkeletonBlock className="mt-3 h-3 w-36 max-w-full" />
          </div>
        ))}
      </div>
    </section>
  );
}

export function AdminDashboardLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading admin dashboard">
      <DashboardHeaderSkeleton />
      <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="h-fit rounded-xl border border-slate-200 bg-white p-3 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
          <SkeletonBlock className="mx-2 mb-3 h-3 w-24" />
          <div className="grid gap-2">
            {Array.from({ length: 4 }, (_, index) => (
              <SkeletonBlock key={index} className="h-16 w-full" />
            ))}
          </div>
          <SkeletonBlock className="mt-5 h-24 w-full" />
        </aside>
        <main className="min-w-0 space-y-6">
          <div>
            <SkeletonBlock className="h-8 w-72 max-w-full" />
            <SkeletonBlock className="mt-3 h-4 w-[42rem] max-w-full" />
          </div>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
            <SkeletonSection rows={5} />
            <SkeletonSection rows={4} />
          </div>
          <SkeletonSection rows={5} />
        </main>
      </div>
    </div>
  );
}

export function CaptainDashboardLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading captain dashboard">
      <SkeletonSection rows={2} />
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <SkeletonBlock className="h-44 w-full rounded-none" />
        <div className="space-y-5 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <SkeletonBlock className="h-4 w-44" />
              <SkeletonBlock className="mt-3 h-8 w-72 max-w-full" />
              <div className="mt-4 flex flex-wrap gap-2">
                <SkeletonBlock className="h-8 w-36 rounded-full" />
                <SkeletonBlock className="h-8 w-32 rounded-full" />
              </div>
            </div>
            <SkeletonBlock className="h-10 w-10" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <SkeletonBlock key={index} className="h-32 w-full" />
            ))}
          </div>
          <SkeletonSection rows={3} />
        </div>
      </section>
    </div>
  );
}

export function CaptainSettingsLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading captain settings">
      <SkeletonSection rows={4} />
    </div>
  );
}

export function CaptainStatsLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading captain stats">
      <SkeletonSection rows={5} />
      <SkeletonSection rows={3} />
    </div>
  );
}
