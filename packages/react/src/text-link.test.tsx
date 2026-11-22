import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TextLink } from "./text-link.js";

afterEach(() => cleanup());

describe("TextLink", () => {
  it("is a plain link in the text variant", () => {
    render(<TextLink href="/docs">Docs</TextLink>);
    const link = screen.getByRole("link", { name: "Docs" });
    expect(link.getAttribute("data-slot")).toBe("text-link");
    expect(link.getAttribute("data-variant")).toBe("text");
    expect(link.getAttribute("href")).toBe("/docs");
  });

  it("puts a named icon before the label, and keeps the label as the name", () => {
    render(
      <TextLink href="https://github.com" icon="github">
        GitHub
      </TextLink>,
    );
    const link = screen.getByRole("link", { name: "GitHub" });
    expect(link.getAttribute("data-variant")).toBe("icon");
    expect(link.querySelector('[data-slot="text-link-icon"]')).not.toBeNull();
    expect(link.querySelector('[data-slot="text-link-label"]')?.textContent).toBe("GitHub");
  });

  it("gives its look to the element it wraps with asChild", () => {
    render(
      <TextLink asChild icon="docs">
        <a href="/docs" data-router="">
          Docs
        </a>
      </TextLink>,
    );
    const link = screen.getByRole("link", { name: "Docs" });
    expect(link.getAttribute("data-router")).toBe("");
    expect(link.getAttribute("data-slot")).toBe("text-link");
    expect(link.querySelector('[data-slot="text-link-label"]')?.textContent).toBe("Docs");
  });
});
