import {
  isValidElement,
  type ButtonHTMLAttributes,
  type ElementType,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";

import { Button as SdkButton } from "@ui-sdk/react/button";

import { cn } from "@/lib/utils";

const variants = {
  primary: "border-transparent bg-primary text-primary-foreground hover:bg-[var(--primary-hover)]",
  secondary:
    "border-transparent bg-secondary text-secondary-foreground shadow-[var(--elevation-raised)] hover:bg-muted hover:shadow-[var(--elevation-raised-hover)]",
  outline: "border-transparent bg-card text-foreground shadow-[var(--elevation-ring)] hover:bg-muted",
  ghost: "border-transparent bg-transparent text-foreground hover:bg-muted",
} as const;

const sizes = {
  sm: "min-h-10 px-3 text-xs",
  md: "min-h-10 px-4 text-sm",
  lg: "min-h-11 px-5 text-sm",
} as const;

export type ButtonProps = {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  asChild?: boolean;
  className?: string;
  children?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">;

/**
 * Docs/marketing chrome button. Prefer composition via `asChild` over style props.
 */
function Button({
  variant = "primary",
  size = "md",
  asChild = false,
  className,
  children,
  ref,
  type = "button",
  disabled,
  ...props
}: ButtonProps) {
  const classes = cn(
    "inline-flex items-center justify-center gap-1.5 rounded-[var(--bk-radius-sm)] border font-medium no-underline",
    "transition-[color,background-color,box-shadow,transform] duration-150 ease-out",
    "active:scale-[0.97]",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground",
    "disabled:pointer-events-none disabled:opacity-50",
    variants[variant],
    sizes[size],
    className,
  );

  if (asChild && isValidElement(children)) {
    const child = children as ReactElement<{
      className?: string;
      ref?: Ref<HTMLElement>;
    }>;
    const Child = child.type as ElementType;
    return (
      <Child
        {...child.props}
        className={cn(classes, child.props.className)}
        ref={(ref as Ref<HTMLElement>) ?? child.props.ref}
        {...props}
      />
    );
  }

  // The ui-sdk Button, so every button on the site is a control an agent can
  // find in the snapshot and press over the bridge, the same as the library's.
  return (
    <SdkButton ref={ref} type={type} disabled={disabled} className={classes} {...(props as Record<string, unknown>)}>
      {children}
    </SdkButton>
  );
}

export { Button };
