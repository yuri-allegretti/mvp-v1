import Link from "next/link";
import { DemoShell } from "./_components/demoShell";
import { getDemoPageData } from "./_components/demoPageData";
import { withUserId } from "@/lib/demo";

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { demoContext, currentUser, currentUserId } = await getDemoPageData(searchParams);
  const companyName = demoContext.company?.name ?? "Empresa demo indisponível";

  return (
    <DemoShell
      currentPath="/"
      currentUserId={currentUserId}
      companyName={companyName}
      userRoleLabel={currentUser?.role ?? "indefinido"}
      users={demoContext.users}
      title="Demo técnica clicável"
      description="Fluxo operacional do MVP V1 com empresa e usuários demo."
    >
      <section className="panel home-hero stack">
        <p>
          Esta interface demonstra o fluxo principal: importação de extrato, estruturação de
          transações, pendências, recorrências aprovadas e projeção 30/60/90.
        </p>
        <div className="actions">
          <Link className="button" href={withUserId("/dashboard", currentUserId)}>
            Abrir dashboard
          </Link>
          <Link className="secondary-button" href={withUserId("/recurrences", currentUserId)}>
            Revisar recorrências
          </Link>
          <Link className="secondary-button" href={withUserId("/projection", currentUserId)}>
            Ver projeção
          </Link>
        </div>
      </section>
    </DemoShell>
  );
}
