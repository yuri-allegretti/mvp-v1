"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

interface DemoBankAccountSelectorProps {
  currentBankAccountId: string;
  bankAccounts: Array<{
    id: string;
    bankName: string;
    accountNumberMasked: string;
  }>;
}

export function DemoBankAccountSelector({
  currentBankAccountId,
  bankAccounts,
}: DemoBankAccountSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <label className="row">
      <span className="hint">Conta</span>
      <select
        value={currentBankAccountId}
        onChange={(event) => {
          const next = new URLSearchParams(searchParams.toString());
          next.set("bankAccountId", event.target.value);
          router.push(`${pathname}?${next.toString()}`);
        }}
      >
        {bankAccounts.map((bankAccount) => (
          <option key={bankAccount.id} value={bankAccount.id}>
            {bankAccount.bankName} {bankAccount.accountNumberMasked}
          </option>
        ))}
      </select>
    </label>
  );
}
