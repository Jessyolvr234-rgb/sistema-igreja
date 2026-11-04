import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard/dashboard-shell";
import CellsManagement from "@/components/dashboard/cells-management";
import { getDashboardAccess } from "@/lib/supabase/dashboard-access";
import { createClient } from "@/lib/supabase/server";

type Props = {
  searchParams: Promise<{ status?: string | string[] }>;
};

export default async function CelulasPage({ searchParams }: Props) {
  const access = await getDashboardAccess();
  if (!access.ok) {
    redirect("/");
  }

  const params = await searchParams;
  const initialStatus = params.status === "active" ? "active" : "";
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = typeof data?.claims?.email === "string" ? data.claims.email : "";

  return (
    <DashboardShell email={email}>
      <CellsManagement role={access.access.role} initialStatus={initialStatus} />
    </DashboardShell>
  );
}
