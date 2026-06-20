"use client";

import { usePathname } from "next/navigation";
import { TabsNav } from "@/components/ui/tabs";

const TABS = [
  { label: "Executivo", href: "/dashboard/executive" },
  { label: "Comercial", href: "/dashboard/commercial" },
  { label: "Agenda", href: "/dashboard/agenda" },
  { label: "WhatsApp", href: "/dashboard/whatsapp" },
  { label: "Follow-up", href: "/dashboard/followup" },
  { label: "Recepção", href: "/dashboard/reception" },
];

export function DashboardTabs() {
  const pathname = usePathname();
  const items = TABS.map((tab) => ({
    href: tab.href,
    label: tab.label,
    active: pathname === tab.href,
  }));
  return <TabsNav items={items} scrollable className="mb-6" />;
}
