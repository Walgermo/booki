import { CrmApp } from "@/components/crm-app";
import { crm } from "@/lib/store";

// The records change with every write: render them fresh.
export const dynamic = "force-dynamic";

/** A Server Component reads the records and hands them to the client app. */
export default function Page() {
  return <CrmApp initial={structuredClone(crm())} />;
}
