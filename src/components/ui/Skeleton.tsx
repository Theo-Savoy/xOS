import "./ui.css";

type SkeletonProps = {
  className?: string;
  width?: string | number;
  height?: string | number;
};

/** Generic shimmering placeholder block for loading states. */
export function Skeleton({ className, width, height }: SkeletonProps) {
  const classes = ["xos-skeleton", className].filter(Boolean).join(" ");
  return <div className={classes} style={{ width, height }} aria-hidden="true" />;
}
