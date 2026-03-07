#!/usr/bin/env python3
"""Phase 10 実装スクリプト（冪等版）"""
import os, re

BASE = os.path.expanduser("~/projects/log-server")
PATTERNS_PAGE = f"{BASE}/apps/cms/app/projects/[id]/patterns/page.tsx"
TRACES_SVC    = f"{BASE}/apps/api/src/traces/traces.service.ts"
TRACES_CTL    = f"{BASE}/apps/api/src/traces/traces.controller.ts"
TRACE_DETAIL  = f"{BASE}/apps/cms/app/projects/[id]/traces/[traceId]/page.tsx"

# ──────────────────────────────────────────────────────────────────
# ① + ② patterns/page.tsx（冪等: 適用済みならスキップ）
# ──────────────────────────────────────────────────────────────────
with open(PATTERNS_PAGE, "r") as f:
    src = f.read()

old1 = 'style={{width: patternListOpen ? 360 : 44, flexShrink: 0, transition: "width 0.2s", overflowX: "hidden", overflowY: "auto"}}'
new1 = 'style={{width: patternListOpen ? 360 : 44, minWidth: patternListOpen ? 360 : 44, flexShrink: 0, transition: "width 0.2s", overflow: "hidden", overflowY: "auto"}}'
if old1 in src:
    src = src.replace(old1, new1, 1)
    print("✅ ① 左パネル overflow修正")
else:
    print("⏭  ① 左パネル overflow修正 — 適用済みスキップ")

old2 = '''                <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-medium truncate ${text}`}>{p.name}</h3>
                      {p.screenMode && <p className={`text-xs ${subtext} mt-1 truncate`}>{p.screenMode}</p>}
                      {p.memo && <p className={`text-xs ${subtext} mt-1 line-clamp-2`}>{p.memo}</p>}
                    </div>
                    <button onClick={e => deletePattern(p.id, e)}
                      className="ml-2 flex-shrink-0 text-xs px-2 py-1 rounded bg-red-700 hover:bg-red-600 text-white font-bold"
                      title="削除">
                      🗑
                    </button>
                  </div>'''
new2 = '''                <div style={{display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:8}}>
                    <div style={{flex:1, minWidth:0}}>
                      <h3 style={{fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}} className={text}>{p.name}</h3>
                      {p.screenMode && <p className={`text-xs ${subtext} mt-1`} style={{overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{p.screenMode}</p>}
                      {p.memo && <p className={`text-xs ${subtext} mt-1`} style={{display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden"}}>{p.memo}</p>}
                    </div>
                    <button onClick={e => deletePattern(p.id, e)}
                      style={{flexShrink:0, marginLeft:4, background:"#b91c1c", color:"white", border:"none", borderRadius:6, padding:"4px 8px", fontSize:13, cursor:"pointer", lineHeight:1}}
                      title="削除">
                      🗑
                    </button>
                  </div>'''
if old2 in src:
    src = src.replace(old2, new2, 1)
    print("✅ ① カードlayout style={}化")
else:
    print("⏭  ① カードlayout — 適用済みスキップ")

old3 = '''                const psp: string | null = plog?.screenshotPath ?? null;
                const pm = psp ? psp.match(/logs[/\\\\]screenshots[/\\\\](.+)/) : null;
                const pimg = pm
                  ? "http://192.168.1.11:3099/logs-screenshots/" + pm[1].replace(/\\\\\\\\/g, "/").split("/").map(encodeURIComponent).join("/")
                  : null;'''
new3 = '''                const psp: string | null = plog?.screenshotPath ?? null;
                const pimg = (() => {
                  if (!psp) return null;
                  const pmOld = psp.match(/logs[/\\\\]screenshots[/\\\\](.+)/);
                  if (pmOld) return "http://192.168.1.11:3099/logs-screenshots/" + pmOld[1].replace(/\\\\/g, "/").split("/").map(encodeURIComponent).join("/");
                  const pmNew = psp.match(/screenshots[/\\\\]([^/\\\\]+\\.(?:png|jpg|jpeg))/i);
                  if (pmNew) return "http://192.168.1.11:3099/screenshots/" + encodeURIComponent(pmNew[1]);
                  const pmFile = psp.match(/([^/\\\\]+\\.(?:png|jpg|jpeg))$/i);
                  if (pmFile) return "http://192.168.1.11:3099/screenshots/" + encodeURIComponent(pmFile[1]);
                  return null;
                })();'''
if old3 in src:
    src = src.replace(old3, new3, 1)
    print("✅ ② PatternSerpentine スクショURL新SDK対応")
elif "pimg = (() => {" in src:
    print("⏭  ② PatternSerpentine URL — 適用済みスキップ")
else:
    print("⚠️  ② PatternSerpentine URL — 手動確認必要")

with open(PATTERNS_PAGE, "w") as f:
    f.write(src)
print("✅ patterns/page.tsx 保存完了\n")

# ──────────────────────────────────────────────────────────────────
# ③ traces.service.ts
# ──────────────────────────────────────────────────────────────────
with open(TRACES_SVC, "r") as f:
    svc = f.read()

if "async deleteSeqNo(" in svc:
    print("⏭  traces.service.ts: deleteSeqNo 適用済みスキップ")
else:
    if "import * as fs from 'fs'" not in svc and "import fs from 'fs'" not in svc:
        svc = svc.replace("import { Injectable }","import * as fs from 'fs';\nimport { Injectable }",1)
        print("✅ fs import追加")
    method = '''
  async deleteSeqNo(projectId: string, traceId: string, seqNo: number) {
    const targetLogs = await this.prisma.log.findMany({ where: { traceId, seqNo } });
    for (const log of targetLogs) {
      if (log.screenshotPath) {
        try { fs.unlinkSync(log.screenshotPath); } catch (_) {}
      }
    }
    await this.prisma.log.deleteMany({ where: { traceId, seqNo } });
    await this.prisma.consoleLog.deleteMany({ where: { traceId, seqNo } });
    const logsAfter = await this.prisma.log.findMany({
      where: { traceId, seqNo: { gt: seqNo } }, orderBy: { seqNo: 'asc' },
    });
    for (const log of logsAfter) {
      await this.prisma.log.update({ where: { id: log.id }, data: { seqNo: (log.seqNo ?? 0) - 1 } });
    }
    const clsAfter = await this.prisma.consoleLog.findMany({ where: { traceId, seqNo: { gt: seqNo } } });
    for (const cl of clsAfter) {
      await this.prisma.consoleLog.update({ where: { id: cl.id }, data: { seqNo: (cl.seqNo ?? 0) - 1 } });
    }
    const patterns = await this.prisma.pattern.findMany({ where: { projectId } });
    for (const pattern of patterns) {
      const sd = pattern.seqData as any;
      if (!sd?.seqs || !Array.isArray(sd.seqs)) continue;
      const newSeqs = sd.seqs
        .filter((s: any) => (s.seqNo ?? s.seq ?? 0) !== seqNo)
        .map((s: any) => {
          const sno = s.seqNo ?? s.seq ?? 0;
          return sno > seqNo ? { ...s, seqNo: sno - 1, seq: sno - 1 } : s;
        });
      await this.prisma.pattern.update({ where: { id: pattern.id }, data: { seqData: { ...sd, seqs: newSeqs } } });
    }
    return { ok: true, deletedSeqNo: seqNo, renumbered: logsAfter.length };
  }

'''
    assert "  async deleteTrace(" in svc, "NG: deleteTrace が見つかりません"
    svc = svc.replace("  async deleteTrace(", method + "  async deleteTrace(", 1)
    with open(TRACES_SVC, "w") as f:
        f.write(svc)
    print("✅ ③ traces.service.ts deleteSeqNo追加\n")

# ──────────────────────────────────────────────────────────────────
# ③ traces.controller.ts
# ──────────────────────────────────────────────────────────────────
with open(TRACES_CTL, "r") as f:
    ctl = f.read()

if "deleteSeqNo(" in ctl:
    print("⏭  traces.controller.ts: deleteSeqNo 適用済みスキップ")
else:
    new_ep = '''
  @Delete('traces/:traceId/logs/seq/:seqNo')
  @UseGuards(JwtAuthGuard)
  async deleteSeqNo(
    @Param('id') id: string,
    @Param('traceId') traceId: string,
    @Param('seqNo') seqNo: string,
  ) {
    return this.traces.deleteSeqNo(id, traceId, parseInt(seqNo, 10));
  }

'''
    # 実際のcontrollerのDelete定義に合わせる
    target = "  @Delete('traces/:traceId')"
    assert target in ctl, f"NG: '{target}' が見つかりません\n実際の内容:\n" + "\n".join(l for l in ctl.splitlines() if 'Delete' in l or 'delete' in l)
    ctl = ctl.replace(target, new_ep + target, 1)
    with open(TRACES_CTL, "w") as f:
        f.write(ctl)
    print("✅ ③ traces.controller.ts DELETE /traces/:traceId/logs/seq/:seqNo 追加\n")

# ──────────────────────────────────────────────────────────────────
# ③ CMS: ActionReviewDetail に削除ボタン追加
# ──────────────────────────────────────────────────────────────────
with open(TRACE_DETAIL, "r") as f:
    cms = f.read()

old_props = '''function ActionReviewDetail({ log, seqNo, dark, traceId, projectId, onVerdictSaved }: {
  log: LogEntry; seqNo: number; dark: boolean; traceId: string; projectId: string;
  onVerdictSaved?: (logId: string, verdict: LogEntry["verdict"]) => void
})'''
new_props = '''function ActionReviewDetail({ log, seqNo, dark, traceId, projectId, onVerdictSaved, onDeleteSeqNo }: {
  log: LogEntry; seqNo: number; dark: boolean; traceId: string; projectId: string;
  onVerdictSaved?: (logId: string, verdict: LogEntry["verdict"]) => void;
  onDeleteSeqNo?: () => void;
})'''
if old_props in cms:
    cms = cms.replace(old_props, new_props, 1)
    print("✅ ③ ActionReviewDetail props に onDeleteSeqNo 追加")
elif "onDeleteSeqNo" in cms:
    print("⏭  ActionReviewDetail props — 適用済みスキップ")
else:
    print("⚠️  ActionReviewDetail props — 対象が見つかりません")

old_header = '''      <div className={`flex items-baseline gap-6 px-5 py-3 border-b ${dark ? "bg-slate-900 border-slate-700" : "bg-slate-50 border-slate-200"}`}>
        <div>
          <span className={`text-[10px] font-bold ${sub} mr-2`}>SEQNO</span>
          <span className="text-lg font-bold">{seqNo}</span>
        </div>
        <div className="text-sm font-semibold flex-1">{summary}</div>
        <div className={`text-[10px] font-mono ${sub}`}>{new Date(log.timestamp).toLocaleString("ja-JP")}</div>
      </div>'''
new_header = '''      <div className={`flex items-center gap-6 px-5 py-3 border-b ${dark ? "bg-slate-900 border-slate-700" : "bg-slate-50 border-slate-200"}`}>
        <div>
          <span className={`text-[10px] font-bold ${sub} mr-2`}>SEQNO</span>
          <span className="text-lg font-bold">{seqNo}</span>
        </div>
        <div className="text-sm font-semibold flex-1">{summary}</div>
        <div className={`text-[10px] font-mono ${sub}`}>{new Date(log.timestamp).toLocaleString("ja-JP")}</div>
        {onDeleteSeqNo && (
          <button onClick={onDeleteSeqNo}
            title={`seqNo ${(log as any).seqNo ?? seqNo} を削除`}
            style={{flexShrink:0,background:"#7f1d1d",color:"white",border:"none",borderRadius:6,padding:"4px 10px",fontSize:12,cursor:"pointer",lineHeight:1.4,opacity:0.85}}
            onMouseEnter={e=>(e.currentTarget.style.opacity="1")}
            onMouseLeave={e=>(e.currentTarget.style.opacity="0.85")}>
            🗑 削除
          </button>
        )}
      </div>'''
if old_header in cms:
    cms = cms.replace(old_header, new_header, 1)
    print("✅ ③ SEQNOヘッダーに削除ボタン追加")
elif 'onDeleteSeqNo &&' in cms:
    print("⏭  SEQNOヘッダー削除ボタン — 適用済みスキップ")
else:
    print("⚠️  SEQNOヘッダー — 対象が見つかりません")

old_call = '''              <ActionReviewDetail
                log={selectedLog}
                seqNo={logs.indexOf(selectedLog) + 1}
                dark={dark}
                traceId={traceId}
                projectId={projectId}
                onVerdictSaved={(logId, verdictData) => {
                  setLogs(prev => prev.map(l => l.id === logId ? { ...l, verdict: verdictData } : l));
                }}
              />'''
new_call = '''              <ActionReviewDetail
                log={selectedLog}
                seqNo={logs.indexOf(selectedLog) + 1}
                dark={dark}
                traceId={traceId}
                projectId={projectId}
                onVerdictSaved={(logId, verdictData) => {
                  setLogs(prev => prev.map(l => l.id === logId ? { ...l, verdict: verdictData } : l));
                }}
                onDeleteSeqNo={async () => {
                  const sno = (selectedLog as any).seqNo;
                  if (sno == null) { alert("seqNoが不明です"); return; }
                  if (!confirm(`seqNo ${sno} を削除しますか？\\n以降のseqNoは自動でRenumberingされます。`)) return;
                  try {
                    await api.delete(`/api/projects/${projectId}/traces/${traceId}/logs/seq/${sno}`);
                    setSelectedLog(null);
                    const res = await api.get(`/api/projects/${projectId}/traces/${traceId}/logs`);
                    setLogs(res.data);
                  } catch (e: any) {
                    alert("削除失敗: " + (e?.response?.data?.message || e.message));
                  }
                }}
              />'''
if old_call in cms:
    cms = cms.replace(old_call, new_call, 1)
    print("✅ ③ ActionReviewDetail 呼び出しに onDeleteSeqNo 追加")
elif 'onDeleteSeqNo={async' in cms:
    print("⏭  ActionReviewDetail 呼び出し — 適用済みスキップ")
else:
    print("⚠️  ActionReviewDetail 呼び出し — 対象が見つかりません")

with open(TRACE_DETAIL, "w") as f:
    f.write(cms)
print("✅ traces/[traceId]/page.tsx 保存完了\n")

print("=" * 60)
print("✅ Phase 10 全修正完了！")
print("=" * 60)
print()
print("次のコマンドでビルド・再起動してください:")
print("  cd ~/projects/log-server")
print("  npm run build --workspace=apps/api 2>&1 | tail -20")
print("  npm run build --workspace=apps/cms 2>&1 | tail -20")
print("  pm2 restart all")
