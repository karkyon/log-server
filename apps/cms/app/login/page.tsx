"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { authApi } from "@/lib/api";
import { useTheme } from "@/lib/useTheme";

export default function LoginPage() {
  const router = useRouter();
  const { dark, toggle } = useTheme();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await authApi.login(username, password);
      localStorage.setItem("tlog_token", res.data.accessToken);
      localStorage.setItem("tlog_user", JSON.stringify(res.data.user));
      router.push("/projects");
    } catch {
      setError("ユーザー名またはパスワードが違います");
    } finally {
      setLoading(false);
    }
  };

  const bg = dark ? "bg-gray-950" : "bg-gray-50";
  const cardBg = dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200";
  const text = dark ? "text-white" : "text-gray-900";
  const subtext = dark ? "text-gray-400" : "text-gray-500";
  const inputBg = dark ? "bg-gray-800 border-gray-700 text-white placeholder-gray-500" : "bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400";

  return (
    <div className={`min-h-screen ${bg} flex items-center justify-center transition-colors`}>
      <div className="absolute top-4 right-4">
        <button
          onClick={toggle}
          className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg transition ${dark ? "bg-gray-800 hover:bg-gray-700" : "bg-white hover:bg-gray-100 border border-gray-200"}`}
        >
          {dark ? "☀️" : "🌙"}
        </button>
      </div>
      <div className={`${cardBg} border rounded-xl p-8 w-full max-w-sm shadow-lg`}>
        <div className="text-center mb-8">
          <h1 className={`text-2xl font-bold text-blue-600`}>TLog NEXT</h1>
          <p className={`${subtext} text-sm mt-1`}>ログ解析プラットフォーム</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className={`block text-sm ${subtext} mb-1`}>ユーザー名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 ${inputBg}`}
              placeholder="admin"
              required
            />
          </div>
          <div>
            <label className={`block text-sm ${subtext} mb-1`}>パスワード</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 ${inputBg}`}
              placeholder="••••••••"
              required
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg py-2 font-medium transition"
          >
            {loading ? "ログイン中..." : "ログイン"}
          </button>
        </form>
      </div>
    </div>
  );
}
