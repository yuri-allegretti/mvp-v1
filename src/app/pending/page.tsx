import { DemoShell } from "../_components/demoShell";
import { getDemoPageData } from "../_components/demoPageData";
import { listPendingItemsForDemo } from "@/modules/demo/demoReadService";

export default async function PendingPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { demoContext, currentUser, currentUserId } = await getDemoPageData(searchParams);
  const companyId = demoContext.company?.id;
  const companyName = demoContext.company?.name ?? "Empresa demo indisponível";
  const pendingItems = companyId ? await listPendingItemsForDemo({ companyId }) : [];

  return (
    <DemoShell
      currentPath="/pending"
      currentUserId={currentUserId}
      companyName={companyName}
      userRoleLabel={currentUser?.role ?? "indefinido"}
      users={demoContext.users}
      title="Pendências"
      description="Caixa operacional unificada da V1."
    >
      <section className="table-card">
        <table className="table">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Status</th>
              <th>Severidade</th>
              <th>Descrição</th>
              <th>Criada em</th>
            </tr>
          </thead>
          <tbody>
            {pendingItems.map((item) => (
              <tr key={item.id}>
                <td>{item.type}</td>
                <td>{item.status}</td>
                <td>{item.severity}</td>
                <td>{item.description}</td>
                <td>{item.createdAt.toISOString().slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </DemoShell>
  );
}
