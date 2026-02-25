(function loadHtml2Canvas() {
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
  document.head.appendChild(s);
})();

/* ============================================================
   TLog + 自動計装 オールインワン v2.1
   変更履歴:
     v2.0 - URLパラメータ・前画面・JS例外・Before/After スクショ等追加
     v2.1 - [修正] _capture() で featureId を POST body に含めるよう修正
            [修正] _capture() の SCREENSHOT ログ記録を削除
                   （server.js 側が正確なファイルパスで記録するため二重記録を排除）
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
   TLogAutoInstrument v2.0（変更なし）
   ============================================================ */
window.TLogAutoInstrument = window.TLogAutoInstrument || (function () {

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

            if (isAction) {
              TLog.clickWithBeforeAfterShot(
                screenId, btnId, 'BTN_CLICK:' + btnLabel,
                { elementType: 'BUTTON', buttonLabel: btnLabel, formSnapshot: snap },
                1500
              );
            } else {
              TLog.clickWithShot(
                screenId, btnId, 'BTN_CLICK:' + btnLabel,
                { elementType: 'BUTTON', buttonLabel: btnLabel, formSnapshot: snap },
                1500
              );
            }

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