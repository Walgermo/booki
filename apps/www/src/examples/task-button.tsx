import { Button } from "@booki-aui/react";
import { useState } from "react";

export function TaskButton({ label, totalLabel }: { label: string; totalLabel: string }) {
  const [count, setCount] = useState(0);
  return (
    <div>
      <Button onClick={() => setCount((previous) => previous + 1)}>{label}</Button>
      <p role="status">
        {totalLabel} {count}
      </p>
    </div>
  );
}
