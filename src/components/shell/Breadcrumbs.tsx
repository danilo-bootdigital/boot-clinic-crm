"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { ROUTE_LABELS } from "./nav-config";
import { useBreadcrumbLabels } from "./breadcrumb-labels";

// Id de registro na URL: uuid/hex ou cuid do Prisma (ex.: cmsqsovh7000r59fnd6qouhch).
function isRecordId(segment: string) {
  return /^[0-9a-f-]{8,}$/i.test(segment) || /^c[a-z0-9]{20,}$/.test(segment);
}

function labelFor(segment: string, dynamic: Map<string, string>) {
  const published = dynamic.get(segment);
  if (published) return published;
  if (ROUTE_LABELS[segment]) return ROUTE_LABELS[segment];
  // Nunca mostrar o código cru: enquanto a página não publica o nome, "Detalhes".
  if (isRecordId(segment)) return "Detalhes";
  return segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " ");
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const dynamicLabels = useBreadcrumbLabels();
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) return null;

  const crumbs = segments.map((seg, i) => ({
    label: labelFor(seg, dynamicLabels),
    href: "/" + segments.slice(0, i + 1).join("/"),
    last: i === segments.length - 1,
    // ids/uuids não devem virar link clicável de seção
    dynamic: isRecordId(seg),
  }));

  return (
    <nav aria-label="breadcrumb" className="flex items-center gap-1 text-sm">
      {crumbs.map((c, i) => (
        <div key={c.href} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />}
          {c.last || c.dynamic ? (
            <span className="font-medium text-foreground">{c.label}</span>
          ) : (
            <Link
              href={c.href}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {c.label}
            </Link>
          )}
        </div>
      ))}
    </nav>
  );
}
