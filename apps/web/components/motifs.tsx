"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/** A word with a hand-drawn underline that draws itself once. */
export function Underlined({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <span className="relative inline-block max-w-full">
      {children}
      <svg
        aria-hidden
        viewBox="0 0 200 14"
        preserveAspectRatio="none"
        className="pointer-events-none absolute -bottom-2 left-0 h-3 w-full text-accent"
      >
        <motion.path
          d="M3 9 C 40 3, 80 12, 120 6 S 185 5, 197 8"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.38, ease: "easeOut", delay: 0.15 }}
        />
      </svg>
    </span>
  );
}

/** Rubber-stamp mark for completed steps and receipts, with a short "thump". */
export function Stamp({ label, size = "md" }: { label: string; size?: "sm" | "md" | "lg" }) {
  const reduce = useReducedMotion();
  const dims = size === "lg" ? "px-5 py-2 text-xl" : size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm";
  return (
    <motion.span
      role="img"
      aria-label={label}
      className={`inline-flex -rotate-3 items-center rounded-lg border-[3px] border-stamp font-bold tracking-[0.15em] text-stamp uppercase ${dims}`}
      style={{ fontFamily: "var(--font-mono)" }}
      initial={reduce ? false : { scale: 1.6, opacity: 0, rotate: -12 }}
      animate={{ scale: 1, opacity: 0.92, rotate: -3 }}
      transition={{ type: "spring", stiffness: 520, damping: 22, duration: 0.3 }}
    >
      {label}
    </motion.span>
  );
}

/** Gentle pulse used while the assistant is working. */
export function ThinkingDot() {
  const reduce = useReducedMotion();
  return (
    <motion.span
      aria-hidden
      className="inline-block size-2.5 rounded-full bg-accent"
      animate={reduce ? undefined : { opacity: [0.35, 1, 0.35], scale: [0.9, 1.1, 0.9] }}
      transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

/** Slide-in wrapper for step cards. */
export function SlideIn({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
