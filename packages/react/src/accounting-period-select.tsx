import { type PeriodGranularity } from "@booki-aui/core/period";
import { createParts, type Parts } from "@ui-sdk/react/primitive";
import { useId, useState, type ComponentProps } from "react";
import { localToday } from "@booki-aui/core/financial-date";
import { FormValue, type BookiFormProps } from "./form-props.js";
import { useBookiLocaleOptional } from "./locale.js";
import { buildItems, accountingPeriod } from "@booki-aui/primitives/accounting-period-select";

const TAGS = {
  root: "div",
  trigger: "button",
  list: "div",
  option: "div",
  select: "select",
} as const;
// Typed by name, so the declarations refer to the definition instead of spelling it out per part.
const parts: Parts<typeof accountingPeriod, typeof TAGS> = createParts(accountingPeriod, TAGS);

const AccountingPeriodRoot: (typeof parts)["Root"] = parts.Root;
/** The select-only combobox a person opens. */
const AccountingPeriodTrigger: (typeof parts)["Trigger"] = parts.Trigger;
const AccountingPeriodList: (typeof parts)["List"] = parts.List;
const AccountingPeriodOption: (typeof parts)["Option"] = parts.Option;
/** The native `<select>` fallback, shown by @booki-aui/styles on touch screens. */
const AccountingPeriodControl: (typeof parts)["Select"] = parts.Select;

export type AccountingPeriodSelectProps = {
  value?: string;
  defaultValue?: string;
  year?: number;
  granularity?: PeriodGranularity;
  onValueChange?: (code: string) => void;
  className?: string;
} & BookiFormProps &
  Omit<ComponentProps<"div">, "onChange" | "defaultValue" | "children" | "id">;

function AccountingPeriodSelect({
  value,
  defaultValue,
  year,
  granularity: granularityProp,
  onValueChange,
  name,
  id,
  disabled,
  readOnly,
  required,
  className,
  ...props
}: AccountingPeriodSelectProps) {
  const { profile } = useBookiLocaleOptional();
  const granularity = granularityProp ?? profile.period.defaultGranularity;
  // This year, read once: a render that reads the clock can disagree with the last one.
  const [thisYear] = useState(() => Number(localToday().slice(0, 4)));
  const resolvedYear = year ?? thisYear;
  const items = buildItems(resolvedYear, granularity, profile.locale);
  const labelId = useId();

  return (
    <AccountingPeriodRoot
      value={value}
      defaultValue={defaultValue}
      year={resolvedYear}
      granularity={granularity}
      locale={profile.locale}
      label={profile.period.label}
      onValueChange={onValueChange}
      disabled={disabled}
      readOnly={readOnly}
      className={className}
      aria-label={profile.period.label}
      {...props}
    >
      {(state: { value: string }) => (
        <>
          <span data-slot="accounting-period-label" id={labelId}>
            {profile.copy.period}
          </span>
          <AccountingPeriodTrigger id={id} aria-required={required || undefined} aria-labelledby={labelId}>
            {(trigger: { text: string }) => <span data-slot="accounting-period-value">{trigger.text || "–"}</span>}
          </AccountingPeriodTrigger>
          <AccountingPeriodList>
            {items.map((item) => (
              <AccountingPeriodOption key={item.value} value={item.value} label={item.label}>
                {item.label}
              </AccountingPeriodOption>
            ))}
          </AccountingPeriodList>
          <AccountingPeriodControl tabIndex={-1}>
            {state.value === "" ? <option value="">–</option> : null}
            {items.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </AccountingPeriodControl>
          <FormValue name={name} value={state.value} disabled={disabled} />
        </>
      )}
    </AccountingPeriodRoot>
  );
}

export {
  AccountingPeriodSelect,
  AccountingPeriodRoot,
  AccountingPeriodTrigger,
  AccountingPeriodList,
  AccountingPeriodOption,
  AccountingPeriodControl,
  accountingPeriod,
};
