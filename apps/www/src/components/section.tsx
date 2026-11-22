import type { ReactNode } from "react";

/**
 * A page section: the title sits in a fixed margin column, the content to its
 * right, with a shelf line above. Stacks on narrow screens.
 */
export function Section({
  id,
  title,
  note,
  children,
}: {
  id: string;
  title: string;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="site-section">
      <div>
        <h2 id={id} className="site-section__title">
          {title}
        </h2>
        {note ? <p className="site-section__note">{note}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
