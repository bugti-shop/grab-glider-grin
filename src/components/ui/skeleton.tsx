import { cn } from "@/lib/utils";
import { useIsTourActive } from "@/features/tours/useIsTourActive";

/**
 * Faster pulse than Tailwind's default `animate-pulse` (2s) so the skeleton
 * feels responsive instead of sluggish on slower devices. 1.1s cycle keeps it
 * visibly active without becoming distracting.
 *
 * Suppressed entirely while a Flowist feature tour is running so highlighted
 * targets aren't obscured by placeholder shimmer.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const isTourActive = useIsTourActive();
  if (isTourActive) return null;
  return (
    <div
      className={cn("rounded-md bg-muted", className)}
      style={{
        animation: "flowistSkeletonPulse 1.1s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        ...(props.style || {}),
      }}
      {...props}
    />
  );
}

export { Skeleton };

