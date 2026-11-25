import { useLang } from "@/lib/lang";

/**
 * The launch post's diagrams, drawn in the editorial style of the diagram
 * skill: hairline boxes on paper, names in the text font, technical labels in
 * mono, connectors orthogonal and drawn before the boxes, and one focal
 * colour. Here that colour is the agent's lime (DESIGN.md): it marks what the
 * agent did, on two elements at most. Every colour is a --bk-* token, so the
 * Night theme restyles them; on a phone each scrolls inside its own frame.
 */

type Step = { name: string; detail: string };

/** One box: a paper mask, the box, a name and a mono detail. */
function Box({ x, y, w, h, step, focal }: { x: number; y: number; w: number; h: number; step: Step; focal?: boolean }) {
  return (
    <g className={focal ? "dia-box dia-box--focal" : "dia-box"}>
      <rect x={x} y={y} width={w} height={h} rx="6" className="dia-box__mask" />
      <rect x={x} y={y} width={w} height={h} rx="6" className="dia-box__frame" />
      <text x={x + 16} y={y + 28} className="dia-name">
        {step.name}
      </text>
      <text x={x + 16} y={y + 48} className="dia-detail">
        {step.detail}
      </text>
    </g>
  );
}

const ROW_W = 960;
/** Below this a diagram scrolls in its frame instead of shrinking past legibility. */
const MIN_W = 720;
const BOX_W = 196;
const BOX_H = 68;
const GAP = (ROW_W - 120 - 4 * BOX_W) / 3; // 120px for the row label

/**
 * Before and after: the same four steps of one task, on an ordinary screen and
 * on a Booki screen, each column the same moment. The agent's own mark on the
 * audit trail is the focal box.
 */
export function BeforeAfter() {
  const { t } = useLang();
  const rows: { label: string; muted: boolean; steps: Step[] }[] = [
    {
      label: t("WITHOUT", "UTEN"),
      muted: true,
      steps: [
        { name: t("Read the screen", "Les skjermen"), detail: t("screenshot per click", "skjermdump per klikk") },
        { name: t("Guess the field", "Gjett feltet"), detail: t("by label and place", "etter ledetekst og plass") },
        { name: t("Type text", "Skriv tekst"), detail: t("“3125,00” into a box", "«3125,00» i et felt") },
        { name: t("Signed-in user", "Innlogget bruker"), detail: t("audit names the person", "sporet viser personen") },
      ],
    },
    {
      label: t("WITH BOOKI", "MED BOOKI"),
      muted: false,
      steps: [
        { name: t("Snapshot", "Øyeblikksbilde"), detail: t("typed state · once", "typede data · én gang") },
        { name: t("Named action", "Navngitt handling"), detail: "setMinor(312500)" },
        { name: t("Your rule", "Regelen deres"), detail: t("allow · or a person", "allow · eller en person") },
        { name: "agent:assistant", detail: t("in the audit trail", "i revisjonssporet") },
      ],
    },
  ];
  const rowY = [32, 156];
  const colX = (i: number) => 120 + i * (BOX_W + GAP);
  return (
    <figure className="dia m-0">
      <div className="dia__frame">
        <svg
          viewBox={`0 0 ${ROW_W} 272`}
          role="img"
          aria-labelledby="dia-before-after-title dia-before-after-desc"
          style={{ minWidth: MIN_W }}
        >
          <title id="dia-before-after-title">{t("One task, two screens", "Én oppgave, to skjermbilder")}</title>
          <desc id="dia-before-after-desc">
            {t(
              "Without Booki an agent reads the screen, guesses the field, types text and is recorded as the signed-in person. With Booki it reads a typed snapshot, calls a named action, passes your rule and is recorded as itself.",
              "Uten Booki leser agenten skjermen, gjetter feltet, skriver tekst og registreres som den innloggede personen. Med Booki leser den et typet øyeblikksbilde, kaller en navngitt handling, går gjennom regelen deres og registreres som seg selv.",
            )}
          </desc>
          <defs>
            <marker id="dia-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0 0 L10 5 L0 10 z" className="dia-arrowhead" />
            </marker>
          </defs>
          {rows.map((row, r) => (
            <g key={row.label} className={row.muted ? "dia-row dia-row--muted" : "dia-row"}>
              <text x="0" y={rowY[r]! + BOX_H / 2 + 4} className="dia-eyebrow">
                {row.label}
              </text>
              {/* Connectors first, so the boxes sit on top of them. */}
              {row.steps.slice(0, -1).map((_, i) => (
                <line
                  key={i}
                  x1={colX(i) + BOX_W}
                  x2={colX(i + 1) - 4}
                  y1={rowY[r]! + BOX_H / 2}
                  y2={rowY[r]! + BOX_H / 2}
                  className="dia-line"
                  markerEnd="url(#dia-arrow)"
                />
              ))}
              {row.steps.map((step, i) => (
                <Box
                  key={step.name}
                  x={colX(i)}
                  y={rowY[r]!}
                  w={BOX_W}
                  h={BOX_H}
                  step={step}
                  focal={!row.muted && i === row.steps.length - 1}
                />
              ))}
            </g>
          ))}
          {/* The column the two rows part ways at: who the audit trail names. */}
          <line
            x1={colX(3) + BOX_W / 2}
            x2={colX(3) + BOX_W / 2}
            y1={32 + BOX_H}
            y2={156}
            className="dia-line dia-line--dashed"
          />
          {/* Beside the vertical stroke, on its left, with a gap: the right edge is the frame's. */}
          <text x={colX(3) + BOX_W / 2 - 10} y={130} textAnchor="end" className="dia-label">
            {t("WHO DID IT", "HVEM GJORDE DET")}
          </text>
        </svg>
      </div>
    </figure>
  );
}

/**
 * One agent step through a Booki screen, as a sequence: the agent reads,
 * acts, the rule answers, the audit trail records the agent, and the server
 * checks the write again. The agent's act is the focal message.
 */
export function OneStep() {
  const { t } = useLang();
  const actors = [
    { name: t("Agent", "Agent"), detail: "agent.act()" },
    { name: t("Booki control", "Booki-kontroll"), detail: "AmountField" },
    { name: t("Your rule", "Regelen deres"), detail: t("allow · person", "allow · person") },
    { name: t("Audit trail", "Revisjonsspor"), detail: "attachAudit" },
    { name: t("Your server", "Serveren deres"), detail: "@booki-aui/core/server" },
  ];
  const W = 960;
  const lane = (i: number) => 96 + i * 192;
  const head = { y: 16, h: 56, w: 160 };
  // [from, to, y, label, dashed (a return), focal]
  const messages: [number, number, number, string, boolean, boolean][] = [
    [0, 1, 120, "SNAPSHOT()", false, false],
    [1, 0, 160, t("TYPED STATE", "TYPEDE DATA"), true, false],
    [0, 1, 208, "ACT · SETMINOR", false, true],
    [1, 2, 248, t("ALLOWED?", "TILLATT?"), false, false],
    [2, 1, 288, t("YES · RULE", "JA · REGEL"), true, false],
    [1, 3, 336, "AGENT:ID", false, false],
    [1, 4, 384, "POST · GUARD()", false, false],
    [4, 1, 424, t("OK · OR 403", "OK · ELLER 403"), true, false],
  ];
  const bottom = 456;
  return (
    <figure className="dia m-0">
      <div className="dia__frame">
        <svg
          viewBox={`0 0 ${W} ${bottom + 16}`}
          role="img"
          aria-labelledby="dia-one-step-title dia-one-step-desc"
          style={{ minWidth: MIN_W }}
        >
          <title id="dia-one-step-title">{t("One step, end to end", "Ett steg, fra start til slutt")}</title>
          <desc id="dia-one-step-desc">
            {t(
              "The agent reads the control's typed state, then sets an amount; the control asks your rule, records the step as the agent's in the audit trail, and your server checks the write again, refusing a person's decision for an agent.",
              "Agenten leser kontrollens typede data og setter så et beløp; kontrollen spør regelen deres, registrerer steget som agentens i revisjonssporet, og serveren sjekker skrivingen på nytt og avviser en persons beslutning for en agent.",
            )}
          </desc>
          <defs>
            <marker
              id="dia-arrow-2"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto"
            >
              <path d="M0 0 L10 5 L0 10 z" className="dia-arrowhead" />
            </marker>
            <marker
              id="dia-arrow-focal"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto"
            >
              <path d="M0 0 L10 5 L0 10 z" className="dia-arrowhead dia-arrowhead--focal" />
            </marker>
          </defs>
          {/* Lifelines first. */}
          {actors.map((_, i) => (
            <line key={i} x1={lane(i)} x2={lane(i)} y1={head.y + head.h} y2={bottom} className="dia-lifeline" />
          ))}
          {messages.map(([from, to, y, label, dashed, focal]) => {
            const right = to > from;
            const x1 = lane(from) + (right ? 4 : -4);
            const x2 = lane(to) + (right ? -4 : 4);
            const mid = (lane(from) + lane(to)) / 2;
            const width = label.length * 7.2 + 16;
            return (
              <g key={`${from}-${to}-${y}`}>
                <line
                  x1={x1}
                  x2={x2}
                  y1={y}
                  y2={y}
                  className={`dia-line${dashed ? " dia-line--dashed" : ""}${focal ? " dia-line--focal" : ""}`}
                  markerEnd={focal ? "url(#dia-arrow-focal)" : "url(#dia-arrow-2)"}
                />
                {/* The label above its stroke, on paper, with a gap. */}
                <rect x={mid - width / 2} y={y - 24} width={width} height="16" className="dia-label-mask" />
                <text
                  x={mid}
                  y={y - 12}
                  textAnchor="middle"
                  className={focal ? "dia-label dia-label--focal" : "dia-label"}
                >
                  {label}
                </text>
              </g>
            );
          })}
          {actors.map((actor, i) => (
            <g key={actor.name} className={i === 0 ? "dia-box dia-box--focal" : "dia-box"}>
              <rect
                x={lane(i) - head.w / 2}
                y={head.y}
                width={head.w}
                height={head.h}
                rx="6"
                className="dia-box__mask"
              />
              <rect
                x={lane(i) - head.w / 2}
                y={head.y}
                width={head.w}
                height={head.h}
                rx="6"
                className="dia-box__frame"
              />
              <text x={lane(i)} y={head.y + 24} textAnchor="middle" className="dia-name">
                {actor.name}
              </text>
              <text x={lane(i)} y={head.y + 42} textAnchor="middle" className="dia-detail">
                {actor.detail}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </figure>
  );
}
