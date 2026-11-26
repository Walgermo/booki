import { useId, type ComponentProps, type ReactNode } from "react";

export type CardProps = Omit<ComponentProps<"section">, "title"> & {
  /** The card's heading. It names the card (`aria-labelledby`), for a screen reader and the agent. */
  title?: ReactNode;
  /** A line under the title, in muted text. */
  description?: ReactNode;
  /** Buttons at the right of the header, like an `IconButton` or a `Toolbar`. They wrap under the title when the card is narrow. */
  actions?: ReactNode;
  /** A row under the body, for totals or the card's own buttons. */
  footer?: ReactNode;
  /** The heading level of the title. Default 3. */
  headingLevel?: 2 | 3 | 4 | 5 | 6;
};

/**
 * A paper surface for one piece of work: a header (title, optional line and
 * actions), the body, and an optional footer. Layout only: it has no agent
 * actions of its own, and the controls inside it are on the bridge as they are
 * anywhere. Its title names it, so the region reads as "Open items", not as an
 * anonymous box. `data-slot="card"`; Booki's look keys on
 * `[data-slot="card"][data-booki-card]`, so another library's card is never restyled.
 */
export function Card({ title, description, actions, footer, headingLevel = 3, children, id, ...props }: CardProps) {
  const auto = useId();
  const titleId = `${id ?? auto}-title`;
  const Heading = `h${headingLevel}` as const;
  const hasTitle = title !== undefined && title !== null && title !== false;
  const named = props["aria-label"] !== undefined || props["aria-labelledby"] !== undefined;
  const header = hasTitle || description || actions;
  return (
    <section
      id={id}
      {...props}
      data-slot="card"
      data-booki-card=""
      aria-labelledby={props["aria-labelledby"] ?? (hasTitle && !named ? titleId : undefined)}
    >
      {header ? (
        <div data-slot="card-header">
          {hasTitle || description ? (
            <div data-slot="card-heading">
              {hasTitle ? (
                <Heading data-slot="card-title" id={titleId}>
                  {title}
                </Heading>
              ) : null}
              {description ? <p data-slot="card-description">{description}</p> : null}
            </div>
          ) : null}
          {actions ? <div data-slot="card-actions">{actions}</div> : null}
        </div>
      ) : null}
      {children !== undefined && children !== null && children !== false ? (
        <div data-slot="card-body">{children}</div>
      ) : null}
      {footer ? <div data-slot="card-footer">{footer}</div> : null}
    </section>
  );
}
