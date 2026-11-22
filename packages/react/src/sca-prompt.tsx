import { Button } from "@ui-sdk/react/button";
import { useState } from "react";
import { useBookiLocaleOptional } from "./locale.js";
import { personOnly } from "@booki/primitives/person-only";

export type ScaPromptProps = {
  title?: string;
  description?: string;
  brand?: string;
  openLabel?: string;
  pendingLabel?: string;
  doneLabel?: string;
  onComplete?: () => void | Promise<void>;
  onCancel?: () => void;
  className?: string;
};

function ScaPrompt({
  title,
  description,
  brand,
  openLabel,
  pendingLabel,
  doneLabel,
  onComplete,
  onCancel,
  className,
}: ScaPromptProps) {
  const { profile } = useBookiLocaleOptional();
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const sca = profile.sca;

  return (
    <section data-slot="sca-prompt" className={className}>
      <span data-slot="sca-prompt-brand">{brand ?? sca.brand}</span>
      <h2 data-slot="sca-prompt-title">{title ?? sca.title}</h2>
      <p data-slot="sca-prompt-description">{description ?? sca.description}</p>
      {done ? (
        <p data-slot="sca-prompt-done">{doneLabel ?? sca.doneLabel}</p>
      ) : (
        <div data-slot="sca-prompt-actions">
          {onCancel ? (
            <Button data-variant="secondary" type="button" onClick={onCancel}>
              {profile.copy.cancel}
            </Button>
          ) : null}
          <Button
            type="button"
            disabled={pending}
            data-agent-confirm={personOnly("SCA requires a person")}
            onClick={async () => {
              setPending(true);
              await new Promise((r) => setTimeout(r, 700));
              setPending(false);
              setDone(true);
              await onComplete?.();
            }}
          >
            {pending ? (pendingLabel ?? sca.pendingLabel) : (openLabel ?? sca.openLabel)}
          </Button>
        </div>
      )}
    </section>
  );
}

export { ScaPrompt };
