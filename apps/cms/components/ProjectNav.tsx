"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useTheme } from "@/lib/useTheme";
import { api } from "@/lib/api";

type Props = { projectId: string };
type Project = { id: string; name: string; slug: string };

export function ProjectNav({ projectId }: Props) {
  const router   = useRouter();
  const pathname = usePathname();
  const { dark, toggle } = useTheme();
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    // トークンが確実にある状態でフェッチ
    const token = localStorage.getItem("tlog_token");
    if (!token) return;
    api.get(`/api/projects/${projectId}`)
      .then(r => setProject(r.data))
      .catch(e => console.error("ProjectNav fetch error:", e));
  }, [projectId]);

  const headerBg = dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200";
  const subtext  = dark ? "text-gray-400" : "text-gray-500";
  const divider  = dark ? "text-gray-600" : "text-gray-300";

  const navItems = [
    { label: "トレース", path: `/projects/${projectId}/traces`   },
    { label: "チケット", path: `/projects/${projectId}/issues`   },
    { label: "パターン", path: `/projects/${projectId}/patterns` },
    { label: "APIキー",  path: `/projects/${projectId}/apikeys`  },
  ];

  const isActive = (path: string) => pathname.startsWith(path);
  const projectName = project?.name ?? "...";

  return (
    <header className={`${headerBg} border-b sticky top-0 z-10`}>
      {/* 上段: パンくず + テーマ切替 */}
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-2 min-w-0">
          {/* プロジェクト一覧へ戻る */}
          <button
            onClick={() => router.push("/projects")}
            className={`${subtext} hover:text-blue-500 text-sm transition shrink-0`}
          >
            ← プロジェクト一覧
          </button>
          <span className={`${divider} text-lg font-light shrink-0`}>/</span>

          {/* プロジェクト名（表示名） */}
          <span className={`font-semibold text-sm truncate ${dark ? "text-white" : "text-gray-900"}`}>
            {projectName}
          </span>

          {/* スラッグ（URLの識別子） */}
          <span className={`
            shrink-0 text-xs font-mono px-2 py-0.5 rounded-full border
            ${dark
              ? "bg-gray-800 border-gray-700 text-gray-400"
              : "bg-gray-100 border-gray-200 text-gray-400"}
          `}>
            {projectId}
          </span>
        </div>

        {/* テーマ切替 */}
        <button
          onClick={toggle}
          className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-lg transition
            ${dark ? "bg-gray-800 hover:bg-gray-700" : "bg-gray-100 hover:bg-gray-200"}`}
        >
          {dark ? "☀️" : "🌙"}
        </button>
      </div>

      {/* 下段: タブナビ */}
      <nav className="flex gap-0 px-6 -mb-px">
        {navItems.map(item => (
          <button
            key={item.path}
            onClick={() => router.push(item.path)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              isActive(item.path)
                ? "border-blue-500 text-blue-500"
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
