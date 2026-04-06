"use client";

import { cn } from "@/lib/utils";
import { motion, HTMLMotionProps } from "framer-motion";
import React from "react";

interface GlassButtonProps extends HTMLMotionProps<"button"> {
  variant?: "default" | "primary" | "danger" | "active";
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
}

const variants = {
  default:
    "bg-[var(--bg-surface)] border border-[var(--border-glass)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-md)] hover:border-[var(--border-glass-md)]",
  primary:
    "bg-[var(--cyan)] text-[#050710] font-bold border-none hover:brightness-110",
  danger:
    "bg-[var(--danger-dim)] border border-[var(--border-danger)] text-[var(--text-danger)] hover:bg-[rgba(255,80,80,0.25)]",
  active:
    "bg-[var(--cyan-dim)] border border-[var(--border-cyan)] text-[var(--cyan)]",
};

const sizes = {
  sm: "h-9 px-3 text-[11px]",
  md: "h-10 px-5 text-xs",
  lg: "h-12 px-6 text-sm",
};

export const GlassButton = React.forwardRef<HTMLButtonElement, GlassButtonProps>(
  ({ children, variant = "default", size = "md", className, glow = false, ...props }, ref) => {
    return (
      <motion.button
        ref={ref}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        transition={{ duration: 0.12, ease: "easeOut" }}
        className={cn(
          "inline-flex items-center justify-center rounded-full font-semibold tracking-wide transition-all duration-150",
          "focus:outline-none focus:ring-2 focus:ring-[var(--cyan)] focus:ring-offset-2 focus:ring-offset-[var(--bg-void)]",
          variants[variant],
          sizes[size],
          glow && "shadow-[0_0_20px_rgba(0,229,255,0.25)]",
          className
        )}
        {...props}
      >
        {children}
      </motion.button>
    );
  }
);

GlassButton.displayName = "GlassButton";

interface IconButtonProps extends HTMLMotionProps<"button"> {
  variant?: "default" | "active" | "danger" | "primary";
  size?: "sm" | "md" | "lg" | "xl";
  children: React.ReactNode;
  className?: string;
  label?: string;
}

const iconSizes = {
  sm: "w-9 h-9",
  md: "w-11 h-11",
  lg: "w-12 h-12",
  xl: "w-[52px] h-[52px]",
};

const iconVariants = {
  default:
    "bg-[rgba(255,255,255,0.07)] border border-[var(--border-glass)] text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.12)] hover:text-white",
  active:
    "bg-[var(--cyan-dim)] border border-[var(--border-cyan)] text-[var(--cyan)]",
  danger:
    "bg-[var(--danger-dim)] border border-[var(--border-danger)] text-[var(--text-danger)]",
  primary:
    "bg-[rgba(220,50,50,0.85)] border border-[rgba(255,80,80,0.5)] text-white shadow-[0_4px_24px_rgba(220,50,50,0.4)]",
};

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ children, variant = "default", size = "md", className, label, ...props }, ref) => {
    return (
      <div className="flex flex-col items-center gap-1">
        <motion.button
          ref={ref}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          transition={{ duration: 0.12, ease: "easeOut" }}
          className={cn(
            "rounded-full flex items-center justify-center transition-all duration-150",
            "focus:outline-none focus:ring-2 focus:ring-[var(--cyan)] focus:ring-offset-2 focus:ring-offset-[var(--bg-void)]",
            iconSizes[size],
            iconVariants[variant],
            className
          )}
          {...props}
        >
          {children}
        </motion.button>
        {label && (
          <span className="text-[10px] text-[var(--text-secondary)]">{label}</span>
        )}
      </div>
    );
  }
);

IconButton.displayName = "IconButton";