import type { PublicSide, PublicTask } from "../../../apps/www/src/lib/public-browser-run.js";

/** Audited against the published visitor pages, independent of either fixture's rendered text. */
export const publicQuestions = {
  nav: {
    prompt:
      "From the home screen, find the published processing times for Dagpenger. Open the details and report the expected processing time for a standard initial application (in weeks) and for a complaint to Nav klageinstans (in months). Decline optional cookies if prompted.",
    expected: { applicationWeeks: 6, appealBodyMonths: 4 },
  },
  posten: {
    prompt:
      "From the home screen, find the 2026 Christmas posting deadlines for a domestic Norgespakke liten (excluding Svalbard). Report the last day of December for delivery within the same North or South Norway region and for delivery between North and South Norway. Decline optional cookies if prompted.",
    expected: { sameRegionDecemberDay: 18, acrossRegionsDecemberDay: 16 },
  },
  brreg: {
    prompt:
      "From the home screen, find the guidance on submitting annual accounts. Report the last day in July for submitting complete annual accounts and the maximum late fee in NOK stated in that guidance. Leave the detailed late-fee link unopened.",
    expected: { filingJulyDay: 31, maxLateFeeNok: 69_940 },
  },
} as const satisfies Record<PublicTask, { prompt: string; expected: Record<string, number> }>;

export function answerSchema(task: PublicTask) {
  const keys = Object.keys(publicQuestions[task].expected);
  return {
    type: "object",
    properties: Object.fromEntries(keys.map((key) => [key, { type: ["integer", "null"] }])),
    required: keys,
    additionalProperties: false,
  };
}

export function verifyPublicAnswer(task: PublicTask, answer: string) {
  let decoded: Record<string, unknown> | null = null;
  try {
    decoded = JSON.parse(answer) as Record<string, unknown>;
  } catch {
    // Store the failed check and the verbatim response in the run receipt.
  }
  return Object.entries(publicQuestions[task].expected).map(([name, expected]) => {
    const actual = typeof decoded?.[name] === "number" ? decoded[name] : null;
    return { name: `answer.${name}`, actual, expected, ok: actual === expected };
  });
}

const patterns = {
  nav: {
    applicationWeeks: /(?:^|[|\n":])\s*Søknad[|"\s:-]+(\d+)\s+uker/imu,
    appealBodyMonths: /Klage til Nav klageinstans[|"\s:-]+(\d+)\s+måneder/iu,
  },
  posten: {
    sameRegionDecemberDay: /Norgespakke[^\n]{0,80}liten[^\n]{0,40}?(\d+)\. desember innen/iu,
    acrossRegionsDecemberDay: /Norgespakke[^\n]{0,80}liten[^\n]{0,140}?(\d+)\. desember fra/iu,
  },
  brreg: {
    filingJulyDay: /senest\s+(\d+)\. juli/iu,
    maxLateFeeNok: /bli\s+([\d\s]+)\s+kroner/iu,
  },
} as const;

function readSectionStrings(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(readSectionStrings);
  if (!value || typeof value !== "object") return [];
  const entry = value as Record<string, unknown>;
  if (entry.component === "public-document-section" && typeof entry.content === "string") return [entry.content];
  return Object.values(entry).flatMap(readSectionStrings);
}

/** Read the two task facts from an actual final tool reply in a scripted run. */
export function readPublicAnswer(task: PublicTask, output: string, side: PublicSide) {
  let content = output;
  if (side === "booki") {
    try {
      content = readSectionStrings(JSON.parse(output)).join("\n");
    } catch {
      content = "";
    }
  }
  if (side === "browser" && task === "nav") {
    content = content
      .split("\n")
      .map((line) => line.match(/- cell "([^"]+)"/)?.[1] ?? line)
      .join("\n");
  }
  return Object.fromEntries(
    Object.entries(patterns[task]).map(([key, pattern]) => {
      const value = content
        .normalize("NFC")
        .replace(/[\u00ad\u200b]/g, "")
        .match(pattern)?.[1];
      return [key, value === undefined ? null : Number(value.replace(/\s/g, ""))];
    }),
  );
}
