  /**
   * スクリーンショット撮影・サーバ送信
   * html2canvasが未ロードの場合は500ms間隔で最大20回（10秒）リトライする
   * → 初期表示時に loadHtml2Canvas() の非同期ロードが間に合わない問題を解消
   * @param {string} traceId  - トレースID（ログとの紐付け用）
   * @param {string} screenId - 画面ID
   * @param {string} trigger  - 撮影トリガー（イベント名・ボタンIDなど）
   */
  function takeScreenshot(traceId, screenId, trigger) {

    // html2canvasがまだ読み込まれていない場合はリトライ待機
    if (typeof html2canvas === 'undefined') {
      let retryCount = 0;
      const maxRetry      = 20;   // 最大リトライ回数（20回 × 500ms = 10秒）
      const retryInterval = 500;  // リトライ間隔（ms）

      const timer = setInterval(() => {
        retryCount++;
        if (typeof html2canvas !== 'undefined') {
          // 読み込み完了 → 撮影実行
          clearInterval(timer);
          _capture(traceId, screenId, trigger);
        } else if (retryCount >= maxRetry) {
          // タイムアウト：諦める（業務に影響させない）
          clearInterval(timer);
        }
      }, retryInterval);

      return;
    }

    // html2canvas がすでにロード済みの場合は即撮影
    _capture(traceId, screenId, trigger);
  }

  /**
   * html2canvasによる実際のキャプチャ処理
   * takeScreenshot() からのみ呼び出す内部関数
   * @param {string} traceId  - トレースID（ログとの紐付け用）
   * @param {string} screenId - 画面ID
   * @param {string} trigger  - 撮影トリガー（イベント名・ボタンIDなど）
   */
  function _capture(traceId, screenId, trigger) {
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
