/**
 * No model and no key. On every page of the chosen tasks: an untouched page
 * must fail its checks; a scripted agent then does the task through the same
 * tools a model gets there, and the page must pass; a bad call must come back
 * as a tool error. Proves the plumbing, not the model.
 */
import { callImageTokens } from "./count.js";
import { recorder, scriptFor } from "./scripted.js";
import type { BrowserTools, Session } from "./session.js";
import type { PageSpec, TaskSpec } from "./tasks.js";
import { stoppedForPerson } from "./tools.js";

export async function dryRun(options: {
  tasks: TaskSpec[];
  open: (page: PageSpec, caps?: string[]) => Promise<Session>;
  browserTools: BrowserTools;
}): Promise<boolean> {
  const { tasks, open, browserTools } = options;
  let allOk = true;
  const expect = (ok: boolean, what: string) => {
    console.log(`  ${ok ? "ok  " : "FAIL"} ${what}`);
    if (!ok) allOk = false;
  };

  for (const task of tasks) {
    for (const page of task.pages)
      for (const strategy of page.strategies ?? [{ id: "default" }]) {
        if (strategy.caps?.length && browserTools !== "mcp") continue;
        const via =
          page.tools === "bridge"
            ? "ui-sdk bridge"
            : browserTools === "mcp"
              ? "Playwright MCP"
              : "legacy browser tools";
        console.log(
          `\n[dry run] ${task.id} · ${page.path} · ${via}${strategy.id === "default" ? "" : ` · strategy ${strategy.id}`}` +
            `${strategy.caps?.length ? ` (--caps ${strategy.caps.join(",")})` : ""}`,
        );
        const session = await open(page, strategy.caps);
        try {
          console.log(`  ${session.tools.length} tools: ${session.tools.map((tool) => tool.name).join(", ")}`);
          if (session.server) console.log(`  server: ${session.server}`);
          const untouched = await page.verify(session, { answer: "" });
          expect(!untouched.ok, "an untouched page fails the checks");

          const rec = recorder(session);
          let scriptError: string | null = null;
          let answer = "";
          try {
            answer = (await scriptFor(page.id, strategy.id)!(session, rec)) ?? "";
          } catch (error) {
            scriptError = error instanceof Error ? error.message : String(error);
          }
          for (const call of rec.calls) {
            const shown = JSON.stringify(call.input);
            console.log(
              `  call ${call.tool} ${shown.length > 120 ? `${shown.slice(0, 120)}…` : shown}` +
                ` -> ${call.isError ? "ERROR " : ""}${call.output.length} chars`,
            );
          }
          expect(scriptError === null, `the scripted agent finished${scriptError ? `: ${scriptError}` : ""}`);

          const end = await page.verify(session, { answer });
          const list = Object.entries(end.checks)
            .map(([name, ok]) => `${name}=${ok ? "pass" : "fail"}`)
            .join(" ");
          if (answer) console.log(`  answer: ${answer}`);
          console.log(`  checks: ${list}`);
          if (strategy.approximate) {
            const images = rec.calls.reduce((sum, call) => sum + callImageTokens(call), 0);
            expect(images > 0, `the screenshots came back as images (${images} image tokens by the pixel rule)`);
            expect(!end.ok, "an approximate answer does not pass the exact checks");
          } else {
            expect(end.ok, "the end state passes every check");
          }
          expect(
            end.posted === page.expectPosted,
            page.expectPosted ? "the pay/post step went through" : "the pay/post step did not go through",
          );

          if (page.tools === "bridge") {
            const act = rec.calls.find((call) => call.tool === "act");
            if (!page.expectPosted && act && !page.personStep) {
              expect(!!act && stoppedForPerson(act.output), "the bridge refused the step: it needs a person");
            }
            if (page.personStep) {
              const components = JSON.parse((await session.run("snapshot", {})).content) as {
                ref: string;
                component: string;
              }[];
              const ref =
                components.find((c) => c.component === page.personStep!.component)?.ref ?? page.personStep.component;
              const tried = await session.run("act", {
                steps: [{ ref, action: page.personStep.action, args: page.personStep.args }],
              });
              expect(
                JSON.parse(tried.content)?.ok === false,
                `a person's step (${page.personStep.action}) is refused to the agent`,
              );
              const still = await page.verify(session, { answer });
              expect(
                still.ok && still.posted === page.expectPosted,
                "the end state is unchanged after the refused step",
              );
            }
            const queried = await session.run("query", { kind: "voucher-composer" });
            expect(!queried.isError && Array.isArray(JSON.parse(queried.content)), "query returns components");
            const bad = await session.run("act", { steps: [{ ref: "no-such-ref", action: "press" }] });
            expect(JSON.parse(bad.content)?.ok === false, "an act on an unknown ref is refused");
          } else {
            const bad = await session.run(
              "browser_click",
              browserTools === "mcp" ? { element: "nothing", target: "e9999" } : { ref: "e9999" },
            );
            expect(bad.isError, "a ref that is not on the page comes back as a tool error");
            const unknown = await session.run("no_such_tool", {});
            expect(unknown.isError, "an unknown tool comes back as a tool error");
          }
        } finally {
          await session.close();
        }
      }
  }

  console.log(
    `\n[dry run] ${allOk ? "Everything behaved as a real run needs." : "Something is off: see FAIL above."}` +
      " No model was called; there are no token or cost numbers.",
  );
  return allOk;
}
