// The header's tabs, left to right. Icons are Lucide's (ISC), drawn in icons.tsx. In-page tabs scroll to a section;
// route tabs navigate.

export type IconName = "layout-grid" | "workflow" | "tag" | "log-in" | "arrow-up-right";

export const TABS: readonly { icon: IconName; label: string; href: string }[] = [
  { icon: "layout-grid", label: "Overview", href: "#top" },
  { icon: "workflow", label: "How it works", href: "#how-it-works" },
  { icon: "tag", label: "Pricing", href: "/pricing" },
  { icon: "log-in", label: "Sign in", href: "/login" },
  { icon: "arrow-up-right", label: "Start trial", href: "/territory" },
];
