import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getDashboardAccess } from "@/lib/supabase/dashboard-access";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const result = await getDashboardAccess();
  if (!result.ok) {
    redirect(result.status === 401 ? "/entrar" : "/acesso-pendente");
  }

  return children;
}
