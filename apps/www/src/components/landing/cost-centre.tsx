import { createChange, definePrimitive } from "@ui-sdk/core";
import { createParts } from "@ui-sdk/react/primitive";

import { useLang } from "@/lib/lang";

const CENTRES = [
  { value: "100", label: "100 Sales", nb: "100 Salg" },
  { value: "420", label: "420 Marketing", nb: "420 Markedsføring" },
  { value: "700", label: "700 Operations", nb: "700 Drift" },
];

/** A control Booki does not ship. Defining it puts it on the agent bridge. */
const costCentre = definePrimitive({
  name: "cost-centre",
  options: { defaultValue: "string" },
  state: (options: { defaultValue?: string }) => ({
    value: options.defaultValue ?? "100",
  }),
  api: (context) => {
    const change = createChange(context);
    return {
      setCostCentre: (code: string, event?: Event) => {
        if (!CENTRES.some((centre) => centre.value === String(code))) {
          throw new Error(`No cost centre "${code}". Use 100, 420 or 700.`);
        }
        return change("value", String(code), { reason: "set-cost-centre", event });
      },
    };
  },
  slots: (slot) => ({
    // data-booki: take @booki/styles' base look for fields and buttons, like Booki's own controls.
    root: slot({ role: "group", attrs: () => ({ "data-booki": "" }) }),
    select: slot({
      attrs: (state) => ({ value: state.value, "aria-label": "Cost centre" }),
      on: {
        // "input" is the adapter's name for React's onChange.
        input: (event, { api }) => {
          api.setCostCentre((event.target as HTMLSelectElement).value, event);
        },
      },
    }),
  }),
  agent: {
    actions: ["setCostCentre"],
    closed: true,
    items: () => CENTRES.map(({ value, label }) => ({ value, label })),
  },
});

const parts = createParts(costCentre, { root: "div", select: "select" });

export function CostCentre() {
  const { t } = useLang();
  return (
    <parts.Root aria-label={t("Cost centre", "Kostnadssted")}>
      <parts.Select aria-label={t("Cost centre", "Kostnadssted")}>
        {CENTRES.map((centre) => (
          <option key={centre.value} value={centre.value}>
            {t(centre.label, centre.nb)}
          </option>
        ))}
      </parts.Select>
    </parts.Root>
  );
}
