"use client";

import type { LucideIcon } from "lucide-react";
import { BookOpen, Flame, Gem, Shield, Sparkles, Star } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  book: BookOpen,
  star: Star,
  sparkles: Sparkles,
  shield: Shield,
  gem: Gem,
  flame: Flame,
};

export default function CollectionBinderIcon({
  iconName,
  className,
}: {
  iconName: string | null | undefined;
  className?: string;
}) {
  const Icon = (iconName ? ICONS[iconName] : null) ?? BookOpen;
  return <Icon className={className} />;
}
