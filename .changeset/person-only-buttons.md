---
"@booki-aui/primitives": patch
"@booki-aui/react": patch
---

An agent's press on Release or Approve in PaymentBatch, Sign off in CloseChecklist, Approve, Reject or Escalate in ApprovalChain, or Finalize in InvoiceEditor is now refused by name ("This is a person's decision …") with an `agent.person-only` audit row, instead of "nothing to press". The buttons carry `data-person-only`, which names the decision without marking the component's other agent actions the way `data-agent-confirm` on its own button would.
