"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RootPage() {
  const router = useRouter();
  useEffect(() => {
    const token = localStorage.getItem("tlog_token");
    router.push(token ? "/projects" : "/login");
  }, []);
  return null;
}
