(function loadHtml2Canvas() {
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
  document.head.appendChild(s);
})();

/* ============================================================
   TLog + 自動計装 オールインワン v2.0
   変更履歴:
     v1.0 - 初版
     v1.1 - 閲覧・編集ボタンの二重イベント問題修正
     v1.2 - スクリーンショット機能追加
     v1.3 - 検索結果件数ログ追加
            閲覧・編集ボタンのスクリーンショットを即時撮影（100ms）に変更
     v2.0 - [新機能] URLパラメータ自動取得
            [新機能] 前画面ID（callerScreen）自動引き継ぎ
            [新機能] 画面コンテキスト（タイトル・モード）自動記録
            [新機能] JS例外・Promiseエラー自動キャッチ＋スクショ
            [新機能] init() に screenMode 引数追加
            [新機能] clickWithBeforeAfterShot() — ボタン前後スクショ
            [新機能] 全ログに context（URL・前画面・モード）を自動付与
   ============================================================ */
window.TLog = window.TLog || (function () {

  const SERVER    = 'http://192.168.1.11:3099/log';
  const SS_SERVER = 'http://192.168.1.11:3099/screenshot';

  // ── v2.0: 画面コンテキスト（init()で設定・全ログに自動付与） ──────────
  let _featureId = 'UNKNOWN';
  let _context   = {};   // { screenMode, urlParams, callerScreen, pageContext }

  // ── 内部ユーティリティ ────────────────────────────────────────────────────

  function send(data) {
    // context を全ログに自動付与
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

  /** URLのクエリパラメータを {key:value} で返す */
  function getUrlParams() {
    try {
      return Object.fromEntries(new URLSearchParams(location.search));
    } catch (e) {
      return {};
    }
  }

  /** 画面タイトルをDOMから自動取得 */
  function getPageContext() {
    const h = document.querySelector('h1, h2, [class*="title"], [class*="header"]');
    return {
      documentTitle: document.title || '',
      headingText  : h ? h.textContent.trim().slice(0, 60) : ''
    };
  }

  // ── スクリーンショット処理（v1.3から継承・変更なし） ─────────────────────

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
      fetch(SS_SERVER, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ traceId, screenId, trigger, imageData })
      }).catch(() => {});

      // スクショログをJSONLにも記録（analyze-logs.jsで紐付けに使用）
      send({
        type     : 'SCREENSHOT',
        featureId: _featureId,
        traceId  : traceId,
        screenId : screenId,
        trigger  : trigger,
        file     : 'screenshots/' + _featureId + '/' + new Date().toISOString().replace(/[:.]/g,'-') + '_' + screenId + '_' + trigger + '_' + traceId + '.jpg'
      });

    }).catch(() => {});
  }

  // ── 公開API ───────────────────────────────────────────────────────────────

  return {

    /**
     * v2.0: 機能IDをグローバルに設定（全ログのfeatureIdに反映）
     * TLogAutoInstrument.init() から呼び出す
     */
    setFeature: function (featureId) {
      _featureId = featureId;
    },

    /**
     * v2.0: 画面コンテキストをセット（init()から呼び出す）
     * @param {string} featureId
     * @param {Object} opts - { screenMode, screenTitle }
     */
    setContext: function (featureId, opts) {
      _featureId = featureId;
      _context = {
        screenMode  : (opts && opts.screenMode)   || 'unknown',
        screenTitle : (opts && opts.screenTitle)  || '',
        urlParams   : getUrlParams(),
        callerScreen: sessionStorage.getItem('TLog_callerScreen') || '',
        pageContext : getPageContext()
      };
    },

    /**
     * 画面ロード時ログ + スクリーンショット
     */
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

    /**
     * UI操作（クリック・入力）ログ送信
     */
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

    /**
     * UI操作ログ + 遅延後スクリーンショット（After のみ）
     */
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

    /**
     * v2.0 新機能: UI操作ログ + Before/After スクリーンショット
     * 重要なボタン（検索・保存・更新・発行）に使用
     * @param {number} delayMs - After 撮影の遅延（ms）
     */
    clickWithBeforeAfterShot: function (screenId, elementId, label, inputValues, delayMs) {
      const traceId = newTrace();

      // ① Before: クリック直前の状態を即撮影（0ms）
      takeScreenshot(traceId, screenId, elementId + '_BEFORE');

      // ② ログ送信
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

      // ③ After: 指定遅延後（Ajax完了後）の結果を撮影
      setTimeout(() => {
        takeScreenshot(traceId, screenId, elementId + '_AFTER');
      }, delayMs || 1500);

      return traceId;
    },

    /**
     * バックエンド処理結果ログ
     */
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

    /**
     * エラーログ（手動呼び出し用）
     */
    error: function (traceId, screenId, message, detail) {
      send({
        type    : 'ERROR',
        featureId: _featureId,
        traceId : traceId,
        screenId: screenId,
        message : message,
        detail  : detail || {},
        ts      : new Date().toISOString()
      });
    }
  };

})();


/* ============================================================
   v2.0: JS例外・Promiseエラー 自動キャッチ
   ログモジュール読み込み直後に設定 → 全画面で自動動作
   ============================================================ */
(function setupGlobalErrorHandlers() {

  /** フォームの現在値を取得（エラー発生時の入力状態を記録） */
  function _snap() {
    const s = {};
    document.querySelectorAll('input[type="text"],input[type="number"],textarea,select')
      .forEach(el => { if (el.id) s[el.id] = el.value; });
    return s;
  }

  // 同期JSエラー
  window.onerror = function (message, source, lineno, colno, error) {
    const traceId = 'TR-' + Date.now() + '-auto';
    TLog.error(traceId, window._TLog_featureId || 'UNKNOWN', message, {
      source,
      lineno,
      colno,
      stack       : error && error.stack ? error.stack.slice(0, 500) : '',
      formSnapshot: _snap()
    });
    // エラー発生時点の画面を自動撮影
    setTimeout(() => {
      if (typeof html2canvas !== 'undefined') {
        html2canvas(document.body, { scale: 0.5, useCORS: false, logging: false })
          .then(c => {
            fetch('http://192.168.1.11:3099/screenshot', {
              method : 'POST',
              headers: { 'Content-Type': 'application/json' },
              body   : JSON.stringify({
                traceId,
                screenId : window._TLog_featureId || 'UNKNOWN',
                trigger  : 'JS_ERROR',
                imageData: c.toDataURL('image/jpeg', 0.6)
              })
            }).catch(() => {});
          }).catch(() => {});
      }
    }, 100);
    return false; // ブラウザのデフォルトエラー処理も継続
  };

  // 非同期Promiseエラー
  window.addEventListener('unhandledrejection', function (e) {
    TLog.error(null, window._TLog_featureId || 'UNKNOWN',
      'UnhandledPromiseRejection: ' + (e.reason?.message || String(e.reason)).slice(0, 200),
      { formSnapshot: _snap() }
    );
  });

})();


/* ============================================================
   TLogAutoInstrument v2.0
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

    /**
     * v2.0: 画面内の全インタラクティブ要素に自動でイベントリスナーを付与
     *
     * 変更点:
     *   第2引数 opts を追加 → { screenMode, screenTitle } を渡せるように
     *   - screenMode  : 'search' / 'edit' / 'view' / 'new' / 'list' など
     *   - screenTitle : 省略可（DOMから自動取得）
     *
     * 各画面での呼び出し方:
     *   // v1.x（従来）
     *   TLogAutoInstrument.init('MC_PRODUCTS_LIST');
     *
     *   // v2.0（新）— 第2引数を追加するだけ
     *   TLogAutoInstrument.init('MC_PRODUCTS_LIST', { screenMode: 'search' });
     *
     * @param {string} featureId  - 機能ID（例: 'MC_PRODUCTS_LIST'）
     * @param {Object} [opts]     - { screenMode?: string, screenTitle?: string }
     */
    init: function (featureId, opts) {
      const screenId = featureId;

      // v2.0: コンテキストをセット（URLパラメータ・前画面・タイトルを自動収集）
      TLog.setContext(featureId, opts || {});

      // グローバルエラーハンドラ用に featureId を保持
      window._TLog_featureId = featureId;

      // ── TEXTBOX ────────────────────────────────────────────
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

      // ── SELECT ─────────────────────────────────────────────
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

      // ── BUTTON ─────────────────────────────────────────────
      // v2.0: 検索・保存・更新・発行ボタンは Before/After スクショ付き
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
              // 処理系ボタン: Before/After スクショ付き
              TLog.clickWithBeforeAfterShot(
                screenId, btnId, 'BTN_CLICK:' + btnLabel,
                { elementType: 'BUTTON', buttonLabel: btnLabel, formSnapshot: snap },
                1500
              );
            } else {
              // その他のボタン: After スクショのみ
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

      // ── 初期スナップショット ────────────────────────────────
      TLog.backend(null, screenId, 'INITIAL_SNAPSHOT', {
        status      : 'SUCCESS',
        formSnapshot: getFormSnapshot(),
        note        : '画面初期状態'
      });

      // ── v2.0: 遷移先として次の画面に「自分のID」を引き継ぐ ──
      // 遷移ボタン（行ボタン等）クリック時に sessionStorage に書き込む
      document.querySelectorAll('button, input[type="button"]').forEach(el => {
        el.addEventListener('click', function () {
          // 遷移系ボタン（閲覧・編集・戻るは除外）
          if (/閲覧|編集|BACK|CLOSE|閉じる/.test(this.textContent + this.id)) return;
          sessionStorage.setItem('TLog_callerScreen', featureId);
        });
      });
    },

    /**
     * 閲覧・編集ボタン専用ログ（v2.0: Before/After スクショ付きに統一）
     * changeButtonStyle() から各ボタンに対して呼び出す
     */
    attachRowButtonLog: function (screenId, elm, label) {
      elm.addEventListener('click', function () {
        const row    = this.closest('tr');
        const cells  = row ? row.querySelectorAll('td') : [];
        const rowData = {};
        cells.forEach((td, i) => { rowData['col_' + i] = td.textContent.trim(); });

        const snap = {};
        document.querySelectorAll('input[type="text"],select')
          .forEach(el => { if (el.id) snap[el.id] = el.value; });

        // 遷移直前のスクショ（100ms後に撮影）
        TLog.clickWithShot(
          screenId, this.id, 'BTN_CLICK:' + label,
          { elementType: 'BUTTON', rowData, formSnapshot: snap },
          100
        );

        // 次画面に「自分のID」を引き継ぐ
        sessionStorage.setItem('TLog_callerScreen', screenId);
      });
    }
  };
})();