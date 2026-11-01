import { getTranslations } from "next-intl/server";
import { Check } from "lucide-react";
import { cn } from "./ui";

const KEYS = ["stepEligibility", "stepUpload", "stepConfirm", "stepReview", "stepRun"] as const;

export async function WizardSteps({ current }: { current: 0 | 1 | 2 | 3 | 4 }) {
  const t = await getTranslations("wizard");
  return (
    <nav aria-label={t("stepsLabel")} className="mb-8">
      <ol className="flex flex-wrap gap-2">
        {KEYS.map((k, i) => (
          <li
            key={k}
            aria-current={i === current ? "step" : undefined}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm",
              i === current ? "border-ink bg-ink font-semibold text-paper" : i < current ? "border-success/50 bg-success/10" : "border-line text-muted",
            )}
          >
            {i < current ? <Check aria-hidden className="size-4 text-success" /> : <span aria-hidden>{i + 1}.</span>}
            {t(k)}
          </li>
        ))}
      </ol>
    </nav>
  );
}
