import Link from "next/link";
import { withUserId } from "@/lib/demo";
import { DemoUserSelector } from "./demoUserSelector";

interface DemoShellProps {
  currentPath: string;
  currentUserId: string;
  companyName: string;
  userRoleLabel: string;
  users: Array<{
    id: string;
    name: string | null;
    role: string;
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
  ["/pending", "Pendências"],
  ["/recurrences", "Recorrências"],
  ["/projection", "Projeção"],
] as const;

export function DemoShell({
  currentPath,
  currentUserId,
  companyName,
  userRoleLabel,
  users,
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
          <DemoUserSelector currentUserId={currentUserId} users={users} />
          <p>Papel atual: {userRoleLabel}</p>
          <nav>
            {navItems.map(([path, label]) => (
              <Link
                key={path}
                className={`nav-link${currentPath === path ? " active" : ""}`}
                href={withUserId(path, currentUserId)}
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
