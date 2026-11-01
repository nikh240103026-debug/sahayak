import type { Page } from "playwright";
import { maskValue, redactText, type PageSnapshot, type SnapshotElement } from "@app/shared";

interface RawElement extends Omit<SnapshotElement, "value"> {
  value: string | null;
  sensitive: boolean;
}

interface RawSnapshot {
  headings: string[];
  alerts: string[];
  dialogs: string[];
  elements: RawElement[];
  text: string;
}

/**
 * Role/label accessibility snapshot of the current page. Each interactive
 * element gets a data-agent-ref attribute so a validated action can target it.
 * Values of sensitive inputs are masked before the snapshot leaves this function.
 */
export async function takeSnapshot(page: Page, sensitiveSelectors: string[], errorSelector: string): Promise<PageSnapshot> {
  const raw = await page.evaluate(
    ({ sensitive, errorSel }): RawSnapshot => {
      const visible = (el: Element) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        const s = window.getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
      };
      const text = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
      const nameOf = (el: HTMLElement): string => {
        const aria = el.getAttribute("aria-label");
        if (aria) return aria.trim();
        const labelledBy = el.getAttribute("aria-labelledby");
        if (labelledBy) {
          return labelledBy
            .split(/\s+/)
            .map((id) => text(document.getElementById(id)))
            .join(" ")
            .trim();
        }
        if (el.id) {
          const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
          if (label) return text(label);
        }
        const wrap = el.closest("label");
        if (wrap) return text(wrap);
        if (el instanceof HTMLInputElement && ["submit", "button", "reset"].includes(el.type)) return el.value;
        const placeholder = el.getAttribute("placeholder");
        if (placeholder) return placeholder;
        return text(el).slice(0, 80);
      };
      const roleOf = (el: HTMLElement): string => {
        const explicit = el.getAttribute("role");
        if (explicit) return explicit;
        const tag = el.tagName.toLowerCase();
        if (tag === "a") return "link";
        if (tag === "button") return "button";
        if (tag === "select") return "combobox";
        if (tag === "textarea") return "textbox";
        if (tag === "input") {
          const t = (el as HTMLInputElement).type;
          if (t === "checkbox") return "checkbox";
          if (t === "radio") return "radio";
          if (t === "file") return "file";
          if (["submit", "button", "reset"].includes(t)) return "button";
          return "textbox";
        }
        return tag;
      };
      const isSensitive = (el: Element) =>
        (el as HTMLInputElement).type === "password" ||
        sensitive.some((sel) => {
          try {
            return el.matches(sel);
          } catch {
            return false;
          }
        });

      document.querySelectorAll("[data-agent-ref]").forEach((n) => n.removeAttribute("data-agent-ref"));
      const nodes = Array.from(
        document.querySelectorAll<HTMLElement>(
          "a[href], button, input, select, textarea, [role=button], [role=link], [role=checkbox]",
        ),
      );
      const elements: RawElement[] = [];
      let i = 0;
      for (const el of nodes) {
        const input = el as HTMLInputElement;
        if (input.type === "hidden") continue;
        if (!visible(el) && input.type !== "file") continue;
        const ref = `e${++i}`;
        el.setAttribute("data-agent-ref", ref);
        const tag = el.tagName.toLowerCase();
        const isField = tag === "input" || tag === "select" || tag === "textarea";
        elements.push({
          ref,
          role: roleOf(el),
          name: nameOf(el).slice(0, 120),
          id: el.id || null,
          tag,
          inputType: tag === "input" ? input.type : null,
          value:
            isField && input.type !== "file" && input.type !== "checkbox"
              ? tag === "select"
                ? ((el as HTMLSelectElement).selectedOptions[0]?.text ?? null)
                : input.value || null
              : input.type === "checkbox"
                ? String(input.checked)
                : null,
          options:
            tag === "select"
              ? Array.from((el as HTMLSelectElement).options)
                  .map((o) => o.text.trim())
                  .filter(Boolean)
              : undefined,
          href: tag === "a" ? (el as HTMLAnchorElement).href : null,
          disabled: (el as HTMLButtonElement).disabled === true || el.getAttribute("aria-disabled") === "true",
          inDialog: Boolean(el.closest("[role=dialog], dialog[open], [aria-modal=true]")),
          sensitive: isSensitive(el),
        });
      }
      const pick = (sel: string, max: number) =>
        Array.from(document.querySelectorAll(sel))
          .filter(visible)
          .map((n) => text(n).slice(0, max))
          .filter(Boolean);
      return {
        headings: pick("h1, h2, h3", 120).slice(0, 8),
        alerts: pick(errorSel, 400).slice(0, 5),
        dialogs: pick("[role=dialog], dialog[open], [aria-modal=true]", 600).slice(0, 3),
        elements,
        text: (document.body?.innerText ?? "").replace(/\s+/g, " ").slice(0, 4000),
      };
    },
    { sensitive: sensitiveSelectors, errorSel: errorSelector },
  );

  return {
    url: page.url(),
    title: redactText(await page.title()),
    headings: raw.headings.map(redactText),
    alerts: raw.alerts.map(redactText),
    dialogs: raw.dialogs.map(redactText),
    text: redactText(raw.text),
    elements: raw.elements.map(({ sensitive, value, ...rest }) => ({
      ...rest,
      name: redactText(rest.name),
      value: value == null ? null : sensitive ? maskValue(value) : redactText(value),
    })),
  };
}

export function refLocator(page: Page, ref: string) {
  return page.locator(`[data-agent-ref="${ref}"]`);
}
