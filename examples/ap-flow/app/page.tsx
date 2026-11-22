import { ApFlow } from "@/components/ap-flow";
import { books } from "@/lib/store";

// The books change with every write: render them fresh.
export const dynamic = "force-dynamic";

/** A Server Component reads the books and hands them to the client flow. */
export default function Page() {
  return <ApFlow initial={structuredClone(books())} />;
}
