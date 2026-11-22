import { type PeriodGranularity } from "@booki/core/period";
import { createParts } from "@ui-sdk/react/primitive";
import { useId, useState, type ComponentProps } from "react";
import { localToday } from "@booki/core/financial-date";
import { FormValue, type BookiFormProps } from "./form-props.js";
import { useBookiLocaleOptional } from "./locale.js";
import { buildItems, accountingPeriod } from "@booki/primitives/accounting-period-select";

const parts = createParts(accountingPeriod, {
  root: "div",
  trigger: "button",
  list: "div",
  option: "div",
  select: "select",
});

const AccountingPeriodRoot = parts.Root;
/** The select-only combobox a person opens. */
const AccountingPeriodTrigger = parts.Trigger;
const AccountingPeriodList = parts.List;
const AccountingPeriodOption = parts.Option;
/** The native `<select>` fallback, shown by @booki/styles on touch screens. */
const AccountingPeriodControl = parts.Select;

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
