import { cleanup, fireEvent, render } from "@testing-library/react";
import { createRef, type ReactElement, type Ref } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountPicker } from "./account-picker.js";
import { AccountingPeriodSelect } from "./accounting-period-select.js";
import { AmountField } from "./amount-field.js";
import { BankAccountInput } from "./bank-account-input.js";
import { CurrencySelect } from "./currency-select.js";
import { createBookiAgent } from "./booki-agent.js";
import { FinancialDateField } from "./financial-date-field.js";
import type { BookiFormProps } from "./form-props.js";
import { IbanInput } from "./iban-input.js";
import { InvoiceNumberInput } from "./invoice-number-input.js";
import { BookiLocaleProvider } from "./locale.js";
import { OrganizationNumberInput } from "./organization-number-input.js";
import { PaymentReferenceInput } from "./payment-reference-input.js";
import { TaxCodeSelect } from "./tax-code-select.js";

afterEach(() => cleanup());

/** What every composed control must accept. */
type Shared = BookiFormProps & {
  className?: string;
  ref?: Ref<HTMLDivElement>;
  "data-testid"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-errormessage"?: string;
  // Each control has its own callback signature; the tests only count calls.
  onValueChange?: (...args: any[]) => void;
};

type Spec = {
  /** Component name, and the primitive name the agent snapshot lists. */
  name: string;
  component: string;
  country?: "NO" | "US";
  render: (props: Shared) => ReactElement;
  /** Selector of the visible control that takes `id` and `required`. */
  visible: string;
  /** What a person does to change the value. */
  edit: () => void;
  /** A valid agent step on the control. */
  step: { action: string; args: unknown[] };
  /** Form entries before and after the person's edit, with `name="f"`. */
  initial: Record<string, string>;
  edited: Record<string, string>;
};

const chart = [
  { number: "1500", name: "Kundefordringer" },
  { number: "2701", name: "Utgående MVA" },
  { number: "3000", name: "Salgsinntekt" },
];

const el = <T extends HTMLElement>(selector: string) => {
  const found = document.querySelector(selector);
  if (!found) throw new Error(`${selector} not rendered`);
  return found as T;
};
const typeInto = (selector: string, value: string) => fireEvent.input(el(selector), { target: { value } });
const choose = (selector: string, value: string) => fireEvent.change(el(selector), { target: { value } });

const specs: Spec[] = [
  {
    name: "AmountField",
    component: "amount-field",
    render: (props) => <AmountField defaultValue={12_500} {...props} />,
    visible: '[data-slot="amount-field-input"]',
    edit: () => {
      const input = el('[data-slot="amount-field-input"]');
      fireEvent.focus(input);
      fireEvent.input(input, { target: { value: "200" } });
      fireEvent.blur(input);
    },
    step: { action: "setMinor", args: [500] },
    // Integer minor units, never the formatted "125,00".
    initial: { f: "12500" },
    edited: { f: "20000" },
  },
  {
    name: "TaxCodeSelect",
    component: "tax-code-select",
    render: (props) => <TaxCodeSelect defaultValue="MVA25" {...props} />,
    visible: '[data-slot="tax-code-select-trigger"]',
    edit: () => choose('[data-slot="tax-code-select-control"]', "MVA15"),
    step: { action: "setTaxCode", args: ["MVA0"] },
    initial: { f: "MVA25" },
    edited: { f: "MVA15" },
  },
  {
    name: "AccountPicker",
    component: "account-picker",
    render: (props) => <AccountPicker accounts={chart} defaultValue="1500" {...props} />,
    visible: '[data-slot="account-picker-input"]',
    edit: () => choose('[data-slot="account-picker-control"]', "3000"),
    step: { action: "setAccount", args: ["2701"] },
    initial: { f: "1500" },
    edited: { f: "3000" },
  },
  {
    name: "CurrencySelect",
    component: "currency-select",
    render: (props) => <CurrencySelect defaultValue="NOK" {...props} />,
    visible: '[data-slot="currency-select-trigger"]',
    edit: () => choose('[data-slot="currency-select-control"]', "USD"),
    step: { action: "setCurrency", args: ["USD"] },
    initial: { f: "NOK" },
    edited: { f: "USD" },
  },
  {
    name: "BankAccountInput (NO)",
    component: "bank-account",
    render: (props) => <BankAccountInput {...props} />,
    visible: '[data-slot="bank-account-kontonummer"]',
    edit: () => typeInto('[data-slot="bank-account-kontonummer"]', "8601 11 17947"),
    step: { action: "setKontonummer", args: ["86011117947"] },
    // Digits only, without the display spacing.
    initial: { f: "" },
    edited: { f: "86011117947" },
  },
  {
    name: "BankAccountInput (US)",
    component: "bank-account",
    country: "US",
    render: (props) => <BankAccountInput {...props} />,
    visible: '[data-slot="bank-account-routing"]',
    edit: () => {
      typeInto('[data-slot="bank-account-routing"]', "021000021");
      typeInto('[data-slot="bank-account-account"]', "123456789");
    },
    step: { action: "setRouting", args: ["021000021"] },
    initial: { "f.routingNumber": "", "f.accountNumber": "" },
    edited: { "f.routingNumber": "021000021", "f.accountNumber": "123456789" },
  },
  {
    name: "PaymentReferenceInput",
    component: "payment-reference",
    render: (props) => <PaymentReferenceInput defaultValue="2345676" {...props} />,
    visible: '[data-slot="payment-reference-field"]',
    edit: () => typeInto('[data-slot="payment-reference-field"]', "1234567"),
    step: { action: "setReference", args: ["7654321"] },
    initial: { f: "2345676" },
    edited: { f: "1234567" },
  },
  {
    name: "OrganizationNumberInput",
    component: "organization-number",
    render: (props) => <OrganizationNumberInput defaultValue="974 760 673" {...props} />,
    visible: '[data-slot="organization-number-field"]',
    edit: () => typeInto('[data-slot="organization-number-field"]', "923 609 016"),
    step: { action: "setOrganizationNumber", args: ["923609016"] },
    initial: { f: "974760673" },
    edited: { f: "923609016" },
  },
  {
    name: "IbanInput",
    component: "iban-input",
    render: (props) => <IbanInput defaultValue="NO93 8601 1117 947" {...props} />,
    visible: '[data-slot="iban-field"]',
    edit: () => typeInto('[data-slot="iban-field"]', "GB82 WEST 1234 5698 7654 32"),
    step: { action: "setIban", args: ["GB82WEST12345698765432"] },
    initial: { f: "NO9386011117947" },
    edited: { f: "GB82WEST12345698765432" },
  },
  {
    name: "FinancialDateField",
    component: "financial-date",
    render: (props) => <FinancialDateField defaultValue="2026-03-15" {...props} />,
    visible: '[data-slot="financial-date-control"]',
    edit: () => choose('[data-slot="financial-date-control"]', "2026-04-01"),
    step: { action: "setDate", args: ["2026-05-01"] },
    initial: { f: "2026-03-15" },
    edited: { f: "2026-04-01" },
  },
  {
    name: "AccountingPeriodSelect",
    component: "accounting-period",
    render: (props) => <AccountingPeriodSelect year={2026} granularity="month" defaultValue="2026-03" {...props} />,
    visible: '[data-slot="accounting-period-trigger"]',
    edit: () => choose('[data-slot="accounting-period-control"]', "2026-04"),
    step: { action: "setPeriod", args: ["2026-05"] },
    initial: { f: "2026-03" },
    edited: { f: "2026-04" },
  },
  {
    name: "InvoiceNumberInput",
    component: "invoice-number",
    render: (props) => <InvoiceNumberInput defaultValue="INV-1" {...props} />,
    visible: '[data-slot="invoice-number-field"]',
    edit: () => typeInto('[data-slot="invoice-number-field"]', "INV-2"),
    step: { action: "setInvoiceNumber", args: ["INV-3"] },
    initial: { f: "INV-1" },
    edited: { f: "INV-2" },
  },
];

function setup(spec: Spec, props: Shared = {}) {
  const agent = createBookiAgent({ agentId: "test" });
  const onValueChange = vi.fn();
  render(
    <BookiLocaleProvider defaultCountry={spec.country ?? "NO"}>
      <form>{spec.render({ name: "f", onValueChange, ...props })}</form>
    </BookiLocaleProvider>,
  );
  const entry = () => {
    const found = agent.snapshot().find((c) => c.component === spec.component);
    if (!found) throw new Error(`${spec.component} not in the snapshot`);
    return found as typeof found & { disabled?: boolean };
  };
  const submitted = () =>
    Object.fromEntries(
      [...new FormData(el<HTMLFormElement>("form")).entries()].map(([key, value]) => [key, String(value)]),
    );
  const actAsAgent = () => agent.act({ steps: [{ ref: entry().ref, ...spec.step }] });
  return { onValueChange, entry, submitted, actAsAgent };
}

describe.each(specs)("$name in a form", (spec) => {
  it("submits its canonical value under `name`, before and after a person's edit", () => {
    const { submitted } = setup(spec);
    expect(submitted()).toEqual(spec.initial);
    spec.edit();
    expect(submitted()).toEqual(spec.edited);
  });

  it("submits what an agent set", async () => {
    const { submitted, actAsAgent } = setup(spec);
    const result = await actAsAgent();
    expect(result.ok).toBe(true);
    expect(submitted()).not.toEqual(spec.initial);
  });

  it("gives aria-invalid, aria-describedby and aria-errormessage to the visible input, not the wrapper", () => {
    setup(spec, {
      "data-testid": "root",
      "aria-invalid": true,
      "aria-describedby": "hint",
      "aria-errormessage": "oops",
    });
    const visible = el<HTMLInputElement>(spec.visible);
    expect(visible.getAttribute("aria-invalid")).toBe("true");
    // A Field adds the id of its own description; the product's id stays in the list.
    expect(visible.getAttribute("aria-describedby")?.split(" ")).toContain("hint");
    expect(visible.getAttribute("aria-errormessage")).toBe("oops");
    const root = el('[data-testid="root"]');
    expect(root.getAttribute("aria-invalid")).toBeNull();
    expect(root.getAttribute("aria-describedby")).toBeNull();
    expect(root.getAttribute("aria-errormessage")).toBeNull();
  });

  it("gives `id` and `required` to the visible input, and className, ref, aria-* and data-* to the root", () => {
    const ref = createRef<HTMLDivElement>();
    setup(spec, {
      id: "field-1",
      required: true,
      className: "mine",
      ref,
      "data-testid": "root",
    });
    const visible = el<HTMLInputElement>(spec.visible);
    expect(visible.id).toBe("field-1");
    // A picker's trigger is a button, which says so with aria-required.
    expect(visible.required === true || visible.getAttribute("aria-required") === "true").toBe(true);
    // The visible control has no name of its own: only the hidden input submits.
    expect(visible.getAttribute("name")).toBeNull();

    const root = el('[data-testid="root"]');
    expect(root).toBe(ref.current);
    expect(root.classList.contains("mine")).toBe(true);
    expect(root.contains(visible)).toBe(true);
    expect(root.getAttribute("id")).toBeNull();

    // Without `name` the control stays out of the form.
    cleanup();
    const { submitted } = setup(spec, { name: undefined });
    expect(submitted()).toEqual({});
  });

  it("disabled: refuses a person and an agent, and is left out of the form", async () => {
    const { onValueChange, entry, submitted, actAsAgent } = setup(spec, { disabled: true });
    expect(el<HTMLInputElement>(spec.visible).disabled).toBe(true);
    const shown = el<HTMLInputElement>(spec.visible).value;

    spec.edit();
    expect(onValueChange).not.toHaveBeenCalled();
    expect(el<HTMLInputElement>(spec.visible).value).toBe(shown);

    // ui-sdk's own report of a disabled component: no actions offered.
    expect(entry().disabled).toBe(true);
    expect(entry().actions).toEqual([]);
    const result = await actAsAgent();
    expect(result.ok).toBe(false);
    expect(result.error?.message).toBe(
      `${spec.component} ${entry().ref} takes no ${spec.step.action} now. It takes: nothing.`,
    );
    expect(onValueChange).not.toHaveBeenCalled();
    // As in HTML, a disabled control is not submitted.
    expect(submitted()).toEqual({});
  });

  it("readOnly: refuses a person and an agent, and is still submitted", async () => {
    const { onValueChange, entry, submitted, actAsAgent } = setup(spec, { readOnly: true });
    const visible = el<HTMLInputElement>(spec.visible);
    expect(visible.disabled).toBe(false);
    if (visible.tagName === "SELECT" || visible.tagName === "BUTTON") {
      expect(visible.getAttribute("aria-readonly")).toBe("true");
    } else {
      expect(visible.readOnly).toBe(true);
    }
    const shown = visible.value;

    spec.edit();
    expect(onValueChange).not.toHaveBeenCalled();
    expect(el<HTMLInputElement>(spec.visible).value).toBe(shown);

    expect(entry().actions).toEqual([]);
    const result = await actAsAgent();
    expect(result.ok).toBe(false);
    expect(result.error?.message).toMatch(/takes no \w+ now\. It takes: nothing\./);
    expect(onValueChange).not.toHaveBeenCalled();
    expect(submitted()).toEqual(spec.initial);
  });

  it("becomes editable again when disabled is lifted", async () => {
    const agent = createBookiAgent({ agentId: "test" });
    const view = (disabled: boolean) => (
      <BookiLocaleProvider defaultCountry={spec.country ?? "NO"}>
        <form>{spec.render({ name: "f", disabled })}</form>
      </BookiLocaleProvider>
    );
    const { rerender } = render(view(true));
    rerender(view(false));
    expect(el<HTMLInputElement>(spec.visible).disabled).toBe(false);
    const entry = agent.snapshot().find((c) => c.component === spec.component)!;
    expect(entry.actions).toContain(spec.step.action);
    spec.edit();
    expect(Object.fromEntries(new FormData(el<HTMLFormElement>("form")).entries())).toEqual(spec.edited);
  });
});

describe("BankAccountInput in the US", () => {
  it("gives the account input its own id next to the routing input", () => {
    render(
      <BookiLocaleProvider defaultCountry="US">
        <BankAccountInput id="bank" name="bank" />
      </BookiLocaleProvider>,
    );
    expect(el('[data-slot="bank-account-routing"]').id).toBe("bank");
    expect(el('[data-slot="bank-account-account"]').id).toBe("bank-account");
  });
});

describe("native form validation", () => {
  it.each([
    ["BankAccountInput (NO)", "86011117948", "86011117947"],
    ["BankAccountInput (US)", "021000022", "021000021"],
    ["OrganizationNumberInput", "974760674", "974760673"],
    ["PaymentReferenceInput", "12345", "2345676"],
    ["IbanInput", "NO9386011117948", "NO9386011117947"],
  ])("blocks an invalid %s until the value is corrected", (name, invalid, valid) => {
    const spec = specs.find((item) => item.name === name)!;
    setup(spec);
    const form = el<HTMLFormElement>("form");
    const submit = vi.fn((event: Event) => event.preventDefault());
    form.addEventListener("submit", submit);
    typeInto(spec.visible, invalid);
    expect(form.checkValidity()).toBe(false);
    form.requestSubmit();
    expect(submit).not.toHaveBeenCalled();
    typeInto(spec.visible, valid);
    expect(form.checkValidity()).toBe(true);
    form.requestSubmit();
    expect(submit).toHaveBeenCalledOnce();
  });

  it("clears a stale IBAN validation error after the agent corrects it", async () => {
    const spec = specs.find((item) => item.name === "IbanInput")!;
    const { actAsAgent } = setup(spec);
    typeInto(spec.visible, "NO93");
    expect(el<HTMLFormElement>("form").checkValidity()).toBe(false);
    expect((await actAsAgent()).ok).toBe(true);
    expect(el<HTMLFormElement>("form").checkValidity()).toBe(true);
  });
});
