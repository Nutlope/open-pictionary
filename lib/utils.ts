/**
 * The cn() helper every shipped component imports. Goes to lib/utils.ts.
 * clsx merges conditionals, tailwind-merge resolves conflicting utilities
 * so a caller's className can override a component default.
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
