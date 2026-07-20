import { GlassCard, Skeleton } from "../../components/ui";

export function ContextSideSkeleton({ quiet: _quiet = false }: { quiet?: boolean }) {
  return (
    <>
      <GlassCard className="calls-context-panel calls-context-panel--skeleton" aria-busy="true">
        <Skeleton className="calls-context-skel-line" width="60%" height="14px" />
        <Skeleton className="calls-context-skel-line" width="80%" height="12px" />
        <Skeleton className="calls-context-skel-line" width="45%" height="12px" />
      </GlassCard>
      <GlassCard className="calls-context-panel calls-context-panel--skeleton" aria-busy="true">
        <Skeleton className="calls-context-skel-line" width="60%" height="14px" />
        <Skeleton className="calls-context-skel-line" width="80%" height="12px" />
        <Skeleton className="calls-context-skel-line" width="45%" height="12px" />
      </GlassCard>
      <GlassCard className="calls-context-panel calls-context-panel--skeleton" aria-busy="true">
        <Skeleton className="calls-context-skel-line" width="60%" height="14px" />
        <Skeleton className="calls-context-skel-line" width="80%" height="12px" />
        <Skeleton className="calls-context-skel-line" width="45%" height="12px" />
      </GlassCard>
    </>
  );
}
