import { useId, type CSSProperties, type ReactNode, type Ref } from "react";

import { cn } from "@/lib/utils";

/**
 * Every dark panel on the site: code to copy, a command, the agent's calls, what the
 * agent reads. Machine text sits on ink (DESIGN.md), in one shape: a slim bar with a
 * label and an optional action, then a body that scrolls on its own instead of wrapping
 * code mid-line, as tall as its content up to `maxHeight`.
 */
export function CodePanel({
  label,
  action,
  children,
  maxHeight,
  minHeight,
  live,
  bodyRef,
  className,
  wrap,
}: {
  label?: ReactNode;
  /** Beside the label: a Copy button, a count. */
  action?: ReactNode;
  children: ReactNode;
  maxHeight?: string;
  minHeight?: string;
  /** Announce what is added to the body (the agent's calls as they happen). */
  live?: boolean;
  bodyRef?: Ref<HTMLDivElement>;
  className?: string;
  /** Prose (a prompt) wraps; code keeps its lines. */
  wrap?: boolean;
}) {
  const labelId = useId();
  const style: CSSProperties = { maxHeight, minHeight };
  return (
    <div className={cn("code-panel", className)} data-wrap={wrap ? "" : undefined}>
      {label || action ? (
        <div className="code-panel__bar">
          <span id={labelId} className="code-panel__label">
            {label}
          </span>
          {action ? <span className="code-panel__action">{action}</span> : null}
        </div>
      ) : null}
      <div
        ref={bodyRef}
        className="code-panel__body"
        style={style}
        role="group"
        aria-labelledby={label ? labelId : undefined}
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- arrow keys scroll long code samples here
        tabIndex={0}
        aria-live={live ? "polite" : undefined}
      >
        {children}
      </div>
    </div>
  );
}
