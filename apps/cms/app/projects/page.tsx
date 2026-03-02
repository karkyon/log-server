"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/useTheme";

type Project = {
  id: string; slug: string; name: string;
  description: string | null; isActive: boolean; createdAt: string;
};

export default function ProjectsPage() {
  const router = useRouter();
  const { dark, toggle } = useTheme();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ displayName: string } | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("tlog_token");
    if (!token) { router.push("/login"); return; }
    const u = localStorage.getItem("tlog_user");
    if (u) setUser(JSON.parse(u));
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await api.get("/api/projects");
      setProjects(res.data);
    } catch {} finally { setLoading(false); }
  };

  const logout = () => {
    localStorage.removeItem("tlog_token");
    localStorage.removeItem("tlog_user");
    router.push("/login");
  };

  const bg = dark ? "bg-gray-950" : "bg-gray-50";
  const headerBg = dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200";
  const text = dark ? "text-white" : "text-gray-900";
  const subtext = dark ? "text-gray-400" : "text-gray-500";
  const cardBg = dark ? "bg-gray-900 border-gray-800 hover:border-blue-600" : "bg-white border-gray-200 hover:border-blue-500";

  return (
    <div className={`min-h-screen ${bg} ${text} transition-colors`}>
      <header className={`${headerBg} border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10`}>
        <h1 className="text-lg font-bold text-blue-600">TLog NEXT</h1>
        <div className="flex items-center gap-4">
          <button
            onClick={toggle}
            className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg transition ${dark ? "bg-gray-800 hover:bg-gray-700" : "bg-gray-100 hover:bg-gray-200"}`}
            title={dark ? "ライトモードに切替" : "ダークモードに切替"}
          >
            {dark ? "☀️" : "🌙"}
          </button>
          <span className={`text-sm ${subtext}`}>{user?.displayName}</span>
          <button onClick={logout} className={`text-sm ${subtext} hover:text-red-500 transition`}>ログアウト</button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <h2 className="text-xl font-semibold mb-6">プロジェクト一覧</h2>
        {loading ? (
          <p className={subtext}>読み込み中...</p>
        ) : projects.length === 0 ? (
          <div className={`${cardBg} border rounded-xl p-8 text-center ${subtext}`}>
            プロジェクトがありません
          </div>
        ) : (
          <div className="grid gap-4">
            {projects.map((p) => (
              <div
                key={p.id}
                onClick={() => router.push(`/projects/${p.id}/traces`)}
                className={`${cardBg} border rounded-xl p-5 cursor-pointer transition`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className={`font-medium ${text}`}>{p.name}</h3>
                    <p className={`${subtext} text-sm mt-1`}>{p.slug}</p>
                    {p.description && <p className={`${subtext} text-sm mt-1`}>{p.description}</p>}
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${p.isActive ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-500"}`}>
                    {p.isActive ? "稼働中" : "停止"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
