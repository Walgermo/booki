# Booki design — Paper and Ink

Two readers use every screen: a person and an agent. The design shows both.

- **Paper** is where people work: near-white, ink-black type, hairlines,
  small sharp radii. Calm, flat, precise, like a ledger.
- **Ink** is what the machine reads: code, snapshots, tool calls, the agent's
  log, live measurements. Deep blue-black, mono type.
- **Signal** (lime) means "an agent did this" and nothing else: the agent's
  presence label, the edge on a value it set, its button, its finished steps.

If a visitor can tell, at a glance, which parts are for them and which parts
an agent touched, the design is working.

Tokens live in one file: `packages/styles/src/booki.css`. The docs site maps
its Tailwind colours onto them in `apps/www/src/styles/globals.css`.

## The one rule

Components use `--bk-*` tokens (or the Tailwind names mapped to them). Never a
hex, `rgb()`, `oklch()` literal or a Tailwind palette colour like `bg-zinc-100`.
A literal does not follow the ink theme and breaks the single palette.

The only literals allowed are inside the token file itself, written in OKLCH.

## Colour

| Token | Tailwind | Use |
| --- | --- | --- |
| `--bk-bg` | `bg-background` | Paper: the page. |
| `--bk-card` | `bg-card` | A raised sheet: card, input, table body. |
| `--bk-muted` | `bg-muted` | A recessed area on paper. |
| `--bk-wood` | `bg-wood` | Structure only: table headers, captions, neutral tags. |
| `--bk-accent` | `bg-accent` | A selected row, a hover tint, the current step. Neutral: selection is not agent work. |
| `--bk-fg` | `text-foreground` | All primary text. |
| `--bk-muted-fg` | `text-muted-foreground` | Secondary text, labels, hints. |
| `--bk-brand` | `text-brand` | Links inside controls and data marks. Never buttons. |
| `--bk-primary` + `--bk-primary-fg` | `bg-primary` | The primary button: ink on paper. |
| `--bk-signal` + `--bk-signal-fg` | `bg-signal` / `text-signal-foreground` | The agent. A fill, with `signal-fg` text on it. |
| `--bk-signal-ink` | `text-signal-ink` | Agent text on paper (signal itself is too light to read there). |
| `--bk-signal-tint` | — | The background of an agent proposal on paper. |
| `--bk-ink`, `--bk-ink-raised`, `--bk-ink-fg`, `--bk-ink-muted`, `--bk-ink-border`, `--bk-ink-danger` | `bg-ink`, `text-ink-foreground`, `text-ink-muted` | Machine surfaces. |
| `--bk-success` / `--bk-danger` / `--bk-warning` | `text-success` / `text-destructive` / `text-warning` | Meaning only: balanced, refused, needs attention. |
| `--bk-border` / `--bk-border-strong` | `border-border` / `border-input` | Dividers / input edges. |

What surface do I use?

```
Is it something the machine reads or wrote (code, JSON, tool calls, an agent log)? → ink (.site-machine / .site-code)
Is it a live control a person can touch?                                         → .site-sheet on paper
Is it the option we recommend in a comparison?                                   → .site-pick
Anything else                                                                    → plain, on paper
```

Where does signal go?

```
Did an agent do it, or is it the agent's own control? → signal
Anything else                                         → never signal
```

Signal is not a highlight colour. A "new" badge, a hover, a chart bar for
people, a success state: none of them are signal. Green means balanced;
lime means agent. Keeping them apart is why success is a deep green at
hue 162 and signal is a yellow-lime at hue 118.

Contrast (light): `--bk-muted-fg` on paper is above 5:1, `--bk-signal-fg`
on `--bk-signal` above 9:1, `--bk-ink-muted` on ink above 5.5:1. Never put
`--bk-signal` itself as text on paper.

## Ink inside a page

`.site-machine` re-points the paper tokens at ink inside it (`--bk-bg`,
`--bk-card`, `--bk-fg`, borders), and makes `--bk-primary` the signal. So
any button inside an ink panel is the agent's button, lime, and library
controls dropped inside follow the ink look with no extra CSS.

A person's dark mode is the Night theme: `data-bk-theme="dark"` on a
wrapper. It is built from the ink palette but is still a person's surface;
ink panels inside it stay the machine's: in Night the ink tokens go one
step deeper than the page and every ink panel has a 1px ring, so it still
reads as a separate surface. There are
no per-component dark overrides, and you never write `dark:` classes.

## Shape and depth

- Radii: `--bk-radius-sm` 4px for controls and tags, `--bk-radius` 6px for
  cards and code, `--bk-radius-lg` 8px for panels. No pills (`rounded-full`).
- A rounded child inside a rounded parent uses the outer radius minus the
  padding.
- Depth on paper is `--bk-shadow-sm` (a ring and a breath) or
  `--bk-shadow-md` for overlays. On ink, depth is a ring only.
- Borders are for separation only: table rows, input edges, dividers.

## Layout

Few objects, a lot of air, sharp edges.

- A page section is `Section` (`apps/www/src/components/section.tsx`): a
  numbered header (a mono index the page counts itself, a big title, the
  note to its right on wide screens) over full-width content, with a rule
  above. Do not centre sections and do not wrap them in a card.
- A hero may sit on `.site-ledger`: faint ruled lines, like ledger paper,
  fading out. Wide screens only. One per page, in the hero, nowhere else.
- `.site-sheet` holds one live form or control. Never a sheet in a sheet.
- `.site-machine` holds machine output. `.site-code` is code on ink.
- Lists of items are `.site-rows` (`.site-rows--ink` inside ink).
- Labels are `.site-label` (sentence case). `.site-kicker` is the only
  uppercase mono text outside library tables: page kickers above a hero and
  labels on ink panels.
- `TwoReaders` (`apps/www/src/components/two-readers.tsx`) is the site's
  core figure: what the person sees on paper beside what the agent reads on
  ink, with the agent's actions inside the ink. Use it whenever a page shows
  a control and its snapshot.
- Code and other detail go behind `CodeDisclosure` / `.site-disclosure`:
  show what happens first, how it works second. No walls of code above the
  fold of a section.
- `.site-outcome` states what happened when an agent finished: a danger
  square for harm done, a signal square for the agent stopping or succeeding.
- A page may end with one `.site-band` (an ink closing panel with the next
  step). One per page, last before the footer.
- `.site-signal` is a short status from the agent ("agent running",
  "working", "idle"). Lime while working or done, outlined when idle. Only
  for the agent's state.
- No stat tiles, decorative badges, icon grids, gradients or glows.

## Type

- Text is Albert Sans (`--bk-font`). Figures, dates, codes, code and
  anything on ink is Geist Mono (`--bk-mono`) with `tabular-nums`.
- Display (hero h1): `clamp(3rem, 7.4vw, 6.5rem)`, weight 620, line-height
  0.96, tracking -0.048em. Section title: `clamp(1.875rem, 3.4vw, 3rem)`,
  weight 600, tracking -0.035em. Docs page title (`.site-page-title`):
  `clamp(2.25rem, 4.6vw, 3.5rem)`.
- Body 16px, UI 14px, caption 12px. Kickers are 12px mono, 0.08em tracking.
  Nothing below 11px.
- Never 700. Weight never changes on hover or selection.
- Inputs are 16px on touch and 14px with a mouse, so iOS does not zoom.

## Size and touch

Controls are `--bk-control-h`: 40px with a mouse, 44px on touch. A smaller
visual target (a checkbox) gets a 44px label around it.

## Buttons on the docs site

`apps/www/src/components/ui/button.tsx`. Variants: `primary`, `secondary`,
`outline`, `ghost`. Sizes: `sm`, `md`, `lg`. Nothing else exists. Inside
`.site-machine`, `primary` renders as signal: it is the agent's action.

```
Is it the single most important action in the section? → primary (one per section)
Is it one of several equal choices (a list of actions)? → outline
Is it a quiet action inside another surface (Copy, Reset)? → ghost
Default → secondary
```

```tsx
// Correct
<Button variant="outline" onClick={run}>Read the page</Button>

// Incorrect — a literal colour and a pill
<button className="rounded-full bg-[#111] text-white">Read the page</button>
```

Library controls style themselves from `data-slot`; do not restyle them with
utilities. To change how they look, override tokens on a wrapper:

```tsx
<div style={{ "--bk-radius-sm": "0", "--bk-primary": "oklch(0.35 0.08 150)" }}>
  <AmountField />
</div>
```

## Not done

No agent has been run against this document yet to see where it drifts.
