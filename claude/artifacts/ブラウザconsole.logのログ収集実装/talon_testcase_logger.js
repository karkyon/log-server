(function loadHtml2Canvas() {
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
  document.head.appendChild(s);
})();

/* ============================================================
   TLog + 自動計装 オールインワン v2.2
   変更履歴:
     v2.0 - URLパラメータ・前画面・JS例外・Before/After スクショ等追加
     v2.1 - [修正] _capture() で featureId を POST body に含めるよう修正
            [修正] _capture() の SCREENSHOT ログ記録を削除
                   （server.js 側が正確なファイルパスで記録するため二重記録を排除）
     v2.2 - [追加] TLogAutoInstrument に console キャプチャ機能を追加
                   console.log / warn / error / info / debug を傍受しサーバへ送信
                   100ms スロットリングによるバッチ送信で送信過多を防止
                   直近操作の traceId（_lastTraceId）を各エントリに付与して相関を実現
            [修正] ボタンクリックハンドラで clickWithBeforeAfterShot / clickWithShot の
                   戻り値（traceId）を _lastTraceId に代入するよう修正
                   （これにより console ログと操作ログの時系列照合が正確になる）
   ============================================================ */
window.TLog = window.TLog || (function () {

  const SERVER    = 'http://192.168.1.11:3099/log';
  const SS_SERVER = 'http://192.168.1.11:3099/screenshot';

  let _featureId = 'UNKNOWN';
  let _context   = {};

  function send(data) {
    const payload = Object.assign({}, data, { context: _context });
    fetch(SERVER, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify(payload)
    }).catch(() => {});
  }

  function newTrace() {
    return 'TR-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  }

  function getUrlParams() {
    try { return Object.fromEntries(new URLSearchParams(location.search)); }
    catch (e) { return {}; }
  }

  function getPageContext() {
    const h = document.querySelector('h1, h2, [class*="title"], [class*="header"]');
    return {
      documentTitle: document.title || '',
      headingText  : h ? h.textContent.trim().slice(0, 60) : ''
    };
  }

  // ── スクリーンショット処理 ──────────────────────────────────────────────────

  function takeScreenshot(traceId, screenId, trigger) {
    if (typeof html2canvas === 'undefined') {
      let retryCount = 0;
      const timer = setInterval(() => {
        retryCount++;
        if (typeof html2canvas !== 'undefined') {
          clearInterval(timer);
          _capture(traceId, screenId, trigger);
        } else if (retryCount >= 20) {
          clearInterval(timer);
        }
      }, 500);
      return;
    }
    _capture(traceId, screenId, trigger);
  }

  function _capture(traceId, screenId, trigger) {
    html2canvas(document.body, {
      scale        : 0.5,
      useCORS      : false,
      allowTaint   : false,
      logging      : false,
      imageTimeout : 0,
      ignoreElements: (el) => {
        if (el.tagName === 'SCRIPT') return true;
        if (el.tagName === 'IMG') {
          const src = el.src || '';
          if (src && !src.includes('192.168.1.207')) return true;
        }
        return false;
      }
    }).then(canvas => {
      const imageData = canvas.toDataURL('image/jpeg', 0.6);

      // v2.1修正: featureId を POST body に含める
      // → server.js が logs/screenshots/{featureId}/ に保存し JSONL に記録する
      fetch(SS_SERVER, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          featureId: _featureId,   // ← v2.1 追加
          traceId  : traceId,
          screenId : screenId,
          trigger  : trigger,
          imageData: imageData
        })
      }).catch(() => {});

      // v2.1修正: SCREENSHOT ログはserver.js側で記録するためここでは記録しない
      // （二重記録 + ファイルパス不一致の問題を解消）

    }).catch(() => {});
  }

  // ── 公開API ───────────────────────────────────────────────────────────────

  return {

    setFeature: function (featureId) {
      _featureId = featureId;
    },

    setContext: function (featureId, opts) {
      _featureId = featureId;
      _context = {
        screenMode  : (opts && opts.screenMode)  || 'unknown',
        screenTitle : (opts && opts.screenTitle) || '',
        urlParams   : getUrlParams(),
        callerScreen: sessionStorage.getItem('TLog_callerScreen') || '',
        pageContext : getPageContext()
      };
    },

    screenLoad: function (screenId, screenName) {
      const traceId = newTrace();
      send({
        type      : 'SCREEN_LOAD',
        featureId : _featureId,
        traceId   : traceId,
        screenId  : screenId,
        screenName: screenName,
        ts        : new Date().toISOString()
      });
      takeScreenshot(traceId, screenId, 'SCREEN_LOAD');
    },

    click: function (screenId, elementId, label, inputValues) {
      const traceId = newTrace();
      send({
        type       : 'UI_CLICK',
        featureId  : _featureId,
        traceId    : traceId,
        screenId   : screenId,
        elementId  : elementId,
        label      : label,
        inputValues: inputValues || {},
        ts         : new Date().toISOString()
      });
      return traceId;
    },

    clickWithShot: function (screenId, elementId, label, inputValues, delayMs) {
      const traceId = newTrace();
      send({
        type       : 'UI_CLICK',
        featureId  : _featureId,
        traceId    : traceId,
        screenId   : screenId,
        elementId  : elementId,
        label      : label,
        inputValues: inputValues || {},
        ts         : new Date().toISOString()
      });
      setTimeout(() => {
        takeScreenshot(traceId, screenId, elementId + '_AFTER');
      }, delayMs || 1500);
      return traceId;
    },

    clickWithBeforeAfterShot: function (screenId, elementId, label, inputValues, delayMs) {
      const traceId = newTrace();
      takeScreenshot(traceId, screenId, elementId + '_BEFORE');
      send({
        type       : 'UI_CLICK',
        featureId  : _featureId,
        traceId    : traceId,
        screenId   : screenId,
        elementId  : elementId,
        label      : label,
        inputValues: inputValues || {},
        ts         : new Date().toISOString()
      });
      setTimeout(() => {
        takeScreenshot(traceId, screenId, elementId + '_AFTER');
      }, delayMs || 1500);
      return traceId;
    },

    backend: function (traceId, screenId, processName, detail) {
      send({
        type       : 'BACKEND',
        featureId  : _featureId,
        traceId    : traceId,
        screenId   : screenId,
        processName: processName,
        ...detail,
        ts         : new Date().toISOString()
      });
    },

    error: function (traceId, screenId, message, detail) {
      send({
        type     : 'ERROR',
        featureId: _featureId,
        traceId  : traceId,
        screenId : screenId,
        message  : message,
        detail   : detail || {},
        ts       : new Date().toISOString()
      });
    }
  };

})();


/* ============================================================
   v2.0: JS例外・Promiseエラー 自動キャッチ
   ============================================================ */
(function setupGlobalErrorHandlers() {

  function _snap() {
    const s = {};
    document.querySelectorAll('input[type="text"],input[type="number"],textarea,select')
      .forEach(el => { if (el.id) s[el.id] = el.value; });
    return s;
  }

  window.onerror = function (message, source, lineno, colno, error) {
    const traceId = 'TR-' + Date.now() + '-auto';
    TLog.error(traceId, window._TLog_featureId || 'UNKNOWN', message, {
      source,
      lineno,
      colno,
      stack       : error && error.stack ? error.stack.slice(0, 500) : '',
      formSnapshot: _snap()
    });
    setTimeout(() => {
      if (typeof html2canvas !== 'undefined') {
        html2canvas(document.body, { scale: 0.5, useCORS: false, logging: false })
          .then(c => {
            fetch('http://192.168.1.11:3099/screenshot', {
              method : 'POST',
              headers: { 'Content-Type': 'application/json' },
              body   : JSON.stringify({
                featureId: window._TLog_featureId || 'UNKNOWN',  // v2.1追加
                traceId,
                screenId : window._TLog_featureId || 'UNKNOWN',
                trigger  : 'JS_ERROR',
                imageData: c.toDataURL('image/jpeg', 0.6)
              })
            }).catch(() => {});
          }).catch(() => {});
      }
    }, 100);
    return false;
  };

  window.addEventListener('unhandledrejection', function (e) {
    TLog.error(null, window._TLog_featureId || 'UNKNOWN',
      'UnhandledPromiseRejection: ' + (e.reason?.message || String(e.reason)).slice(0, 200),
      { formSnapshot: _snap() }
    );
  });

})();


/* ============================================================
   TLogAutoInstrument v2.2
   ============================================================ */
window.TLogAutoInstrument = window.TLogAutoInstrument || (function () {

  /* ============================================================
     console キャプチャ（v2.2追加）
     ────────────────────────────────────────────────────────────
     目的:
       ブラウザの DevTools console に出力される
       log / warn / error / info / debug を傍受してサーバへ送信する。
       機能ログ（.jsonl）・スクショとは別ファイル（.console.jsonl）に保存され
       featureId と ts、lastTraceId で時系列照合が可能。

     動作仕様:
       ① ネイティブの console 動作はそのまま維持（開発時の利便性を損なわない）
       ② args をシリアライズ（循環参照・DOM要素に対して安全に対応）
       ③ error / warn にはスタックトレースの先頭4行を付与
       ④ 100ms バッチ送信（スロットリング）で fetch 過多を防止
       ⑤ _lastTraceId に直近の操作 traceId を保持し各エントリに付与
          → ボタン操作 → console.log の流れを traceId で紐付けられる

     _lastTraceId の更新タイミング:
       ボタンクリックハンドラ内で TLog.clickWithBeforeAfterShot / clickWithShot の
       戻り値（traceId）を受け取り _lastTraceId に代入する。
       これにより「どのボタン操作の直後に出力された console か」が特定可能になる。
   ============================================================ */
  const CONSOLE_SERVER = 'http://192.168.1.11:3099/consolelog';

  // 直近のボタン操作 traceId（console ログとの相関キー）
  // ボタンクリックハンドラで更新される（後述）
  let _lastTraceId    = null;

  // 100ms バッチ送信用の内部キューとタイマー
  let _consoleSendTimer = null;
  let _consoleQueue     = [];

  /* ----------------------------------------------------------
   * キューに溜まった console ログをまとめてサーバへ送信する
   * （同一 100ms 内の複数出力を1件ずつではなく纏めて送ることで
   *   fetch 回数を削減し、ページパフォーマンスへの影響を最小化する）
   * ---------------------------------------------------------- */
  function _flushConsoleQueue() {
    if (_consoleQueue.length === 0) return;
    const batch = _consoleQueue.splice(0);   // キューをクリアしてコピーを取得
    batch.forEach(entry => {
      fetch(CONSOLE_SERVER, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify(entry)
      }).catch(() => {});
    });
  }

  /* ----------------------------------------------------------
   * console の各レベル（log/warn/error/info/debug）をラップし
   * サーバへの送信処理を追加する。
   * featureId を引数で受け取り、各エントリに埋め込む。
   * ---------------------------------------------------------- */
  function _setupConsoleCapture(featureId) {
    const LEVELS = ['log', 'warn', 'error', 'info', 'debug'];

    LEVELS.forEach(level => {
      const native = console[level].bind(console);  // ① ネイティブ関数を保持

      console[level] = function (...args) {
        native(...args);   // ① 元の console 動作はそのまま維持（DevTools に出力される）

        // ② args をシリアライズ
        //    - 文字列・数値・真偽値はそのまま
        //    - オブジェクト・配列は JSON.stringify でシリアライズ（循環参照は String() にフォールバック）
        //    - null / undefined は文字列に変換
        const serialized = args.map(a => {
          if (a === null || a === undefined) return String(a);
          if (typeof a === 'string' || typeof a === 'number' || typeof a === 'boolean') return a;
          try { return JSON.parse(JSON.stringify(a)); } catch { return String(a); }
        });

        // ③ 送信エントリ作成
        const entry = {
          type       : 'CONSOLE',
          featureId  : featureId,
          level      : level,
          args       : serialized,
          lastTraceId: _lastTraceId,   // 直近ボタン操作との紐付けキー
          ts         : new Date().toISOString()
        };

        // ③-補: error / warn にはスタックトレース先頭4行を付与して原因特定を容易にする
        if (level === 'error' || level === 'warn') {
          try {
            const err = new Error();
            entry.stack = err.stack
              ? err.stack.split('\n').slice(2, 6).join(' | ')
              : '';
          } catch (e) { /* スタック取得失敗は無視 */ }
        }

        // ④ 100ms バッチ送信（スロットリング）
        _consoleQueue.push(entry);
        if (_consoleSendTimer) return;   // 既にタイマーが走っている場合はキューに積むだけ
        _consoleSendTimer = setTimeout(() => {
          _consoleSendTimer = null;
          _flushConsoleQueue();
        }, 100);
      };
    });
  }

  // ── 自動計装 共通設定 ─────────────────────────────────────────────────────

  const IGNORE_ID_PATTERNS = [
    /^j_idt/,
    /paginator/i,
    /scroll/i,
    /^TLN_1_閲覧_/,
    /^TLN_1_編集_/
  ];
  const IGNORE_CLASS_PATTERNS = [
    /ui-paginator/,
    /ui-helper/
  ];

  function shouldIgnore(el) {
    return IGNORE_ID_PATTERNS.some(p => p.test(el.id || ''))
        || IGNORE_CLASS_PATTERNS.some(p => p.test(el.className || ''));
  }

  function getLabel(el) {
    return el.title || el.placeholder || el.name || el.id || el.tagName;
  }

  function getFormSnapshot() {
    const snap = {};
    document.querySelectorAll('input[type="text"],input[type="number"],textarea,select')
      .forEach(el => { if (el.id) snap[el.id] = el.value; });
    return snap;
  }

  function logSearchResult(screenId) {
    setTimeout(() => {
      const countMatch = document.body.innerText.match(/検索結果[：:]\s*(\d+)件/);
      const rowCount = document.querySelectorAll(
        'table tbody tr.ui-widget-content, table tbody tr[class*="ui-datatable"]'
      ).length;
      TLog.backend(null, screenId, 'SEARCH_RESULT', {
        status   : 'SUCCESS',
        rowCount : rowCount,
        countText: countMatch ? countMatch[0] : '不明',
        note     : '検索結果件数'
      });
    }, 1800);
  }

  return {

    init: function (featureId, opts) {
      const screenId = featureId;

      TLog.setContext(featureId, opts || {});
      window._TLog_featureId = featureId;

      _setupConsoleCapture(featureId);   // ★ v2.2追加: console キャプチャを有効化

      document.querySelectorAll('input[type="text"],input[type="number"],textarea')
        .forEach(el => {
          if (shouldIgnore(el)) return;
          let prev = el.value;
          el.addEventListener('change', function () {
            if (this.value === prev) return;
            TLog.click(screenId, this.id, 'INPUT_CHANGE:' + getLabel(this), {
              elementType: 'TEXTBOX',
              prevValue  : prev,
              newValue   : this.value
            });
            prev = this.value;
          });
        });

      document.querySelectorAll('select').forEach(el => {
        if (shouldIgnore(el)) return;
        el.addEventListener('change', function () {
          TLog.click(screenId, this.id, 'SELECT_CHANGE:' + getLabel(this), {
            elementType  : 'SELECT',
            selectedValue: this.value,
            selectedText : this.options[this.selectedIndex]?.text || ''
          });
        });
      });

      document.querySelectorAll('button, input[type="button"], input[type="submit"]')
        .forEach(el => {
          if (shouldIgnore(el)) return;
          el.addEventListener('click', function () {
            const btnId    = this.id;
            const btnLabel = this.value || this.textContent?.trim() || this.id;
            const snap     = getFormSnapshot();
            const isAction = /SEARCH|SAVE|UPDATE|REGIST|ISSUE|EXEC|SEND|COMMIT|CONFIRM/i
                             .test(btnId + ' ' + btnLabel);

            // v2.2修正: 戻り値（traceId）を受け取り _lastTraceId に代入する
            //   これにより「このボタン操作の後に出力された console.log」に
            //   lastTraceId としてこの traceId が付与され、操作と console が紐付く
            let traceId;
            if (isAction) {
              traceId = TLog.clickWithBeforeAfterShot(
                screenId, btnId, 'BTN_CLICK:' + btnLabel,
                { elementType: 'BUTTON', buttonLabel: btnLabel, formSnapshot: snap },
                1500
              );
            } else {
              traceId = TLog.clickWithShot(
                screenId, btnId, 'BTN_CLICK:' + btnLabel,
                { elementType: 'BUTTON', buttonLabel: btnLabel, formSnapshot: snap },
                1500
              );
            }
            _lastTraceId = traceId;   // ★ v2.2修正: 直近操作 traceId を更新

            if (btnId.includes('SEARCH')) {
              logSearchResult(screenId);
            }
          });
        });

      TLog.backend(null, screenId, 'INITIAL_SNAPSHOT', {
        status      : 'SUCCESS',
        formSnapshot: getFormSnapshot(),
        note        : '画面初期状態'
      });

      document.querySelectorAll('button, input[type="button"]').forEach(el => {
        el.addEventListener('click', function () {
          if (/閲覧|編集|BACK|CLOSE|閉じる/.test(this.textContent + this.id)) return;
          sessionStorage.setItem('TLog_callerScreen', featureId);
        });
      });
    },

    attachRowButtonLog: function (screenId, elm, label) {
      elm.addEventListener('click', function () {
        const row    = this.closest('tr');
        const cells  = row ? row.querySelectorAll('td') : [];
        const rowData = {};
        cells.forEach((td, i) => { rowData['col_' + i] = td.textContent.trim(); });

        const snap = {};
        document.querySelectorAll('input[type="text"],select')
          .forEach(el => { if (el.id) snap[el.id] = el.value; });

        TLog.clickWithShot(
          screenId, this.id, 'BTN_CLICK:' + label,
          { elementType: 'BUTTON', rowData, formSnapshot: snap },
          100
        );
        sessionStorage.setItem('TLog_callerScreen', screenId);
      });
    }
  };
})();

/* ============================================================
   画面固有コード：XXXXXXXXXXXXXX画面（MC_SCREENNAME）
   ============================================================ */

var isValid = true;
   
// 初期処理（画面サイズ調整終了時）
function resizeContents_end() {

  /* 
    既存コード
    */
  
  // ロガー初期化
  TLog.screenLoad('MC_SCREENNAME', 'XXXXXXXXXXXXXX');
  TLogAutoInstrument.init('MC_SCREENNAME', { screenMode: 'auth' });

}
