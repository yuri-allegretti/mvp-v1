"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

interface DemoUserSelectorProps {
  currentUserId: string;
  users: Array<{
    id: string;
    name: string | null;
    role: string;
  }>;
}

export function DemoUserSelector({ currentUserId, users }: DemoUserSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <label className="row">
      <span className="hint">Usuário demo</span>
      <select
        value={currentUserId}
        onChange={(event) => {
          const next = new URLSearchParams(searchParams.toString());
          next.set("userId", event.target.value);
          router.push(`${pathname}?${next.toString()}`);
        }}
      >
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {(user.name ?? user.id) + " - " + user.role}
          </option>
        ))}
      </select>
    </label>
  );
}
