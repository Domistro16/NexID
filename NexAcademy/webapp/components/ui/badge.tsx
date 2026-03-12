"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Class variants using CVA
const badgeVariants = cva(
  "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        beginner: "bg-success/10 text-success border border-success/20",
        intermediate: "bg-warning/10 text-warning border border-warning/20",
        advanced: "bg-destructive/10 text-destructive border border-destructive/20",
        free: "bg-primary/10 text-primary border border-primary/20",
        premium: "bg-accent-tertiary/10 text-accent-tertiary border border-accent-tertiary/20",
        default: "bg-muted text-muted-foreground border border-border",
        success: "bg-success/10 text-success border border-success/20",
        info: "bg-info/10 text-info border border-info/20",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground border border-border",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

// Props type combining variant and HTML div props
export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
