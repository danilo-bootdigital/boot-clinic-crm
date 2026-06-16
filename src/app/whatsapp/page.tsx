import Link from "next/link";
import { MessageCircle, LayoutDashboard } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionButton } from "@/components/ui/action-button";

export default function WhatsAppPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="WhatsApp"
        description="Central de comunicação e atendimento via WhatsApp"
        icon={<MessageCircle className="h-5 w-5" />}
      />
      <EmptyState
        icon={<MessageCircle className="h-6 w-6" />}
        title="Central de WhatsApp"
        description="Acompanhe métricas e conversas pelo painel dedicado enquanto a central completa é integrada."
        action={
          <Link href="/dashboard/whatsapp">
            <ActionButton icon={<LayoutDashboard />} variant="outline">
              Ver painel de WhatsApp
            </ActionButton>
          </Link>
        }
      />
    </div>
  );
}
