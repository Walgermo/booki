import type { Activity } from "@booki-aui/core/activity";
import type { Deal, PipelineStage, StageStay } from "@booki-aui/core/pipeline";
import type { RecurringAgreement } from "@booki-aui/core/recurring";

/**
 * The example's day and its sales data. A fixed date keeps the reports and the
 * tests the same every time; your app reads the date and its database.
 */
export const TODAY = "2026-11-24";

export const CURRENCIES = ["NOK", "EUR", "USD", "SEK"] as const;

export const STAGES: PipelineStage[] = [
  { id: "lead", name: "Lead", probability: 10 },
  { id: "meeting", name: "Møte holdt", probability: 25 },
  { id: "quote", name: "Tilbud sendt", probability: 50 },
  { id: "negotiation", name: "Forhandling", probability: 75 },
  { id: "won", name: "Vunnet", probability: 100, outcome: "won" },
  { id: "lost", name: "Tapt", probability: 0, outcome: "lost" },
];

export const OPEN_STAGES = STAGES.filter((stage) => !stage.outcome).map((stage) => stage.id);

export const COMPANIES: Record<string, string> = {
  fjordkraft: "Fjordkraft Bygg AS",
  nordlys: "Nordlys Logistikk AS",
  havbris: "Havbris Holding AS",
  lysaker: "Lysaker Eiendom AS",
  tindefjell: "Tindefjell Turisme AS",
  solstad: "Solstad Maskin AS",
  vestby: "Vestby Bakeri AS",
};

export function seedDeals(): Deal[] {
  const deal = (over: Partial<Deal> & Pick<Deal, "id" | "name" | "stageId">): Deal => ({
    valueMinor: null,
    currency: "NOK",
    valueStatus: "unknown",
    ...over,
  });
  return [
    deal({
      id: "D-101",
      name: "Regnskapslisens 2027",
      company: COMPANIES.fjordkraft,
      stageId: "quote",
      valueMinor: 180_000_00,
      valueStatus: "known",
      valueSource: "Tilbud 2026-114",
      ownerId: "kari",
      expectedClose: "2026-12-15",
      stageChangedAt: "2026-11-10T09:00:00Z",
    }),
    deal({
      id: "D-102",
      name: "Lønnstjenester",
      company: COMPANIES.nordlys,
      stageId: "meeting",
      valueMinor: 60_000_00,
      ownerId: "kari",
      stageChangedAt: "2026-09-20T09:00:00Z",
    }),
    deal({
      id: "D-103",
      name: "Konsernrapportering",
      company: COMPANIES.havbris,
      stageId: "negotiation",
      valueMinor: 25_000_00,
      currency: "EUR",
      valueStatus: "estimate",
      valueSource: "Møte 4. nov.",
      ownerId: "ola",
      expectedClose: "2026-11-20",
      stageChangedAt: "2026-11-18T09:00:00Z",
    }),
    deal({
      id: "D-104",
      name: "Rådgivning 2027",
      company: COMPANIES.lysaker,
      stageId: "lead",
      ownerId: "ola",
      stageChangedAt: "2026-11-21T09:00:00Z",
    }),
    deal({
      id: "D-105",
      name: "Årsoppgjør",
      company: COMPANIES.tindefjell,
      stageId: "won",
      valueMinor: 95_000_00,
      valueStatus: "known",
      valueSource: "Ordre 88",
      ownerId: "kari",
      closedBy: "kari",
      closedAt: "2026-11-12T10:00:00Z",
      stageChangedAt: "2026-11-12T10:00:00Z",
    }),
    deal({
      id: "D-106",
      name: "Fakturaportal",
      company: COMPANIES.solstad,
      stageId: "lost",
      valueMinor: 40_000_00,
      valueStatus: "estimate",
      valueSource: "Samtale 2. okt.",
      ownerId: "ola",
      closedBy: "ola",
      closedAt: "2026-10-30T10:00:00Z",
      lostReason: "Valgte en konkurrent på pris",
      stageChangedAt: "2026-10-30T10:00:00Z",
    }),
    deal({
      id: "D-107",
      name: "Kassasystem",
      company: COMPANIES.vestby,
      stageId: "quote",
      valueMinor: 48_000_00,
      valueStatus: "known",
      valueSource: "Tilbud 2026-121",
      ownerId: "kari",
      expectedClose: "2027-01-20",
      stageChangedAt: "2026-11-05T09:00:00Z",
    }),
  ];
}

/** The stages each deal has been through, in order, for the funnel. Your app keeps a stage history. */
export const HISTORY: Record<string, string[]> = {
  "D-101": ["lead", "meeting", "quote"],
  "D-102": ["lead", "meeting"],
  "D-103": ["lead", "meeting", "quote", "negotiation"],
  "D-104": ["lead"],
  "D-105": ["lead", "meeting", "quote", "negotiation", "won"],
  "D-106": ["lead", "meeting", "quote"],
  "D-107": ["lead", "meeting", "quote"],
};

/** Finished stays in a stage, for time in stage. The stay a deal is in now comes from `stageChangedAt`. */
export const PAST_STAYS: StageStay[] = [
  { dealId: "D-101", stageId: "lead", enteredAt: "2026-10-01", leftAt: "2026-10-08" },
  { dealId: "D-101", stageId: "meeting", enteredAt: "2026-10-08", leftAt: "2026-11-10" },
  { dealId: "D-102", stageId: "lead", enteredAt: "2026-09-02", leftAt: "2026-09-20" },
  { dealId: "D-103", stageId: "lead", enteredAt: "2026-08-15", leftAt: "2026-08-20" },
  { dealId: "D-103", stageId: "meeting", enteredAt: "2026-08-20", leftAt: "2026-09-16" },
  { dealId: "D-103", stageId: "quote", enteredAt: "2026-09-16", leftAt: "2026-11-18" },
  { dealId: "D-105", stageId: "lead", enteredAt: "2026-07-01", leftAt: "2026-07-05" },
  { dealId: "D-105", stageId: "meeting", enteredAt: "2026-07-05", leftAt: "2026-08-01" },
  { dealId: "D-105", stageId: "quote", enteredAt: "2026-08-01", leftAt: "2026-09-12" },
  { dealId: "D-105", stageId: "negotiation", enteredAt: "2026-09-12", leftAt: "2026-11-12" },
  { dealId: "D-107", stageId: "lead", enteredAt: "2026-10-12", leftAt: "2026-10-15" },
  { dealId: "D-107", stageId: "meeting", enteredAt: "2026-10-15", leftAt: "2026-11-05" },
];

/** Days a deal should take at most in each open stage. */
export const STAGE_TARGETS: Record<string, number> = { lead: 14, meeting: 21, quote: 30, negotiation: 21 };

export const AGREEMENTS: RecurringAgreement[] = [
  {
    id: "K-1",
    customerId: "tindefjell",
    amountMinor: 12_500_00,
    interval: "month",
    currency: "NOK",
    start: "2025-09-01",
  },
  {
    id: "K-2",
    customerId: "tindefjell",
    amountMinor: 30_000_00,
    interval: "year",
    currency: "NOK",
    start: "2026-10-01",
  },
  {
    id: "K-3",
    customerId: "nordlys",
    amountMinor: 18_000_00,
    interval: "quarter",
    currency: "NOK",
    start: "2025-01-01",
    end: "2026-09-30",
  },
  { id: "K-4", customerId: "havbris", amountMinor: 9_000_00, interval: "month", currency: "NOK", start: "2026-08-01" },
  {
    id: "K-5",
    customerId: "lysaker",
    amountMinor: 8_000_00,
    interval: "month",
    currency: "NOK",
    start: "2025-03-01",
    end: "2026-07-31",
  },
  { id: "K-6", customerId: "lysaker", amountMinor: 5_500_00, interval: "month", currency: "NOK", start: "2026-08-01" },
];

export function seedActivities(): Record<string, Activity[]> {
  return {
    "D-101": [
      {
        id: "A-1",
        kind: "meeting",
        subject: "Demo av rapportmodulen",
        at: "2026-11-04T13:00:00Z",
        by: "kari",
        evidence: "Kalender 4. nov.",
      },
      { id: "A-2", kind: "email", subject: "Sendte tilbud 2026-114", at: "2026-11-10T08:30:00Z", by: "kari" },
      {
        id: "T-1",
        kind: "task",
        subject: "Følg opp tilbudet",
        at: "2026-11-10T08:35:00Z",
        by: "kari",
        dueDate: "2026-11-20",
        assigneeId: "kari",
      },
    ],
    "D-102": [{ id: "A-1", kind: "call", subject: "Første samtale", at: "2026-09-18T10:00:00Z", by: "kari" }],
    "D-103": [
      {
        id: "A-1",
        kind: "meeting",
        subject: "Forhandlingsmøte",
        at: "2026-11-18T09:00:00Z",
        by: "ola",
        evidence: "Referat 18. nov.",
      },
    ],
    "D-104": [],
    "D-105": [{ id: "A-1", kind: "note", subject: "Signert ordre mottatt", at: "2026-11-12T10:00:00Z", by: "kari" }],
    "D-106": [],
    "D-107": [{ id: "A-1", kind: "email", subject: "Sendte tilbud 2026-121", at: "2026-11-05T09:00:00Z", by: "kari" }],
  };
}
