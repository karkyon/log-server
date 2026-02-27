// ======================================================
// MC_OPERATOR_AUTHENTICATION 画面への追加コード
// resizeContents_end() の末尾（最後の閉じ括弧の直前）に追加
// ======================================================

	// ★ v2.0 ロガー初期化（必ずresizeContents_end末尾に）
	TLog.screenLoad('MC_OPERATOR_AUTHENTICATION', 'ユーザ認証');
	TLogAutoInstrument.init('MC_OPERATOR_AUTHENTICATION', { screenMode: 'auth' });
