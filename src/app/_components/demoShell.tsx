import Link from "next/link";
import { withDemoContext } from "@/lib/demo";
import { DemoBankAccountSelector } from "./demoBankAccountSelector";
import { DemoCompanySelector } from "./demoCompanySelector";
import { DemoUserSelector } from "./demoUserSelector";

interface DemoShellProps {
  currentPath: string;
  currentUserId: string;
  currentCompanyId: string;
  currentBankAccountId?: string | null;
  companyName: string;
  userRoleLabel: string;
  users: Array<{
    id: string;
    name: string | null;
    role: string;
  }>;
  companies: Array<{
    id: string;
    name: string;
  }>;
  bankAccounts: Array<{
    id: string;
    bankName: string;
    accountNumberMasked: string;
  }>;
  title: string;
  description: string;
  children: React.ReactNode;
}

const navItems = [
  ["/", "Home"],
  ["/dashboard", "Dashboard"],
  ["/import", "Importação"],
  ["/transactions", "Transações"],
  ["/categorization", "Categorização"],
  ["/pending", "Pendências"],
  ["/recurrences", "Recorrências"],
  ["/projection", "Projeção"],
] as const;

export function DemoShell({
  currentPath,
  currentUserId,
  currentCompanyId,
  currentBankAccountId,
  companyName,
  userRoleLabel,
  users,
  companies,
  bankAccounts,
  title,
  description,
  children,
}: DemoShellProps) {
  return (
    <div className="app-shell">
      <div className="app-grid">
        <aside className="sidebar">
          <h1>Zelo MVP V1</h1>
          <p>Empresa demo: {companyName}</p>
          <DemoCompanySelector currentCompanyId={currentCompanyId} companies={companies} />
          {currentBankAccountId && bankAccounts.length > 0 ? (
            <DemoBankAccountSelector
              currentBankAccountId={currentBankAccountId}
              bankAccounts={bankAccounts}
            />
          ) : null}
          <DemoUserSelector currentUserId={currentUserId} users={users} />
          <p>Papel atual: {userRoleLabel}</p>
          <nav>
            {navItems.map(([path, label]) => (
              <Link
                key={path}
                className={`nav-link${currentPath === path ? " active" : ""}`}
                href={withDemoContext(path, {
                  userId: currentUserId,
                  companyId: currentCompanyId,
                  bankAccountId: currentBankAccountId,
                })}
              >
                {label}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="content">
          <header className="page-header">
            <div>
              <h2>{title}</h2>
              <p>{description}</p>
            </div>
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}
