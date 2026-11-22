import type { CSSProperties, ReactNode, Ref } from "react";

import { useLang } from "@/lib/lang";

/** The live control, on its sheet of paper. `above` sits between the label and the sheet. */
export function Preview({
  children,
  title,
  above,
  sheetRef,
  reserve,
}: {
  children: ReactNode;
  title?: string;
  above?: ReactNode;
  sheetRef?: Ref<HTMLDivElement>;
  /** Height to hold for the control before and while it changes, in px: [phone, wider]. */
  reserve?: readonly [number, number];
}) {
  const { t } = useLang();
  return (
    <section className="grid min-w-0 content-start gap-2">
      <p className="site-kicker">{title ?? t("The person sees", "Personen ser")}</p>
      {above}
      <div
        ref={sheetRef}
        className="site-sheet doc-sheet min-w-0"
        style={
          reserve ? ({ "--reserve-sm": `${reserve[0]}px`, "--reserve": `${reserve[1]}px` } as CSSProperties) : undefined
        }
      >
        {children}
      </div>
    </section>
  );
}
