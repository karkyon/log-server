# Patch: I-04 / I-05 修正
# ファイル: talon_testcase_logger.js
# 変更箇所: 2箇所
# バージョン: v2.3

---

## 変更①: serialized シリアライザ改善（I-04 副次改善）

### 対象箇所を検索
```
        const serialized = args.map(a => {
          if (a === null || a === undefined) return String(a);
          if (typeof a === 'string' || typeof a === 'number' || typeof a === 'boolean') return a;
          try { return JSON.parse(JSON.stringify(a)); } catch { return String(a); }
        });
```

### 置換後
```javascript
        const serialized = args.map(a => {
          if (a === null || a === undefined) return String(a);
          if (typeof a === 'string' || typeof a === 'number' || typeof a === 'boolean') return a;
          if (a instanceof Error) return a.message + (a.stack ? '\n' + a.stack.split('\n').slice(0, 4).join('\n') : '');
          if (a instanceof Element) return '<' + a.tagName.toLowerCase() + (a.id ? '#' + a.id : '') + (a.className ? '.' + String(a.className).split(' ')[0] : '') + '>';
          try {
            const seen = new WeakSet();
            return JSON.parse(JSON.stringify(a, function (key, val) {
              if (typeof val === 'object' && val !== null) {
                if (seen.has(val)) return '[Circular]';
                seen.add(val);
              }
              if (val instanceof Element) return '<' + val.tagName + '>';
              if (typeof val === 'function') return '[Function]';
              return val;
            }));
          } catch (e) {
            return String(a).slice(0, 200);
          }
        });
```

---

## 変更②: window.onerror + リソースエラー捕捉（I-04 / I-05 本体）

### 対象箇所を検索（_setupConsoleCapture関数の末尾 ― LEVELS.forEachブロックの直後）
```
        _consoleSendTimer = setTimeout(() => {
          _consoleSendTimer = null;
          _flushConsoleQueue();
        }, 100);
      };
    });
  }

  // ── 自動計装 共通設定 ─────────────────────────────────────────────────────
```

### 置換後（`  }` と `// ── 自動計装` の間に追記）
```javascript
        _consoleSendTimer = setTimeout(() => {
          _consoleSendTimer = null;
          _flushConsoleQueue();
        }, 100);
      };
    });

    // ──────────────────────────────────────────────────────────────────────────
    // [I-04] window.onerror → .console.jsonl にも記録する (v2.3追加)
    // window.onerror はすでに setupGlobalErrorHandlers() で /log に送信しているが
    // .console.jsonl（レビューツールのConsole表示用）には届いていない。
    // ここで追加的に CONSOLE_SERVER へも送信することで両方に記録する。
    // 既存ハンドラ (_prevOnerror) は apply で維持し二重登録にならないよう考慮。
    // ──────────────────────────────────────────────────────────────────────────
    (function () {
      const _prevOnerror = window.onerror;
      window.onerror = function (message, source, lineno, colno, error) {
        const entry = {
          type       : 'CONSOLE',
          featureId  : featureId,
          level      : 'error',
          args       : [
            '[JS_ERROR] ' + String(message).slice(0, 300) +
            '  (' + String(source || '').split('/').pop() + ':' + lineno + ':' + colno + ')'
          ],
          stack      : (error && error.stack)
            ? error.stack.split('\n').slice(0, 6).join(' | ')
            : '',
          lastTraceId: _lastTraceId,
          ts         : new Date().toISOString()
        };
        _consoleQueue.push(entry);
        if (!_consoleSendTimer) {
          _consoleSendTimer = setTimeout(function () {
            _consoleSendTimer = null;
            _flushConsoleQueue();
          }, 100);
        }
        if (typeof _prevOnerror === 'function') return _prevOnerror.apply(this, arguments);
        return false;
      };
    })();

    // ──────────────────────────────────────────────────────────────────────────
    // [I-05] リソース読み込みエラー捕捉 (v2.3追加)
    // window.onerror はスクリプト実行エラーのみ対象。
    // img/script/link の src/href 読み込み失敗（404等）はバブルしないため
    // addEventListener の第3引数 true (キャプチャフェーズ) で捕捉する。
    // html2canvas が生成する blob: / data: URL はノイズになるため除外。
    // ──────────────────────────────────────────────────────────────────────────
    window.addEventListener('error', function (e) {
      const t = e.target;
      // target が window 自体 = JS 実行エラー → onerror で処理済みのためスキップ
      if (!t || t === window) return;

      const src = t.src || t.href || '';
      if (src.startsWith('blob:') || src.startsWith('data:')) return; // html2canvas内部URL除外

      const entry = {
        type       : 'CONSOLE',
        featureId  : featureId,
        level      : 'error',
        args       : [
          '[RESOURCE_ERROR] 読み込み失敗: ' + String(src).slice(0, 200) +
          '  (タグ: ' + (t.tagName || '?') + ')'
        ],
        lastTraceId: _lastTraceId,
        ts         : new Date().toISOString()
      };
      _consoleQueue.push(entry);
      if (!_consoleSendTimer) {
        _consoleSendTimer = setTimeout(function () {
          _consoleSendTimer = null;
          _flushConsoleQueue();
        }, 100);
      }
    }, true); // ← capture:true が必須（バブルしないリソースエラーを捕捉するため）

  }

  // ── 自動計装 共通設定 ─────────────────────────────────────────────────────
```

---

## 変更後のバージョンコメント更新

### 対象箇所を検索
```
     v2.2 - [追加] TLogAutoInstrument に console キャプチャ機能を追加
```

### 変更後（v2.3行を追加）
```
     v2.2 - [追加] TLogAutoInstrument に console キャプチャ機能を追加
     v2.3 - [追加] window.onerror を CONSOLE_SERVER にも送信 (I-04対応)
            [追加] window.addEventListener('error', fn, true) でリソースエラーを捕捉 (I-05対応)
            [改善] serialized シリアライザを Error/Element/循環参照に対応強化
```

---

## 動作確認コマンド（サーバーで実行）

```bash
# 修正後、Chromeで意図的にエラーを発生させてから確認
grep '"level":"error"' logs/features/MC_MACHINING.console.jsonl | head -5
grep 'RESOURCE_ERROR' logs/features/*.console.jsonl
grep 'JS_ERROR' logs/features/*.console.jsonl
```

## 期待されるログ出力

```json
{"type":"CONSOLE","featureId":"MC_MACHINING","level":"error",
 "args":["[JS_ERROR] adjustFixedList4onLoadImage is not defined  (MC_MACHINING.js:42:5)"],
 "stack":"ReferenceError: ... | at resizeContents_end ...",
 "lastTraceId":"TR-...","ts":"..."}

{"type":"CONSOLE","featureId":"MC_MACHINING","level":"error",
 "args":["[RESOURCE_ERROR] 読み込み失敗: http://192.168.1.207:8080/Talon/temp/xxx.jpg  (タグ: IMG)"],
 "lastTraceId":"TR-...","ts":"..."}
```
