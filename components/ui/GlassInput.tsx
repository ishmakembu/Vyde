"use client";

import { cn } from "@/lib/utils";
import React from "react";

interface GlassInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  className?: string;
}

export const GlassInput = React.forwardRef<HTMLInputElement, GlassInputProps>(
  ({ label, error, className, ...props }, ref) => {
    return (
      <div className="space-y-1.5 w-full">
        {label && (
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] px-1">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={cn(
            "w-full bg-[var(--bg-surface)] border rounded-full h-11 px-4 transition-all duration-150",
            "text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]",
            "focus:outline-none focus:border-[var(--border-cyan)] focus:shadow-[0_0_0_3px_rgba(0,229,255,0.12)]",
            error
              ? "border-[var(--border-danger)] focus:border-[var(--text-danger)]"
              : "border-[var(--border-glass)] hover:border-[var(--border-glass-md)]",
            className
          )}
          {...props}
        />
        {error && (
          <p className="text-[11px] font-medium text-[var(--text-danger)] ml-1">
            {error}
          </p>
        )}
      </div>
    );
  }
);

GlassInput.displayName = "GlassInput";

interface GlassTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
}

export const GlassTextarea = React.forwardRef<HTMLTextAreaElement, GlassTextareaProps>(
  ({ error, className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          "w-full bg-[var(--bg-surface)] border rounded-[var(--r-lg)] p-4 transition-all duration-150",
          "text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] resize-none",
          "focus:outline-none focus:border-[var(--border-cyan)] focus:shadow-[0_0_0_3px_rgba(0,229,255,0.12)]",
          error
            ? "border-[var(--border-danger)]"
            : "border-[var(--border-glass)] hover:border-[var(--border-glass-md)]",
          className
        )}
        {...props}
      />
    );
  }
);

GlassTextarea.displayName = "GlassTextarea";