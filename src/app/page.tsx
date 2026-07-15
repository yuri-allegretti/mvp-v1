import Link from "next/link";
import { DemoShell } from "./_components/demoShell";
import { getDemoPageData } from "./_components/demoPageData";
import { withDemoContext } from "@/lib/demo";

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { demoContext, currentUser, currentUserId, currentCompanyId, currentBankAccountId } =
    await getDemoPageData(searchParams);
  const companyName = demoContext.company?.name ?? "Empresa demo indisponível";

  return (
    <DemoShell
      currentPath="/"
      currentUserId={currentUserId}
      currentCompanyId={currentCompanyId ?? ""}
      currentBankAccountId={currentBankAccountId}
      companyName={companyName}
      userRoleLabel={currentUser?.role ?? "indefinido"}
      users={demoContext.users}
      companies={demoContext.companies}
      bankAccounts={demoContext.bankAccounts}
      title="Demo técnica clicável"
      description="Fluxo operacional do MVP V1 com empresa e usuários demo."
    >
      <section className="panel home-hero stack">
        <p>
          Esta interface demonstra o fluxo principal: importação de extrato, estruturação de
          transações, pendências, recorrências aprovadas e projeção 30/60/90.
        </p>
        <div className="actions">
          <Link
            className="button"
            href={withDemoContext("/dashboard", {
              userId: currentUserId,
              companyId: currentCompanyId,
              bankAccountId: currentBankAccountId,
            })}
          >
            Abrir dashboard
          </Link>
          <Link
            className="secondary-button"
            href={withDemoContext("/recurrences", {
              userId: currentUserId,
              companyId: currentCompanyId,
              bankAccountId: currentBankAccountId,
            })}
          >
            Revisar recorrências
          </Link>
          <Link
            className="secondary-button"
            href={withDemoContext("/projection", {
              userId: currentUserId,
              companyId: currentCompanyId,
              bankAccountId: currentBankAccountId,
            })}
          >
            Ver projeção
          </Link>
        </div>
      </section>
    </DemoShell>
  );
}
