import { isValidElement, type ElementType, type ReactElement, type ReactNode, type Ref } from "react";

import { Button as BookiButton, type ButtonProps as BookiButtonProps } from "@booki-aui/react";

/** The site's names; `outline` reads as Booki's secondary and `lg` as its control height. */
const VARIANT = { primary: "primary", secondary: "secondary", outline: "secondary", ghost: "ghost" } as const;
const SIZE = { sm: "sm", md: "md", lg: "md" } as const;

export type ButtonProps = {
  variant?: keyof typeof VARIANT;
  size?: keyof typeof SIZE;
  /** Style a link (or another element) as a button: it gets Booki's button look, not its role. */
  asChild?: boolean;
  className?: string;
  children?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
} & Omit<BookiButtonProps, "variant" | "size" | "className" | "children" | "ref">;

/**
 * The site's button: Booki's own Button, so the docs and landing use the library's look
 * and an agent finds and presses every button over the bridge. `asChild` puts the same
 * look on a link.
 */
function Button({
  variant = "primary",
  size = "md",
  asChild = false,
  className,
  children,
  ref,
  ...props
}: ButtonProps) {
  const look = { "data-booki-button": "", "data-variant": VARIANT[variant], "data-size": SIZE[size] };

  if (asChild && isValidElement(children)) {
    const child = children as ReactElement<{ className?: string; ref?: Ref<HTMLElement> }>;
    const Child = child.type as ElementType;
    return (
      <Child
        {...child.props}
        {...props}
        {...look}
        data-slot="button"
        className={[className, child.props.className].filter(Boolean).join(" ") || undefined}
        ref={(ref as Ref<HTMLElement>) ?? child.props.ref}
      />
    );
  }

  return (
    <BookiButton ref={ref} variant={VARIANT[variant]} size={SIZE[size]} className={className} {...props}>
      {children}
    </BookiButton>
  );
}

export { Button };
