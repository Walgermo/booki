import type { BlockName } from "./lazy-previews";
import { formatMoney, money } from "@booki-aui/core/money";
import { DownloadIcon, EnvelopeIcon, PencilIcon, PrinterIcon, RefreshIcon, TrashIcon } from "@booki-aui/icons/react";
import {
  AgentPresence,
  AgentProposal,
  AmountField,
  Card,
  Field,
  IconButton,
  TextLink,
  Toolbar,
  ToolbarGroup,
  ToolbarSeparator,
  useAgentProposal,
  useBookiLocale,
} from "@booki-aui/react";
import { useState, type ReactNode } from "react";

import { agent } from "@/agent";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/lang";

/**
 * Live previews for the building blocks: the general UI an app needs around
 * the accounting controls. Keyed by catalogue name, like GAP_PREVIEWS.
 */

function useMoney() {
  const { profile } = useBookiLocale();
  return (minor: number) => formatMoney(money(minor, profile.currency), { locale: profile.locale });
}

function Note({ children }: { children: ReactNode }) {
  return <p className="m-0 text-sm text-muted-foreground">{children}</p>;
}

function IconButtonPreview() {
  const { t } = useLang();
  const [log, setLog] = useState<string | null>(null);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <IconButton
          label={t("Edit line 2", "Rediger linje 2")}
          icon={<PencilIcon />}
          onClick={() => setLog(t("Editing line 2", "Redigerer linje 2"))}
        />
        <IconButton
          label={t("Refresh balances", "Oppdater saldoer")}
          icon={<RefreshIcon />}
          onClick={() => setLog(t("Balances refreshed", "Saldoene er oppdatert"))}
        />
        <IconButton
          label={t("Delete line 2", "Slett linje 2")}
          icon={<TrashIcon />}
          data-agent-confirm={t("Deleting a line needs a person", "Å slette en linje krever en person")}
          onClick={() => setLog(t("Line 2 deleted", "Linje 2 er slettet"))}
        />
        <IconButton label={t("Export CSV", "Eksporter CSV")} icon={<DownloadIcon />} showLabel />
      </div>
      <Note>{log ?? t("Hover a button for its name.", "Hold over en knapp for å se navnet.")}</Note>
    </div>
  );
}

function TextLinkPreview() {
  const { t } = useLang();
  return (
    <div className="grid gap-3">
      <p className="m-0">
        {t("Read the ", "Les ")}
        <TextLink href="/close">{t("month-end guide", "veiledningen for månedsavslutning")}</TextLink>
        {t(" before you lock the period.", " før du låser perioden.")}
      </p>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <TextLink href="/docs" icon="docs">
          {t("Documentation", "Dokumentasjon")}
        </TextLink>
        <TextLink href="https://github.com/Walgermo/booki" icon="github">
          {t("Source code", "Kildekode")}
        </TextLink>
      </div>
    </div>
  );
}

function CardPreview() {
  const { t } = useLang();
  const fmt = useMoney();
  return (
    <Card
      title={t("Open supplier invoices", "Åpne leverandørfakturaer")}
      description={t("Due within 14 days", "Forfaller innen 14 dager")}
      actions={
        <>
          <IconButton label={t("Refresh invoices", "Oppdater fakturaer")} icon={<RefreshIcon />} />
          <IconButton label={t("Export invoices", "Eksporter fakturaer")} icon={<DownloadIcon />} />
        </>
      }
      footer={
        <span>
          {t("Total", "Sum")} <strong className="font-mono font-medium tabular-nums">{fmt(4_812_500)}</strong>
        </span>
      }
    >
      <ul className="m-0 grid list-none gap-2 p-0 text-sm">
        {[
          ["Nordlys AS", 1_250_000],
          ["Brattli Entreprenør", 3_000_000],
          ["Kontorhuset", 562_500],
        ].map(([name, minor]) => (
          <li key={name} className="flex justify-between gap-4">
            <span>{name}</span>
            <span className="font-mono tabular-nums">{fmt(minor as number)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function FieldPreview() {
  const { t } = useLang();
  const [supplier, setSupplier] = useState("Nordlys AS");
  const [email, setEmail] = useState("faktura@nordlys");
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  return (
    <div className="grid max-w-sm gap-4">
      <Field label={t("Supplier name", "Leverandørnavn")} help={t("As on the invoice", "Som på fakturaen")}>
        <input value={supplier} onChange={(event) => setSupplier(event.target.value)} />
      </Field>
      <Field
        label={t("Invoice email", "E-post for faktura")}
        errorText={emailOk ? undefined : t("Enter a whole email address", "Skriv en hel e-postadresse")}
      >
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
      </Field>
      <Field label={t("Department", "Avdeling")}>
        <select defaultValue="ops">
          <option value="sales">{t("Sales", "Salg")}</option>
          <option value="ops">{t("Operations", "Drift")}</option>
        </select>
      </Field>
    </div>
  );
}

function ToolbarPreview() {
  const { t } = useLang();
  const [log, setLog] = useState<string | null>(null);
  const did = (what: string) => () => setLog(what);
  return (
    <div className="grid gap-3">
      <Toolbar label={t("Invoice actions", "Fakturahandlinger")}>
        <IconButton label={t("Edit", "Rediger")} icon={<PencilIcon />} onClick={did(t("Editing", "Redigerer"))} />
        <IconButton label={t("Print", "Skriv ut")} icon={<PrinterIcon />} onClick={did(t("Printing", "Skriver ut"))} />
        <ToolbarSeparator />
        <ToolbarGroup label={t("Send", "Send")}>
          <IconButton
            label={t("Email", "E-post")}
            icon={<EnvelopeIcon />}
            showLabel
            onClick={did(t("Emailed", "Sendt på e-post"))}
          />
          <IconButton
            label={t("Export CSV", "Eksporter CSV")}
            icon={<DownloadIcon />}
            showLabel
            onClick={did(t("Exported", "Eksportert"))}
          />
        </ToolbarGroup>
        <ToolbarSeparator />
        <IconButton
          label={t("Delete", "Slett")}
          icon={<TrashIcon />}
          data-agent-confirm={t("Deleting an invoice needs a person", "Å slette en faktura krever en person")}
          onClick={did(t("Deleted", "Slettet"))}
        />
      </Toolbar>
      <Note>
        {log ??
          t(
            "Tab into the row, then use the arrow keys, Home and End.",
            "Tab inn i raden, og bruk piltastene, Home og End.",
          )}
      </Note>
    </div>
  );
}

function AgentCursorPreview() {
  const { t } = useLang();
  const [minor, setMinor] = useState(1_250_000);
  return (
    <div className="grid max-w-sm gap-3">
      <AmountField value={minor} onValueChange={setMinor} aria-label={t("Invoice amount", "Fakturabeløp")} />
      <Note>
        {t(
          "Run the agent: its pointer glides to the amount, rings it, and the value changes.",
          "Kjør agenten: pekeren glir til beløpet, markerer det, og verdien endres.",
        )}
      </Note>
    </div>
  );
}

function AgentPresencePreview() {
  const { t } = useLang();
  const [minor, setMinor] = useState(1_250_000);
  return (
    <div className="grid max-w-sm gap-3">
      <AgentPresence agent={agent} label="Agent" />
      <AmountField value={minor} onValueChange={setMinor} aria-label={t("Invoice amount", "Fakturabeløp")} />
      <Note>
        {t(
          "Run the agent: a marker sits on the control it changes, and a screen reader hears which one.",
          "Kjør agenten: en merkelapp legger seg på kontrollen den endrer, og en skjermleser hører hvilken.",
        )}
      </Note>
    </div>
  );
}

function AgentProposalPreview() {
  const { t } = useLang();
  const fmt = useMoney();
  const label = t("Invoice amount", "Fakturabeløp");
  const [minor, setMinor] = useState(1_000_000);
  const proposal = useAgentProposal(agent);
  return (
    <div className="grid max-w-sm gap-3">
      <AmountField value={minor} onValueChange={setMinor} aria-label={label} />
      {proposal.pending ? (
        <AgentProposal
          applied={proposal.applied}
          describe={() => label}
          format={(value) => fmt(Number(value))}
          title={t("The agent proposes", "Agenten foreslår")}
          keepLabel={t("Keep", "Behold")}
          revertLabel={t("Revert", "Angre")}
          onKeep={proposal.keep}
          onRevert={() => void proposal.revert()}
        />
      ) : (
        <div className="grid justify-items-start gap-2">
          <Note>
            {t(
              `An agent read ${fmt(985_000)} off the PDF. Show its suggestion on the field:`,
              `En agent leste ${fmt(985_000)} fra PDF-en. Vis forslaget i feltet:`,
            )}
          </Note>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void proposal.propose([{ ref: label, key: "minor", value: 985_000 }])}
          >
            {t("Show the proposal", "Vis forslaget")}
          </Button>
        </div>
      )}
    </div>
  );
}

export const BLOCK_PREVIEWS: Record<BlockName, () => ReactNode> = {
  "icon-button": () => <IconButtonPreview />,
  "text-link": () => <TextLinkPreview />,
  card: () => <CardPreview />,
  field: () => <FieldPreview />,
  toolbar: () => <ToolbarPreview />,
  "agent-cursor": () => <AgentCursorPreview />,
  "agent-presence": () => <AgentPresencePreview />,
  "agent-proposal": () => <AgentProposalPreview />,
};
