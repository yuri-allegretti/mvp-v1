"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

interface DemoCompanySelectorProps {
  currentCompanyId: string;
  companies: Array<{
    id: string;
    name: string;
  }>;
}

export function DemoCompanySelector({ currentCompanyId, companies }: DemoCompanySelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <label className="row">
      <span className="hint">Empresa demo</span>
      <select
        value={currentCompanyId}
        onChange={(event) => {
          const next = new URLSearchParams(searchParams.toString());
          next.set("companyId", event.target.value);
          next.delete("bankAccountId");
          router.push(`${pathname}?${next.toString()}`);
        }}
      >
        {companies.map((company) => (
          <option key={company.id} value={company.id}>
            {company.name}
          </option>
        ))}
      </select>
    </label>
  );
}
