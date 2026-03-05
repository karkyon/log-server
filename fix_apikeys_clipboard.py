#!/usr/bin/env python3
"""
apikeys/page.tsx 修正
⑥ navigator.clipboard がHTTPで動作しない問題 → execCommand フォールバック追加
"""
TARGET = "/home/karkyon/projects/log-server/apps/cms/app/projects/[id]/apikeys/page.tsx"

with open(TARGET, encoding="utf-8") as f:
    src = f.read()
orig = src

OLD6 = """  const handleCopy = () => {
    if (!newKey) return;
    navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };"""

NEW6 = """  const handleCopy = () => {
    if (!newKey) return;
    const copyText = (text: string): Promise<void> => {
      if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text);
      }
      // HTTP環境フォールバック（execCommand）
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0;pointer-events:none';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return Promise.resolve();
    };
    copyText(newKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => alert('コピーに失敗しました。手動でコピーしてください。'));
  };"""

assert src.count(OLD6) == 1, f"OLD6 出現数: {src.count(OLD6)}"
src = src.replace(OLD6, NEW6)
print("✅ ⑥ clipboard フォールバック追加")

assert src != orig
with open(TARGET, "w", encoding="utf-8") as f:
    f.write(src)
print(f"\n✅ 完了: {TARGET}")
