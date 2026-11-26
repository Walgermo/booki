import { readFileSync } from "node:fs";
import path from "node:path";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentStatus, Spinner, type AgentStatusState } from "./agent-status.js";
import { AgentCursor, createAgentCursor } from "./agent-cursor.js";
import { createBookiAgent } from "./booki-agent.js";
import { BookiLocaleProvider } from "./locale.js";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const STATES: [AgentStatusState, string][] = [
  ["idle", "agent idle"],
  ["working", "agent working"],
  ["waiting", "waiting for a person"],
  ["done", "agent done"],
  ["refused", "refused"],
];

// Without a provider the profile is Norway's; the English cases say so.
const en = (node: ReactNode) => <BookiLocaleProvider defaultCountry="US">{node}</BookiLocaleProvider>;

const root = () => document.querySelector<HTMLElement>('[data-slot="agent-status"]')!;
const icons = () => [...document.querySelectorAll<HTMLElement>('[data-slot="agent-status-icon"]')];

describe("AgentStatus", () => {
  it.each(STATES)("shows %s in words, with the state on the element", (state, words) => {
    render(en(<AgentStatus state={state} />));
    const status = screen.getByRole("status");
    expect(status.getAttribute("data-state")).toBe(state);
    expect(status.querySelector('[data-slot="agent-status-label"]')?.textContent).toBe(words);
  });

  it("is a polite live region for people, hidden from the agent, with the icon hidden", () => {
    render(en(<AgentStatus state="working" className="mine" />));
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.hasAttribute("data-agent-hidden")).toBe(true);
    expect(status.className).toBe("mine");
    expect(status.querySelector('[data-slot="agent-status-icons"]')?.getAttribute("aria-hidden")).toBe("true");
    expect(status.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(status.textContent).toBe("agent working");
  });

  it("takes a label of its own", () => {
    render(<AgentStatus state="waiting" label="waiting for Nina" />);
    expect(screen.getByRole("status").textContent).toBe("waiting for Nina");
  });

  it("speaks Norwegian under a Norwegian locale", () => {
    render(
      <BookiLocaleProvider defaultCountry="NO">
        <AgentStatus state="waiting" />
      </BookiLocaleProvider>,
    );
    expect(screen.getByRole("status").textContent).toBe("venter på en person");
  });

  it("adds nothing to the agent's snapshot", async () => {
    const agent = createBookiAgent();
    const before = JSON.stringify(await agent.snapshot());
    render(
      <>
        {STATES.map(([state]) => (
          <AgentStatus key={state} state={state} />
        ))}
      </>,
    );
    expect(JSON.stringify(await agent.snapshot())).toBe(before);
  });

  it("plays no transition and no draw on first render, even when it starts done", () => {
    render(<AgentStatus state="done" />);
    expect(root().hasAttribute("data-changed")).toBe(false);
    expect(icons()).toHaveLength(1);
    expect(icons()[0]!.hasAttribute("data-leaving")).toBe(false);
  });

  it("marks a change, so the icons cross-fade and the check draws, then drops the old icon", () => {
    vi.useFakeTimers();
    const { rerender } = render(en(<AgentStatus state="working" />));
    rerender(en(<AgentStatus state="done" />));
    expect(root().hasAttribute("data-changed")).toBe(true);
    expect(icons().map((icon) => [icon.getAttribute("data-state"), icon.hasAttribute("data-leaving")])).toEqual([
      ["working", true],
      ["done", false],
    ]);
    expect(
      root()
        .querySelector('[data-slot="agent-status-icon"][data-state="done"] [data-slot="agent-status-badge"] path')
        ?.getAttribute("pathLength"),
    ).toBe("1");
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(icons().map((icon) => icon.getAttribute("data-state"))).toEqual(["done"]);
  });

  it("uses the live cursor's silhouette in every state, with a distinct decorative badge", () => {
    const cursor = createAgentCursor();
    render(en(<AgentCursor cursor={cursor} />));
    act(() => cursor.rest(document.body));
    const pointer = document.querySelector('[data-slot="agent-cursor-arrow"] path')?.getAttribute("d");
    expect(pointer).toBeTruthy();
    const badges = new Set<string>();
    for (const [state] of STATES) {
      const { unmount } = render(en(<AgentStatus state={state} />));
      const status = screen.getByRole("status");
      expect(status.querySelector("svg > path")?.getAttribute("d")).toBe(pointer);
      expect(status.querySelector('[data-slot="agent-cursor-ring"]')).toBeNull();
      const badge = status.querySelector('[data-slot="agent-status-badge"]');
      expect(badge?.childElementCount).toBeGreaterThan(0);
      badges.add(badge!.innerHTML);
      unmount();
    }
    expect(badges.size).toBe(STATES.length);
    act(() => cursor.setEnabled(false));
  });

  it("draws the same geometry as the icons in @booki-aui/icons", () => {
    const icon = (name: string) =>
      readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "../../icons", `${name}.svg`), "utf8");
    for (const [state] of STATES) {
      const { container, unmount } = render(<AgentStatus state={state} />);
      const drawn = icon(`agent-${state}`);
      for (const shape of container.querySelectorAll("svg path, svg circle")) {
        const geometry = shape.getAttribute("d") ?? `cx="${shape.getAttribute("cx")}" cy="${shape.getAttribute("cy")}"`;
        expect(drawn, `agent-${state}`).toContain(geometry);
      }
      unmount();
    }
    const { container } = render(<Spinner />);
    for (const shape of container.querySelectorAll("path")) expect(icon("spinner")).toContain(shape.getAttribute("d")!);
  });
});

describe("Spinner", () => {
  it("is decoration with its own slot, at an icon size", () => {
    const { container } = render(<Spinner size={20} className="busy" />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("data-slot")).toBe("spinner");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("width")).toBe("20");
    expect(svg.getAttribute("class")).toBe("busy");
  });
});
