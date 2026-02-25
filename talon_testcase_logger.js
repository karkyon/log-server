(function loadHtml2Canvas() {
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
  document.head.appendChild(s);
})();

/* ============================================================
   TLog + 自動計装 オールインワン v1.4
   変更履歴:
     v1.0 - 初版
     v1.1 - 閲覧・編集ボタンの二重イベント問題修正
     v1.2 - スクリーンショット機能追加
     v1.3 - 検索結果件数ログ追加
            閲覧・編集ボタンのスクリーンショットを即時撮影（100ms）に変更
     v1.4 - 機能名（featureId）別ログ・スクショ分類対応
            TLogAutoInstrument.init(featureId) でTLog全体に機能名を設定
            全ログ・スクショリクエストに featureId を自動付与
   ============================================================ */
window.TLog = window.TLog || (function () {

  const SERVER    = 'http://192.168.1.11:3099/log';
  const SS_SERVER = 'http://192.168.1.11:3099/screenshot';

  // ── 機能名（TLogAutoInstrument.init() から設定される） ──
  let _featureId = 'UNKNOWN';

  /**
   * 機能名を設定する（TLogAutoInstrument.init() から呼び出す）
   * @param {string} featureId - 機能名（例: 'MC_PRODUCTS_LIST'）
   */
  function setFeature(featureId) {
    _featureId = featureId || 'UNKNOWN';
  }

  /**
   * ログをサーバへ送信する
   * featureId を自動付与して送る
   * @param {Object} data - 送信データ
   */
  function send(data) {
    fetch(SERVER, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ featureId: _featureId, ...data })
    }).catch(() => {});
  }

  /**
   * トレースIDを生成する
   * @returns {string} トレースID
   */
  function newTrace() {
    return 'TR-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  }

  /**
   * スクリーンショット撮影・サーバ送信
   * html2canvasが未ロードの場合は500ms間隔で最大20回（10秒）リトライする
   * → 初期表示時に loadHtml2Canvas() の非同期ロードが間に合わない問題を解消
   * @param {string} traceId  - トレースID（ログとの紐付け用）
   * @param {string} screenId - 画面ID
   * @param {string} trigger  - 撮影トリガー（イベント名・ボタンIDなど）
   */
  function takeScreenshot(traceId, screenId, trigger) {

    if (typeof html2canvas === 'undefined') {
      let retryCount = 0;
      const maxRetry      = 20;
      const retryInterval = 500;

      const timer = setInterval(() => {
        retryCount++;
        if (typeof html2canvas !== 'undefined') {
          clearInterval(timer);
          _capture(traceId, screenId, trigger);
        } else if (retryCount >= maxRetry) {
          clearInterval(timer);
        }
      }, retryInterval);

      return;
    }

    _capture(traceId, screenId, trigger);
  }

  /**
   * html2canvasによる実際のキャプチャ処理
   * featureId をサーバへ渡すことでスクショの保存先を機能名別ディレクトリに振り分ける
   * @param {string} traceId  - トレースID
   * @param {string} screenId - 画面ID
   * @param {string} trigger  - 撮影トリガー
   */
  function _capture(traceId, screenId, trigger) {
    html2canvas(document.body, {
      scale       : 0.5,
      useCORS     : false,
      allowTaint  : false,
      logging     : false,
      imageTimeout: 0,
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
        body   : JSON.stringify({
          featureId: _featureId,   // ★ 機能名を付与
          traceId  : traceId,
          screenId : screenId,
          trigger  : trigger,
          imageData: imageData
        })
      }).catch(() => {});

    }).catch(() => {});
  }

  return {

    /**
     * 機能名設定（外部公開）
     * TLogAutoInstrument.init() から呼び出される
     */
    setFeature: setFeature,

    /**
     * 画面ロード時のログ送信 + スクリーンショット撮影
     * @param {string} screenId   - 画面ID
     * @param {string} screenName - 画面名
     */
    screenLoad: function (screenId, screenName) {
      const traceId = newTrace();
      send({
        type      : 'SCREEN_LOAD',
        traceId   : traceId,
        screenId  : screenId,
        screenName: screenName,
        ts        : new Date().toISOString()
      });
      takeScreenshot(traceId, screenId, 'SCREEN_LOAD');
    },

    /**
     * UI操作（クリック・入力）のログ送信
     * @param {string} screenId    - 画面ID
     * @param {string} elementId   - 操作した要素のID
     * @param {string} label       - 操作ラベル
     * @param {Object} inputValues - 入力値・付随情報
     * @returns {string} traceId
     */
    click: function (screenId, elementId, label, inputValues) {
      const traceId = newTrace();
      send({
        type       : 'UI_CLICK',
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
     * UI操作ログ送信 + 指定遅延後にスクリーンショット撮影
     * @param {string} screenId    - 画面ID
     * @param {string} elementId   - 操作した要素のID
     * @param {string} label       - 操作ラベル
     * @param {Object} inputValues - 入力値・付随情報
     * @param {number} delayMs     - スクリーンショット撮影までの遅延（ms）
     * @returns {string} traceId
     */
    clickWithShot: function (screenId, elementId, label, inputValues, delayMs) {
      const traceId = newTrace();
      send({
        type       : 'UI_CLICK',
        traceId    : traceId,
        screenId   : screenId,
        elementId  : elementId,
        label      : label,
        inputValues: inputValues || {},
        ts         : new Date().toISOString()
      });
      setTimeout(() => {
        takeScreenshot(traceId, screenId, elementId);
      }, delayMs || 1500);
      return traceId;
    },

    /**
     * バックエンド処理結果のログ送信
     * @param {string|null} traceId     - トレースID（null可）
     * @param {string}      screenId    - 画面ID
     * @param {string}      processName - 処理名
     * @param {Object}      detail      - 詳細情報
     */
    backend: function (traceId, screenId, processName, detail) {
      send({
        type       : 'BACKEND',
        traceId    : traceId,
        screenId   : screenId,
        processName: processName,
        ...detail,
        ts         : new Date().toISOString()
      });
    },

    /**
     * エラーのログ送信
     * @param {string|null} traceId  - トレースID（null可）
     * @param {string}      screenId - 画面ID
     * @param {string}      message  - エラーメッセージ
     * @param {Object}      detail   - 詳細情報
     */
    error: function (traceId, screenId, message, detail) {
      send({
        type    : 'ERROR',
        traceId : traceId,
        screenId: screenId,
        message : message,
        detail  : detail || {},
        ts      : new Date().toISOString()
      });
    }
  };
})();


window.TLogAutoInstrument = window.TLogAutoInstrument || (function () {

  // 自動計装の除外対象IDパターン
  const IGNORE_ID_PATTERNS = [
    /^j_idt/,        // JSF内部コンポーネント
    /paginator/i,    // ページネーション
    /scroll/i,       // スクロール関連
    /^TLN_1_閲覧_/,  // 閲覧ボタン（changeButtonStyle()側で個別処理）
    /^TLN_1_編集_/   // 編集ボタン（changeButtonStyle()側で個別処理）
  ];

  // 自動計装の除外対象クラスパターン
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
    document.querySelectorAll('input[type="text"], input[type="number"], textarea, select')
      .forEach(el => {
        if (el.id) snap[el.id] = el.value;
      });
    return snap;
  }

  /**
   * Ajax完了後に検索結果件数をログ記録
   * @param {string} screenId - 画面ID
   */
  function logSearchResult(screenId) {
    setTimeout(() => {
      // PrimeFacesのデータテーブル件数を取得（環境に応じて調整）
      const countEl = document.querySelector('.ui-paginator-current, .search-result-count');
      const count   = countEl ? countEl.textContent.trim() : '取得不可';
      TLog.backend(null, screenId, 'SEARCH_RESULT', {
        status     : 'SUCCESS',
        resultCount: count,
        note       : '検索結果件数'
      });
    }, 1500);
  }

  return {

    /**
     * 自動計装の初期化
     * ★ TLog.setFeature(featureId) を先に呼び出して機能名を全体に設定する
     * 　 その後 screenLoad・各要素への計装を実施
     * @param {string} featureId - 機能名（例: 'MC_PRODUCTS_LIST'）
     */
    init: function (featureId) {
      const screenId = featureId;

      // ★ TLog 全体に機能名を設定（ログ・スクショの保存先振り分けに使用）
      TLog.setFeature(featureId);

      // ── INPUT TEXT：入力完了（フォーカスアウト）をログ ──
      document.querySelectorAll('input[type="text"], input[type="number"], textarea')
        .forEach(el => {
          if (shouldIgnore(el)) return;

          el.addEventListener('change', function () {
            TLog.click(
              screenId,
              this.id,
              'INPUT_CHANGE:' + getLabel(this),
              {
                elementType: 'INPUT',
                newValue   : this.value
              }
            );
          });
        });

      // ── SELECT：選択変更をログ ──
      document.querySelectorAll('select')
        .forEach(el => {
          if (shouldIgnore(el)) return;

          el.addEventListener('change', function () {
            TLog.click(
              screenId,
              this.id,
              'SELECT_CHANGE:' + getLabel(this),
              {
                elementType  : 'SELECT',
                selectedValue: this.value,
                selectedText : this.options[this.selectedIndex]?.text || ''
              }
            );
          });
        });

      // ── BUTTON：クリックをログ（閲覧・編集ボタンは除外済み）──
      document.querySelectorAll('button, input[type="button"], input[type="submit"]')
        .forEach(el => {
          if (shouldIgnore(el)) return;

          el.addEventListener('click', function () {
            const btnId = this.id;

            TLog.clickWithShot(
              screenId,
              btnId,
              'BTN_CLICK:' + getLabel(this),
              {
                elementType : 'BUTTON',
                buttonLabel : this.value || this.textContent?.trim() || this.id,
                formSnapshot: getFormSnapshot()
              },
              1500
            );

            // 検索ボタンのみ：Ajax完了後に検索結果件数を追加記録
            if (btnId.includes('SEARCH')) {
              logSearchResult(screenId);
            }
          });
        });

      // ── 初期スナップショット：画面表示直後の全入力値を記録 ──
      TLog.backend(null, screenId, 'INITIAL_SNAPSHOT', {
        status      : 'SUCCESS',
        formSnapshot: getFormSnapshot(),
        note        : '画面初期状態'
      });
    },

    /**
     * 閲覧・編集ボタン専用ログ登録
     * @param {string}  screenId - 画面ID
     * @param {Element} elm      - 対象ボタン要素
     * @param {string}  label    - ボタンラベル（'閲覧' or '編集'）
     */
    attachRowButtonLog: function (screenId, elm, label) {
      elm.addEventListener('click', function () {

        const row     = this.closest('tr');
        const cells   = row ? row.querySelectorAll('td') : [];
        const rowData = {};
        cells.forEach((td, i) => {
          rowData['col_' + i] = td.textContent.trim();
        });

        TLog.clickWithShot(
          screenId,
          this.id,
          'BTN_CLICK:' + label,
          {
            elementType : 'BUTTON',
            rowData     : rowData,
            formSnapshot: (() => {
              const snap = {};
              document.querySelectorAll('input[type="text"], select')
                .forEach(el => { if (el.id) snap[el.id] = el.value; });
              return snap;
            })()
          },
          100
        );
      });
    }
  };
})();