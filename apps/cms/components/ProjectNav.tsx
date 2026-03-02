"use client";
import { useRouter, usePathname } from "next/navigation";
import { useTheme } from "@/lib/useTheme";

type Props = { projectId: string };

export function ProjectNav({ projectId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { dark, toggle } = useTheme();

  const headerBg = dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200";
  const subtext   = dark ? "text-gray-400" : "text-gray-500";

  const navItems = [
    { label: "トレース",   path: `/projects/${projectId}/traces`   },
    { label: "チケット",   path: `/projects/${projectId}/issues`   },
    { label: "パターン",   path: `/projects/${projectId}/patterns` },
    { label: "APIキー",    path: `/projects/${projectId}/apikeys`  },
  ];

  const isActive = (path: string) => pathname.startsWith(path);

  return (
    <header className={`${headerBg} border-b px-6 sticky top-0 z-10`}>
      <div className="flex items-center justify-between py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/projects")}
            className={`${subtext} hover:text-blue-500 text-sm transition`}
          >
            ← プロジェクト一覧
          </button>
          <span className={subtext}>/</span>
          <span className="text-blue-600 font-bold text-sm">{projectId}</span>
        </div>
        <button
          onClick={toggle}
          className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg ${dark ? "bg-gray-800" : "bg-gray-100"}`}
        >
          {dark ? "☀️" : "🌙"}
        </button>
      </div>
      {/* サブナビ */}
      <nav className="flex gap-1 -mb-px">
        {navItems.map(item => (
          <button
            key={item.path}
            onClick={() => router.push(item.path)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              isActive(item.path)
                ? "border-blue-500 text-blue-600"
                : `border-transparent ${subtext} hover:text-blue-500`
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
