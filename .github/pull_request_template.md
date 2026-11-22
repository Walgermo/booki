## What changes

<!-- What can a person or an agent do now that they could not before? -->

## How I checked it

<!-- Tests added, the control tried in the docs site, the agent's snapshot. -->

## Checklist

- [ ] `pnpm check` passes
- [ ] A changeset (`pnpm changeset`) for every package change, with the line the release notes need
- [ ] Framework packages regenerated (`pnpm generate:frameworks`) if primitives or React changed
- [ ] New sentences in both `messages-en.ts` and `messages-nb.ts`
- [ ] A new agent action has an ergonomics probe, and the contract is updated on purpose
- [ ] Approving, signing off, releasing and confirming stay a person's (`personOnly`)
- [ ] Styles use `--bk-*` tokens only
