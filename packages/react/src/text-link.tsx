import { cloneElement, isValidElement, type AnchorHTMLAttributes, type ReactElement, type ReactNode } from "react";

/** The book of a docs page: an open book with lines on it. */
export function DocsIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" data-slot="text-link-icon">
      <path
        d="M8 3.6C6.6 2.7 4.7 2.4 2.5 2.6v9.8c2.2-.2 4.1.1 5.5 1 1.4-.9 3.3-1.2 5.5-1V2.6c-2.2-.2-4.1.1-5.5 1Zm0 0v9.8"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M4.5 5.6c.9 0 1.7.2 2.3.5M4.5 8c.9 0 1.7.2 2.3.5M9.2 6.1c.6-.3 1.4-.5 2.3-.5M9.2 8.5c.6-.3 1.4-.5 2.3-.5"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** GitHub's mark (the Invertocat), as GitHub publishes it, for links to a repository. */
export function GitHubIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" data-slot="text-link-icon">
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
      />
    </svg>
  );
}

const ICONS = { docs: DocsIcon, github: GitHubIcon } as const;

export type TextLinkProps = {
  /** A named icon before the text, or your own element. */
  icon?: keyof typeof ICONS | ReactNode;
  /**
   * Render your own link element (a router's Link) with the text link's look:
   * `<TextLink asChild><Link to="/docs">Docs</Link></TextLink>`.
   */
  asChild?: boolean;
  children?: ReactNode;
} & AnchorHTMLAttributes<HTMLAnchorElement>;

/**
 * A text link in Booki's look: ink text, an underline that firms up on hover,
 * and an optional icon before it. Display only: a link is navigation, not an
 * agent action, so it has no primitive and no agent actions.
 */
export function TextLink({ icon, asChild = false, children, ...props }: TextLinkProps) {
  const Icon = typeof icon === "string" && icon in ICONS ? ICONS[icon as keyof typeof ICONS] : null;
  const glyph = Icon ? <Icon /> : (icon ?? null);
  const content = glyph ? (
    <>
      {glyph}
      <span data-slot="text-link-label">{children}</span>
    </>
  ) : (
    children
  );
  const attrs = { "data-slot": "text-link", "data-variant": glyph ? "icon" : "text", ...props };

  if (asChild && isValidElement(children)) {
    const child = children as ReactElement<{ children?: ReactNode }>;
    const inner = glyph ? (
      <>
        {glyph}
        <span data-slot="text-link-label">{child.props.children}</span>
      </>
    ) : (
      child.props.children
    );
    return cloneElement(child, attrs as never, inner);
  }
  return <a {...attrs}>{content}</a>;
}
