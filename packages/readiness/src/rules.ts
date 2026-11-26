/**
 * Every check the readiness report runs, with the Agent Contract section it
 * enforces (spec/agent-contract.md), why it matters to an agent, the fix, and
 * how much it can take off the score.
 */

export type RuleId =
  | "bridge-missing"
  | "bridge-unnamed-control"
  | "bridge-person-action"
  | "field-unnamed"
  | "field-broken-name"
  | "field-ambiguous"
  | "field-not-on-bridge"
  | "focusable-without-role"
  | "button-unnamed"
  | "button-icon-name"
  | "icon-size"
  | "chart-pixels-only"
  | "irreversible-ungated"
  | "secret-visible"
  | "snapshot-size";

export type Severity = "critical" | "serious" | "moderate" | "minor";

export type Rule = {
  id: RuleId;
  title: string;
  /** Section of the Agent Contract, e.g. "§3.1". */
  contract: string;
  severity: Severity;
  why: string;
  fix: string;
  /** The Booki control that does this right, when there is one. */
  booki?: string;
  /** Points taken off the score for each finding. */
  points: number;
  /** Most points this rule can take off, however many findings it has. */
  cap: number;
};

export const RULES: Record<RuleId, Rule> = {
  "bridge-missing": {
    id: "bridge-missing",
    title: "No agent bridge on the page",
    contract: "§2 Bridge, §4.1",
    severity: "critical",
    why: "Without a bridge (snapshot, act, subscribe) an agent has to read the accessibility tree, guess which element is which and click or type into it. That is where the cost, the time and the wrong postings come from.",
    fix: "Expose the screen's controls through an agent bridge: each control with a name, its state as values and its named actions. With ui-sdk, create the agent once and register its tools for browser agents (WebMCP).",
    booki: "createBookiAgent() + registerTools() from @booki-aui/react",
    points: 25,
    cap: 25,
  },
  "bridge-unnamed-control": {
    id: "bridge-unnamed-control",
    title: "Bridge control without a name",
    contract: "§3.1",
    severity: "serious",
    why: "An agent addresses a bridge control by its label. One without a label can only be reached by its ref, which changes between page loads, so the agent has to snapshot and guess.",
    fix: "Give the control an aria-label or a visible label the bridge reads.",
    booki: "Every Booki control takes aria-label and reports it as its label",
    points: 4,
    cap: 12,
  },
  "bridge-person-action": {
    id: "bridge-person-action",
    title: "A person's decision is offered to the agent",
    contract: "§5.1",
    severity: "critical",
    why: "Approving, rejecting, releasing, finalizing, submitting and signing off are a person's decisions. Offered as an agent action, an agent can take them, and the audit trail records an approval nobody gave.",
    fix: "Remove the action from the agent's list. Keep the decision as a person's button whose handler requires a real input event, and refuse it on the server for agent callers.",
    booki:
      "ApprovalChain, AttestationStatus, PaymentBatch, CloseChecklist (person-only buttons); @booki-aui/core/server guards (PERSON_ONLY)",
    points: 15,
    cap: 30,
  },
  "field-unnamed": {
    id: "field-unnamed",
    title: "Field without an accessible name",
    contract: "§3.1, §4.1",
    severity: "serious",
    why: "The agent sees only a role (textbox, listbox, combobox) with no name, so it can find the field only by where it sits among others. One row off and the amount lands in the wrong field or the wrong account.",
    fix: 'Name every field: a <label for>, aria-labelledby pointing at the visible column header, or aria-label. In tables, include the row ("Line 2 amount").',
    points: 5,
    cap: 30,
  },
  "field-broken-name": {
    id: "field-broken-name",
    title: "Field named by a rendering bug",
    contract: "§3.1",
    severity: "serious",
    why: 'The accessible name is a programming artefact such as "[object Object]" or "undefined". The agent reads it as the field\'s name and cannot tell what the field is.',
    fix: "Render the label text, not the object. Check that aria-label receives a string.",
    points: 5,
    cap: 15,
  },
  "field-ambiguous": {
    id: "field-ambiguous",
    title: "Fields that share one name",
    contract: "§3.1, §4.1",
    severity: "moderate",
    why: "Several fields of the same role carry the same name, so the name does not say which one to use. The agent has to count positions, and the count changes as rows are added.",
    fix: 'Make each name unique on the page: add the row or section ("Debit account, line 2").',
    booki: "VoucherComposer: one control, lines changed by index through named actions",
    points: 2,
    cap: 8,
  },
  "field-not-on-bridge": {
    id: "field-not-on-bridge",
    title: "Field missing from the bridge",
    contract: "§3.1, §4.1",
    severity: "serious",
    why: "The page has a bridge, and a person can use this field, but the bridge's snapshot has no entry for it. An agent working through the bridge does not know the field exists; to set it, it has to fall back to the accessibility tree and click, and a page that otherwise looks ready hides the gap.",
    fix: "Put the field on the bridge: build it from a bridge-registered control (with ui-sdk, its Select, RadioGroup, Checkbox or Input; with Booki, the matching control) instead of a plain element, so it appears in snapshot() with its label and actions. A field that should stay with the person goes inside data-agent-hidden.",
    booki:
      "AccountPicker, TaxCodeSelect, CurrencySelect, AccountingPeriodSelect, AmountField; ui-sdk Select, RadioGroup, Checkbox",
    points: 5,
    cap: 30,
  },
  "focusable-without-role": {
    id: "focusable-without-role",
    title: "Focusable element that is not a control",
    contract: "§3.1, §4.1",
    severity: "serious",
    why: "A person can tab to it or click it, and something happens (an editor opens, a value changes), but the accessibility tree calls it a cell or plain text. An agent does not see a field there: it has to click by position and hope an editor appears.",
    fix: 'Use a real control (an input in the cell, a button) or give the element the role it plays (gridcell in a role=grid, button) with a name. Grid editors: role="grid" with named gridcells, or an input per cell labelled by its column header and row.',
    booki: "VoucherComposer, InvoiceEditor, DataTable",
    points: 3,
    cap: 12,
  },
  "button-unnamed": {
    id: "button-unnamed",
    title: "Button without a name",
    contract: "§3.1, §4.1",
    severity: "serious",
    why: 'The agent sees "button" and nothing else. It has to press it to learn what it does.',
    fix: "Give the button visible text or an aria-label that says what it does.",
    points: 3,
    cap: 12,
  },
  "button-icon-name": {
    id: "button-icon-name",
    title: "Button named by an icon font",
    contract: "§3.1, §4.1",
    severity: "moderate",
    why: 'An icon font draws the icon from a ligature, so the button\'s accessible name is the ligature ("close", "content_copy"). The agent reads a developer\'s word in English on a screen in the person\'s language, and "close" may delete a line.',
    fix: 'Hide the icon from assistive technology (aria-hidden="true" on the glyph) and name the button by what it does (aria-label="Delete line 2").',
    points: 2,
    cap: 10,
  },
  "icon-size": {
    id: "icon-size",
    title: "Icon at a size it is not drawn for",
    contract: "§3.1 (presentation)",
    severity: "minor",
    why: "Booki's icons are drawn for 16 and 20 px. In between, their lines fall between pixels and blur, so a status icon beside a figure reads as a smudge. It does not change what an agent reads, which is why it costs little.",
    fix: "Show the icon at size={16} or size={20}, and let the button or row around it take the space.",
    booki: "size={16 | 20} on any @booki-aui/icons component",
    points: 1,
    cap: 3,
  },
  "chart-pixels-only": {
    id: "chart-pixels-only",
    title: "Figures only in pixels",
    contract: "§3.3",
    severity: "serious",
    why: "The chart is a canvas or an SVG with no name and no figures in the DOM. An agent can read it only from a screenshot or by hovering for tooltips, month by month, and guesses the month from where the pointer is.",
    fix: "Put the figures in the DOM: an accessible name that states them, a table next to the chart (it may be visually hidden), or chart parts as buttons named by their value. On a bridge, expose the series as state.",
    booki: "TrendChart, BarChart, AgingChart, CashflowWaterfall, KpiStat",
    points: 10,
    cap: 30,
  },
  "irreversible-ungated": {
    id: "irreversible-ungated",
    title: "Irreversible button without a gate",
    contract: "§5.2",
    severity: "critical",
    why: "The button posts, pays, sends or approves, and nothing marks it. An agent presses it like any other button: no policy is asked, no person is asked, and the step cannot be undone.",
    fix: "Mark it with data-agent-confirm=\"<what it does>\" and decide in the bridge's allow() whether the company lets an agent take the step; otherwise send it to a person. For approvals, keep it a person's button and off the agent's actions.",
    booki: "ui-sdk Button with data-agent-confirm + createBookiAgent({ allow })",
    points: 10,
    cap: 20,
  },
  "secret-visible": {
    id: "secret-visible",
    title: "Secret readable by the agent",
    contract: "§3.5",
    severity: "serious",
    why: "Bank account numbers, IBANs, payment references (KID) and card data are in the text the agent reads. They end up in the model's context, its logs and its provider's logs.",
    fix: "Show the value to the person but keep it out of what the agent reads: mark the element data-agent-secret so the bridge redacts it, and keep it out of the control's state. An agent may set a secret; it must not read one back.",
    booki: "BankAccountInput, IbanInput, PaymentReferenceInput (redacted in the snapshot)",
    points: 8,
    cap: 16,
  },
  "snapshot-size": {
    id: "snapshot-size",
    title: "Large accessibility snapshot",
    contract: "§1",
    severity: "minor",
    why: "A browser agent reads the whole accessibility snapshot after most steps. Every token in it is paid for again on every step of a task.",
    fix: "Cut what the agent does not need: hide decoration (aria-hidden), collapse long lists behind a search, and give the agent a bridge whose snapshot holds only controls and their state.",
    points: 5,
    cap: 10,
  },
};

/** Snapshot size thresholds, in tokens (characters ÷ 4). */
export const SNAPSHOT_TOKENS = { warn: 6_000, high: 15_000 };
