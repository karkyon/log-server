(function loadHtml2Canvas() {
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
  document.head.appendChild(s);
})();

/* ============================================================
   TLog + 自動計装 オールインワン v1.3
   変更履歴:
     v1.0 - 初版
     v1.1 - 閲覧・編集ボタンの二重イベント問題修正
     v1.2 - スクリーンショット機能追加
     v1.3 - 検索結果件数ログ追加
            閲覧・編集ボタンのスクリーンショットを即時撮影（100ms）に変更
   ============================================================ */
window.TLog = window.TLog || (function () {

  const SERVER    = 'http://192.168.1.11:3099/log';
  const SS_SERVER = 'http://192.168.1.11:3099/screenshot';

  function send(data) {
    fetch(SERVER, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify(data)
    }).catch(() => {});
  }

  function newTrace() {
    return 'TR-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  }

  /**
   * スクリーンショット撮影・サーバ送信
   * @param {string} traceId  - トレースID（ログとの紐付け用）
   * @param {string} screenId - 画面ID
   * @param {string} trigger  - 撮影トリガー（イベント名・ボタンIDなど）
   */
  function takeScreenshot(traceId, screenId, trigger) {
    if (typeof html2canvas === 'undefined') return;

    html2canvas(document.body, {
      scale       : 0.5,    // 50%に縮小（ファイルサイズ削減）
      useCORS     : false,  // CORSを無効（外部画像は諦める）
      allowTaint  : false,  // 外部画像汚染を許可しない
      logging     : false,  // html2canvasのエラーログを抑制
      imageTimeout: 0,      // 画像読み込みタイムアウト無効
      ignoreElements: (el) => {
        // 外部ドメインの画像・スクリプトをスキップ（CORSエラー回避）
        if (el.tagName === 'SCRIPT') return true;
        if (el.tagName === 'IMG') {
          const src = el.src || '';
          // TALONサーバ(192.168.1.207)以外の画像は除外
          if (src && !src.includes('192.168.1.207')) return true;
        }
        return false;
      }
    }).then(canvas => {
      // PNG → JPEG変換でファイルサイズ削減（quality: 0.6）
      const imageData = canvas.toDataURL('image/jpeg', 0.6);

      fetch(SS_SERVER, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          traceId  : traceId,
          screenId : screenId,
          trigger  : trigger,
          imageData: imageData
        })
      }).catch(() => {});

    }).catch(() => {}); // html2canvas自体のエラーも握りつぶす（業務に影響させない）
  }

  return {

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
      // 画面ロード時スクリーンショット
      takeScreenshot(traceId, screenId, 'SCREEN_LOAD');
    },

    /**
     * UI操作（クリック・入力）のログ送信
     * @param {string} screenId   - 画面ID
     * @param {string} elementId  - 操作した要素のID
     * @param {string} label      - 操作ラベル
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
     * 検索・クリアなど結果反映後の画面状態を記録するために使用
     * @param {string} screenId   - 画面ID
     * @param {string} elementId  - 操作した要素のID
     * @param {string} label      - 操作ラベル
     * @param {Object} inputValues - 入力値・付随情報
     * @param {number} delayMs    - スクリーンショット撮影までの遅延（ms）
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
      // 指定遅延後（Ajax完了・画面遷移を待つ）にスクリーンショット撮影
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
     * @param {Object}      detail      - 詳細情報（件数・SQL・ステータスなど）
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

  /**
   * 要素を計装対象から除外すべきか判定
   * @param {Element} el - 判定対象要素
   * @returns {boolean}
   */
  function shouldIgnore(el) {
    return IGNORE_ID_PATTERNS.some(p => p.test(el.id || ''))
        || IGNORE_CLASS_PATTERNS.some(p => p.test(el.className || ''));
  }

  /**
   * 要素の人間可読なラベルを取得
   * @param {Element} el - 対象要素
   * @returns {string}
   */
  function getLabel(el) {
    return el.title || el.placeholder || el.name || el.id || el.tagName;
  }

  /**
   * 現在の全入力フォームのスナップショットを取得
   * @returns {Object} - { elementId: value } 形式のオブジェクト
   */
  function getFormSnapshot() {
    const snap = {};
    document.querySelectorAll('input[type="text"], input[type="number"], textarea, select')
      .forEach(el => {
        if (el.id) snap[el.id] = el.value;
      });
    return snap;
  }

  /**
   * 検索結果件数をDOMから取得してログに記録
   * 検索ボタンクリック後のAjax完了を待って実行
   * @param {string} screenId - 画面ID
   */
  function logSearchResult(screenId) {
    setTimeout(() => {
      // 検索結果件数テキストを本文から正規表現で抽出
      const countMatch = document.body.innerText.match(/検索結果[：:]\s*(\d+)件/);
      // テーブル明細行数をDOMから直接カウント
      const rowCount = document.querySelectorAll(
        'table tbody tr.ui-widget-content, table tbody tr[class*="ui-datatable"]'
      ).length;

      TLog.backend(null, screenId, 'SEARCH_RESULT', {
        status   : 'SUCCESS',
        rowCount : rowCount,
        countText: countMatch ? countMatch[0] : '不明',
        note     : '検索結果件数'
      });
    }, 1800); // スクリーンショット（1500ms）より後に記録
  }

  return {

    /**
     * 画面内の全インタラクティブ要素に自動でイベントリスナーを付与
     * resizeContents_end() の末尾から呼び出す
     * @param {string} screenId - 画面ID
     */
    init: function (screenId) {

      // ── TEXTBOX：値変化をログ ──────────────────────────────
      document.querySelectorAll('input[type="text"], input[type="number"], textarea')
        .forEach(el => {
          if (shouldIgnore(el)) return;

          let prev = el.value; // フォーカス前の値を保持

          // フォーカスが外れた時点の確定値を記録（変化がない場合はスキップ）
          el.addEventListener('change', function () {
            if (this.value === prev) return;
            TLog.click(
              screenId,
              this.id,
              'INPUT_CHANGE:' + getLabel(this),
              {
                elementType: 'TEXTBOX',
                prevValue  : prev,
                newValue   : this.value
              }
            );
            prev = this.value;
          });
        });

      // ── SELECT（ドロップダウン）：選択変化をログ ──────────
      document.querySelectorAll('select').forEach(el => {
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

            // 検索・クリアボタンはAjax完了後のスクリーンショット付き
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
      // ※ 検索後リロード時・前画面から戻った際の「前状態」判別に使用
      TLog.backend(null, screenId, 'INITIAL_SNAPSHOT', {
        status      : 'SUCCESS',
        formSnapshot: getFormSnapshot(),
        note        : '画面初期状態'
      });
    },

    /**
     * 閲覧・編集ボタン専用ログ登録
     * changeButtonStyle() から各ボタンに対して呼び出す
     * ・行データ（部品ID・図面番号等）をログに含める
     * ・スクリーンショットはクリック直前の状態を即時撮影（100ms）
     * @param {string}  screenId - 画面ID
     * @param {Element} elm      - 対象ボタン要素
     * @param {string}  label    - ボタンラベル（'閲覧' or '編集'）
     */
    attachRowButtonLog: function (screenId, elm, label) {
      elm.addEventListener('click', function () {

        // 同じ行の全セルデータを取得（部品ID・MCID・図面番号等）
        const row     = this.closest('tr');
        const cells   = row ? row.querySelectorAll('td') : [];
        const rowData = {};
        cells.forEach((td, i) => {
          rowData['col_' + i] = td.textContent.trim();
        });

        // 遷移先画面では撮影できないため、クリック直前（100ms後）に即撮り
        TLog.clickWithShot(
          screenId,
          this.id,
          'BTN_CLICK:' + label,
          {
            elementType : 'BUTTON',
            rowData     : rowData,   // クリックした行の全列データ
            formSnapshot: (() => {
              const snap = {};
              document.querySelectorAll('input[type="text"], select')
                .forEach(el => { if (el.id) snap[el.id] = el.value; });
              return snap;
            })()
          },
          100 // 遷移前の画面を即時キャプチャ（100ms）
        );
      });
    }
  };
})();


/* ============================================================
   画面固有コード：マシニング部品一覧（MC_PRODUCTS_LIST）
   ============================================================ */

var isValid = true;

/**
 * 初期処理（TALONによる画面サイズ調整終了時に呼ばれる）
 * isValidフラグで初回のみ実行する
 */
function resizeContents_end() {
  if (isValid) {
    // 画面ロード時ログ + スクリーンショット
    TLog.screenLoad('MC_PRODUCTS_LIST', 'マシニング部品一覧');

    // アップロードボタン表示変更
    changeButtonStyle();

    // 図面画像イメージ取得用APIURLの設定
    getDrawingImageURL();

    // 各要素へのロガー自動付与（changeButtonStyle()の後に実行すること）
    TLogAutoInstrument.init('MC_PRODUCTS_LIST');

    isValid = false;
  }
}

/**
 * 図面画像の表示用URLを設定する
 * ・<img>のsrcを画像サーバURL（http://タイトル値）に変更
 * ・<a>のonclickを独自の画像拡大表示処理に差し替える
 */
function getDrawingImageURL() {

  // 変数宣言
  var title;
  var newSrc;

  // すべての 'TLN_1_drawing_img_' を含む <a> タグを取得
  const aTags = document.querySelectorAll('a[id^="TLN_1_drawing_img_"]');

  // すべての<a>をループ処理
  aTags.forEach(aTag => {

    // 現在の<a>のidを取得
    const aTag_id = aTag.id;

    // 現在の<a>のidから行Noを取得
    const aTag_no = aTag_id.replace('TLN_1_drawing_img_', '');

    // "TLN_1_drawing_img_$TLN_IMG_" + NoのIDを持つ<img>を取得
    const imgTag_id = 'TLN_1_drawing_img_$TLN_IMG_' + aTag_no;
    const imgTag    = document.getElementById(imgTag_id);

    // 取得した<img>が存在すれば、titleからURLを構築
    if (imgTag) {
      title = imgTag.getAttribute('title');

      // <img>のaltを「イメージ取得失敗」に変更（エラー時表示用）
      imgTag.setAttribute('alt', 'イメージ取得失敗');

      // <img>のsrcを 'http://' + title に変更
      newSrc = 'http://' + title;
      imgTag.setAttribute('src', newSrc);

      // <img>の 'onerror' 'onload' イベント属性を削除
      imgTag.removeAttribute('onerror');
      imgTag.removeAttribute('onload');
    }

    // <a>のonclickイベントを一旦クリア
    aTag.setAttribute('onclick', ''); // 一旦ブランクにする

    // <a>のvalueをORG（原寸）URLに変更
    aTag.value = newSrc.replace('imgType=TN', 'imgType=ORG');

    // <a>のdata-save-valueをサムネイルURLに変更
    aTag.setAttribute('data-save-value', newSrc);

    // <a>のonclickイベントを独自の画像拡大表示処理に再設定
    aTag.setAttribute('onclick', `
      event.preventDefault(); // デフォルトのリンク動作を防止

      const newWindow = window.open(this.value, '_blank', "width=800,height=600,resizable=yes,scrollbars=yes");

      newWindow.document.body.style.margin          = '0';
      newWindow.document.body.style.display         = 'flex';
      newWindow.document.body.style.justifyContent  = 'center';
      newWindow.document.body.style.alignItems      = 'center';
      newWindow.document.body.style.overflow        = 'hidden';
      newWindow.document.body.style.backgroundColor = 'black';

      const imgElement           = newWindow.document.createElement('img');
      imgElement.src             = this.value;
      imgElement.style.maxWidth  = "100vw";   // 幅をウィンドウの幅にフィット
      imgElement.style.maxHeight = "100vh";   // 高さをウィンドウの高さにフィット
      imgElement.style.objectFit = "contain"; // アスペクト比を維持しながらフィット

      // ウィンドウのリサイズ時にも画像サイズを調整
      newWindow.addEventListener("resize", () => {
        imgElement.style.maxWidth  = newWindow.innerWidth  + "px";
        imgElement.style.maxHeight = newWindow.innerHeight + "px";
      });

      newWindow.document.body.appendChild(imgElement);
    `);
  });
}

/**
 * 明細部の閲覧・編集ボタンのスタイルを変更する
 * ・閲覧ボタン：白系スタイル（btn-styled-white）
 * ・編集ボタン：水色スタイル（btn-styled-skyblue）
 * ・各ボタンにログ用イベントリスナーを付与（TLogAutoInstrument経由）
 */
function changeButtonStyle() {

  // すべての 'TLN_1_閲覧_' を含む <input> タグを取得
  const viewButtons = document.querySelectorAll('input[id^="TLN_1_閲覧_"]');
  viewButtons.forEach(elm => {
    console.log(elm.name);
    elm.classList.remove('BTN_GENERAL_LST', 'NEXT_BTN');
    elm.classList.add('btn-styled-white');
    elm.style.width = '80px';
    // ★ ログ登録を別関数で追加（TALONのイベントに干渉しない）
    TLogAutoInstrument.attachRowButtonLog('MC_PRODUCTS_LIST', elm, '閲覧');
  });

  // すべての 'TLN_1_編集_' を含む <input> タグを取得
  const editButtons = document.querySelectorAll('input[id^="TLN_1_編集_"]');
  editButtons.forEach(elm => {
    console.log(elm.name);
    elm.classList.remove('BTN_GENERAL_LST', 'NEXT_BTN');
    elm.classList.add('btn-styled-skyblue');
    elm.style.width = '80px';
    // ★ ログ登録を別関数で追加（TALONのイベントに干渉しない）
    TLogAutoInstrument.attachRowButtonLog('MC_PRODUCTS_LIST', elm, '編集');
  });
}

/**
 * 今日の日付を返却します
 * @returns {string} フォーマット後の日付（YYYY/MM/DD）
 */
function getToday() {
  const today = new Date();
  var dt = new Date(today);
  dt.setDate(dt.getDate() - 0);
  return formatDate(dt);
}

/**
 * 本日の14日前を返却します
 * @returns {string} フォーマット後の日付（YYYY/MM/DD）
 */
function getFromDate() {
  const today = new Date();
  var dt = new Date(today);
  dt.setDate(dt.getDate() - 14);
  return formatDate(dt);
}

/**
 * 日付をフォーマットした後に返却します
 * @param {Date}   date - 日付
 * @returns {string}    - フォーマット後の日付（YYYY/MM/DD）
 */
function formatDate(date) {
  const year  = date.getFullYear();
  const month = date.getMonth() + 1;
  const day   = date.getDate();
  return year + '/' + ('00' + month).slice(-2) + '/' + ('00' + day).slice(-2);
}
