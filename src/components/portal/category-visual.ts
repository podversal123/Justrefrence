import {
  Armchair,
  Briefcase,
  Building2,
  Car,
  Code,
  FireExtinguisher,
  GraduationCap,
  Headset,
  Laptop,
  Lightbulb,
  Package,
  Printer,
  ShieldCheck,
  Stethoscope,
  Sun,
  Utensils,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export interface CategoryVisual {
  icon: LucideIcon;
  /** Tailwind classes for the tinted icon tile. Written out in full so Tailwind can see them. */
  tile: string;
}

const TONES = {
  rose: "bg-rose-100 text-rose-700",
  amber: "bg-amber-100 text-amber-800",
  emerald: "bg-emerald-100 text-emerald-700",
  sky: "bg-sky-100 text-sky-700",
  violet: "bg-violet-100 text-violet-700",
  orange: "bg-orange-100 text-orange-700",
  teal: "bg-teal-100 text-teal-700",
  indigo: "bg-indigo-100 text-indigo-700",
} as const;

/** Keyword → icon + tint. First match wins; anything unknown gets a neutral package icon. */
const RULES: { test: RegExp; icon: LucideIcon; tone: keyof typeof TONES }[] = [
  { test: /furniture|chair|desk|office/i, icon: Armchair, tone: "amber" },
  { test: /computer|laptop|accessor/i, icon: Laptop, tone: "sky" },
  { test: /safety|fire/i, icon: FireExtinguisher, tone: "rose" },
  { test: /medical|health|pharma/i, icon: Stethoscope, tone: "emerald" },
  { test: /stationery|print|paper/i, icon: Printer, tone: "violet" },
  { test: /electric|light/i, icon: Lightbulb, tone: "orange" },
  { test: /security|guard/i, icon: ShieldCheck, tone: "indigo" },
  { test: /cater|house\s?keeping|food|clean/i, icon: Utensils, tone: "orange" },
  { test: /transport|vehicle|car|travel/i, icon: Car, tone: "sky" },
  { test: /\bit\b|software support|support/i, icon: Headset, tone: "violet" },
  { test: /train|consult|educat/i, icon: GraduationCap, tone: "teal" },
  { test: /civil|interior|construct|build/i, icon: Building2, tone: "amber" },
  { test: /software|develop|web/i, icon: Code, tone: "indigo" },
  { test: /install|solar|energy/i, icon: Sun, tone: "orange" },
  { test: /project/i, icon: Briefcase, tone: "teal" },
  { test: /service/i, icon: Wrench, tone: "teal" },
];

export function categoryVisual(name: string): CategoryVisual {
  const rule = RULES.find((r) => r.test.test(name));
  return rule
    ? { icon: rule.icon, tile: TONES[rule.tone] }
    : { icon: Package, tile: "bg-stone-100 text-stone-700" };
}
