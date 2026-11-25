import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { transform } from "lightningcss";

for (const file of ["booki.css", "base.css", "layered.css"]) {
  test(`${file} only sets the native color scheme on Booki elements`, () => {
    let themedRules = 0;
    transform({
      filename: file,
      code: readFileSync(new URL(`../dist/${file}`, import.meta.url)),
      visitor: {
        Rule: {
          style({ value: { selectors, declarations } }) {
            const setsColorScheme = [
              ...(declarations?.declarations ?? []),
              ...(declarations?.importantDeclarations ?? []),
            ].some(
              (declaration) =>
                declaration.property === "color-scheme" ||
                (declaration.property === "unparsed" && declaration.value.propertyId.property === "color-scheme"),
            );
            if (!setsColorScheme) return;
            themedRules += 1;

            for (const selector of selectors) {
              const [component] = selector;
              const isBookiSelector =
                selector.length === 1 &&
                ((component.type === "attribute" && component.name === "data-bk-theme") ||
                  (component.type === "pseudo-class" &&
                    component.kind === "where" &&
                    component.selectors.every(
                      ([scoped]) =>
                        scoped.type === "attribute" &&
                        (scoped.name === "data-booki" || (scoped.name === "data-slot" && scoped.operation !== null)),
                    )));
              assert.ok(isBookiSelector, `Unscoped color-scheme selector in ${file}`);
            }
          },
        },
      },
    });
    assert.ok(themedRules > 0);
  });
}
