import { cva, type VariantProps } from "class-variance-authority";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ------------------------------- Button -------------------------------- */

export const buttonStyles = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-base font-semibold no-underline transition-[transform,background-color,box-shadow] duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60",
  {
    variants: {
      variant: {
        primary: "bg-primary text-on-primary shadow-soft hover:brightness-110",
        secondary: "border border-line bg-surface text-ink shadow-soft hover:bg-paper",
        ghost: "text-primary underline-offset-4 hover:underline",
        danger: "bg-danger text-white shadow-soft hover:brightness-110",
        stamp: "border-2 border-stamp bg-surface text-stamp shadow-soft hover:bg-paper",
      },
      size: { md: "", sm: "min-h-11 px-3.5 py-2 text-sm", lg: "min-h-12 px-6 text-lg" },
      full: { true: "w-full" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = ComponentProps<"button"> & VariantProps<typeof buttonStyles>;

export function Button({ className, variant, size, full, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonStyles({ variant, size, full }), className)} {...props} />;
}

/* -------------------------------- Card --------------------------------- */

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("card p-5 sm:p-6", className)} {...props} />;
}

/* ------------------------------- Fields -------------------------------- */

const inputBase =
  "block min-h-11 w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base text-ink placeholder:text-muted/80 aria-[invalid=true]:border-danger";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(inputBase, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(inputBase, "pr-8", className)} {...props} />;
}

export function Field({
  id,
  label,
  hint,
  error,
  children,
  className,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block font-semibold">
        {label}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {children}
      {error && (
        <p id={`${id}-error`} className="flex items-start gap-1.5 text-sm font-medium text-danger">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

/* ------------------------------- Notice -------------------------------- */

const noticeIcons = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: ShieldAlert };
const noticeTone = {
  info: "border-primary/30 bg-primary/5",
  success: "border-success/40 bg-success/5",
  warning: "border-accent/60 bg-accent/10",
  danger: "border-danger/40 bg-danger/5",
};

/** Status is never conveyed by colour alone: every notice has an icon and words. */
export function Notice({
  tone = "info",
  title,
  children,
  className,
  role,
}: {
  tone?: keyof typeof noticeIcons;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  role?: "status" | "alert";
}) {
  const Icon = noticeIcons[tone];
  return (
    <div role={role} className={cn("flex gap-3 rounded-xl border p-4", noticeTone[tone], className)}>
      <Icon aria-hidden className={cn("mt-0.5 size-5 shrink-0", tone === "danger" ? "text-danger" : tone === "success" ? "text-success" : tone === "warning" ? "text-ink" : "text-primary")} />
      <div className="space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-[0.95rem] leading-relaxed">{children}</div>}
      </div>
    </div>
  );
}

export function PageTitle({ eyebrow, title, intro }: { eyebrow?: ReactNode; title: ReactNode; intro?: ReactNode }) {
  return (
    <header className="mb-8 max-w-2xl space-y-2">
      {eyebrow && <p className="text-sm font-semibold tracking-wide text-primary uppercase">{eyebrow}</p>}
      <h1 className="text-3xl sm:text-4xl">{title}</h1>
      {intro && <p className="text-lg text-muted">{intro}</p>}
    </header>
  );
}
