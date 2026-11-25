import { Button } from "@ui-sdk/react/button";
import type { ReactNode } from "react";
import { useBookiLocaleOptional } from "./locale.js";
import { personOnly } from "@booki-aui/primitives/person-only";

export type ExceptionBannerProps = {
  title?: string;
  reason: string;
  context?: ReactNode;
  onReview?: () => void;
  onDismiss?: () => void;
  className?: string;
};

/** Agent escalation surface — stop and hand off to a reviewer. */
function ExceptionBanner({ title, reason, context, onReview, onDismiss, className }: ExceptionBannerProps) {
  const { profile } = useBookiLocaleOptional();

  return (
    <aside data-slot="exception-banner" role="alert" className={className}>
      <strong data-slot="exception-banner-title">{title ?? profile.copy.exceptionTitle}</strong>
      <p data-slot="exception-banner-reason">{reason}</p>
      {context ? <div data-slot="exception-banner-context">{context}</div> : null}
      <div data-slot="exception-banner-actions">
        {onReview ? (
          <Button type="button" data-agent-confirm={personOnly("Exception review needs a person")} onClick={onReview}>
            Review
          </Button>
        ) : null}
        {onDismiss ? (
          <Button
            data-variant="secondary"
            type="button"
            data-agent-confirm={personOnly("Dismiss exception needs a person")}
            onClick={onDismiss}
          >
            {profile.copy.cancel}
          </Button>
        ) : null}
      </div>
    </aside>
  );
}

export { ExceptionBanner };
