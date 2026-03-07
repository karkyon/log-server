const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
  LevelFormat, PageBreak, VerticalAlign
} = require('docx');
const fs = require('fs');

// ─── カラー定数 ───
const C = {
  primary:   '1F4E79',
  secondary: '2E75B6',
  accent:    '00B0F0',
  dark:      '243F60',
  lightBg:   'EBF3FB',
  codeBg:    'F4F4F4',
  warnBg:    'FFF8E1',
  okBg:      'E8F5E9',
  border:    'CBD5E1',
  text:      '1E293B',
  muted:     '64748B',
};

// ─── ページ設定（A4） ───
const PAGE = { w: 11906, h: 16838, ml: 1080, mr: 1080, mt: 1080, mb: 1080 };
const CONTENT_W = PAGE.w - PAGE.ml - PAGE.mr; // 9746 DXA

// ─── ボーダー定義 ───
const border1 = { style: BorderStyle.SINGLE, size: 1, color: C.border };
const bordersAll = { top: border1, bottom: border1, left: border1, right: border1 };
const bordersNone = {
  top:    { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right:  { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
};

// ─── ナンバリング設定 ───
const numbering = {
  config: [
    {
      reference: 'bullets',
      levels: [{
        level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } }, run: { font: 'Arial' } }
      },{
        level: 1, format: LevelFormat.BULLET, text: '◦', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 1080, hanging: 360 } }, run: { font: 'Arial', size: 20 } }
      }]
    },
    {
      reference: 'numbers',
      levels: [{
        level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } }, run: { font: 'Arial' } }
      }]
    }
  ]
};

// ─── ヘルパー関数 ───

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: C.secondary } },
    shading: { fill: C.lightBg, type: ShadingType.CLEAR },
    children: [new TextRun({ text, font: 'メイリオ', size: 32, bold: true, color: C.primary })]
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 140 },
    border: { left: { style: BorderStyle.SINGLE, size: 16, color: C.secondary } },
    indent: { left: 120 },
    children: [new TextRun({ text, font: 'メイリオ', size: 26, bold: true, color: C.secondary })]
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 100 },
    children: [new TextRun({ text, font: 'メイリオ', size: 22, bold: true, color: C.dark })]
  });
}

function p(text, opts = {}) {
  return new Paragraph({
    spacing: { before: 60, after: 80 },
    children: [new TextRun({
      text, font: 'メイリオ', size: opts.size || 20,
      bold: opts.bold || false, color: opts.color || C.text,
      italics: opts.italic || false
    })]
  });
}

function pb() {
  return new Paragraph({ children: [new PageBreak()] });
}

function blank() {
  return new Paragraph({ spacing: { before: 60, after: 60 }, children: [new TextRun('')] });
}

function bul(text, level = 0) {
  return new Paragraph({
    numbering: { reference: 'bullets', level },
    spacing: { before: 40, after: 40 },
    children: [new TextRun({ text, font: 'メイリオ', size: 20, color: C.text })]
  });
}

function num(text) {
  return new Paragraph({
    numbering: { reference: 'numbers', level: 0 },
    spacing: { before: 40, after: 40 },
    children: [new TextRun({ text, font: 'メイリオ', size: 20, color: C.text })]
  });
}

function codeBlock(lines) {
  return lines.map((line, i) => new Paragraph({
    spacing: { before: i === 0 ? 80 : 0, after: i === lines.length - 1 ? 80 : 0 },
    indent: { left: 200 },
    shading: { fill: C.codeBg, type: ShadingType.CLEAR },
    border: i === 0 ? { left: { style: BorderStyle.SINGLE, size: 12, color: C.secondary }, top: { style: BorderStyle.SINGLE, size: 4, color: C.border } } :
            i === lines.length - 1 ? { left: { style: BorderStyle.SINGLE, size: 12, color: C.secondary }, bottom: { style: BorderStyle.SINGLE, size: 4, color: C.border } } :
            { left: { style: BorderStyle.SINGLE, size: 12, color: C.secondary } },
    children: [new TextRun({ text: line, font: 'Courier New', size: 18, color: '1E293B' })]
  }));
}

function noteBox(text, type = 'warn') {
  const fill = type === 'warn' ? C.warnBg : type === 'ok' ? C.okBg : 'EFF6FF';
  const bcolor = type === 'warn' ? 'F59E0B' : type === 'ok' ? '22C55E' : '3B82F6';
  const icon = type === 'warn' ? '⚠ ' : type === 'ok' ? '✅ ' : 'ℹ ';
  return new Paragraph({
    spacing: { before: 100, after: 100 },
    indent: { left: 120 },
    shading: { fill, type: ShadingType.CLEAR },
    border: { left: { style: BorderStyle.SINGLE, size: 16, color: bcolor } },
    children: [new TextRun({ text: icon + text, font: 'メイリオ', size: 20, color: C.text })]
  });
}

function dataTable(headers, rows, colWidths) {
  const totalW = colWidths.reduce((a, b) => a + b, 0);
  const hdrRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) => new TableCell({
      borders: bordersAll,
      width: { size: colWidths[i], type: WidthType.DXA },
      shading: { fill: C.primary, type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [new TextRun({ text: h, font: 'メイリオ', size: 18, bold: true, color: 'FFFFFF' })]
      })]
    }))
  });
  const dataRows = rows.map((row, ri) => new TableRow({
    children: row.map((cell, ci) => new TableCell({
      borders: bordersAll,
      width: { size: colWidths[ci], type: WidthType.DXA },
      shading: { fill: ri % 2 === 0 ? C.lightBg : 'FFFFFF', type: ShadingType.CLEAR },
      margins: { top: 60, bottom: 60, left: 120, right: 120 },
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({
        children: [new TextRun({ text: cell, font: 'メイリオ', size: 18, color: C.text })]
      })]
    }))
  }));
  return new Table({
    width: { size: totalW, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [hdrRow, ...dataRows]
  });
}

// ─── 表紙 ───
function coverPage() {
  return [
    new Paragraph({ spacing: { before: 2400, after: 0 }, children: [] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 200 },
      children: [new TextRun({ text: 'TLog Platform', font: 'メイリオ', size: 56, bold: true, color: C.primary })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 200 },
      children: [new TextRun({ text: '本番環境デプロイ手順書', font: 'メイリオ', size: 44, bold: true, color: C.secondary })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 600 },
      children: [new TextRun({ text: '～ 外部アプリ連携・DDNS公開対応 ～', font: 'メイリオ', size: 28, color: C.muted, italics: true })]
    }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 40 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.border } },
      children: [new TextRun('')] }),
    blank(),
    new Table({
      width: { size: 5400, type: WidthType.DXA },
      columnWidths: [1800, 3600],
      rows: [
        ['バージョン', 'v1.0'],
        ['作成日', '2026-03-06'],
        ['対象OS', 'Ubuntu 24.04 LTS'],
        ['リポジトリ', 'karkyon/log-server'],
        ['想定構成', 'DDNS + NAT + UFW'],
      ].map((row, ri) => new TableRow({
        children: row.map((cell, ci) => new TableCell({
          borders: bordersAll,
          width: { size: ci === 0 ? 1800 : 3600, type: WidthType.DXA },
          shading: { fill: ci === 0 ? C.lightBg : 'FFFFFF', type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [new Paragraph({
            children: [new TextRun({ text: cell, font: 'メイリオ', size: 20, bold: ci === 0, color: ci === 0 ? C.primary : C.text })]
          })]
        }))
      }))
    }),
    pb()
  ];
}

// ─── 第1章: 概要とアーキテクチャ ───
function chapter1() {
  return [
    h1('1. システム概要'),
    h2('1.1 TLog Platform とは'),
    p('TLog Platform は、Webアプリケーションの操作ログ・スクリーンショット・コンソールログを自動収集し、CMS（管理画面）でTrace単位にレビューできるログ収集・可視化基盤です。外部アプリにSDKを組み込むだけで、ユーザーの操作フローを記録・分析できます。'),
    blank(),

    h2('1.2 デプロイ構成'),
    p('本手順書では、以下のセキュアな公開構成を構築します。'),
    blank(),
    dataTable(
      ['コンポーネント', 'ポート', '公開範囲', '備考'],
      [
        ['TLog API (NestJS)', '3099', '外部公開（DDNS経由）', 'SDK接続用エンドポイント'],
        ['TLog CMS (Next.js)', '3002', 'LAN内のみ', '管理者がブラウザでアクセス'],
        ['PostgreSQL', '5434', 'localhost のみ', 'DB直接接続は不可'],
        ['Redis', '6379', 'localhost のみ', 'セッション管理'],
      ],
      [2400, 1600, 2400, 3146]
    ),
    blank(),

    h2('1.3 通信フロー'),
    p('外部アプリからTLog APIへの通信経路：'),
    blank(),
    ...codeBlock([
      '外部アプリ（SDK組み込み）',
      '      ↓ HTTPS/HTTP → tlog-api.ddns.net:3099',
      '自宅ルーター（NAT転送）',
      '      ↓ ポートフォワーディング 3099 → サーバIP:3099',
      'TLog APIサーバー（Ubuntu 24.04）',
      '      ↓',
      'PostgreSQL（localhost:5434）',
    ]),
    blank(),
    p('CMS（管理画面）への通信経路：'),
    blank(),
    ...codeBlock([
      '管理者PC（同一ネットワーク）',
      '      ↓ http://192.168.x.x:3002',
      'TLog CMSサーバー（Ubuntu 24.04）',
    ]),
    blank(),
    noteBox('CMS は外部ネットワークからアクセス不可（UFWでLAN内のみ許可）。管理者は必ず同一LAN内のPCからアクセスすること。', 'info'),
    pb()
  ];
}

// ─── 第2章: 事前準備 ───
function chapter2() {
  return [
    h1('2. 事前準備'),
    h2('2.1 サーバー要件'),
    dataTable(
      ['項目', '最低要件', '推奨'],
      [
        ['OS', 'Ubuntu 24.04 LTS', 'Ubuntu 24.04 LTS（最新パッチ適用済み）'],
        ['CPU', '2コア', '4コア以上'],
        ['メモリ', '4GB RAM', '8GB RAM以上'],
        ['ストレージ', '30GB SSD', '60GB以上（スクショ蓄積を考慮）'],
        ['ネットワーク', '有線LAN推奨', '固定LAN IP割り当て済み'],
      ],
      [2400, 2400, 4946]
    ),
    blank(),

    h2('2.2 DDNS サービスの準備'),
    p('動的IPアドレスに対してドメイン名でアクセスするためDDNSサービスを使用します。以下いずれかを事前に登録してください。'),
    blank(),
    dataTable(
      ['サービス', 'URL', '無料プラン', '備考'],
      [
        ['No-IP', 'www.noip.com', 'あり（3ホスト）', '本手順書の例で使用'],
        ['Cloudflare', 'cloudflare.com', 'あり（要ドメイン取得）', '独自ドメイン所持の場合に最適'],
        ['ddns.net', 'www.ddns.net', 'あり', '設定が簡単'],
        ['DynDNS', 'www.dyn.com', '有料', '企業向け'],
      ],
      [2000, 2200, 1600, 3946]
    ),
    blank(),
    noteBox('本手順書では No-IP を使用した設定例を記載します。他のサービスを使用する場合は、クライアントソフトのインストール手順が異なります。', 'info'),
    blank(),

    h2('2.3 ルーターの設定確認'),
    p('以下の設定が可能なルーターであることを確認してください。'),
    bul('ポートフォワーディング（静的NAT）の設定'),
    bul('DMZまたはバーチャルサーバー機能'),
    bul('サーバーへの固定LAN IPアドレス割り当て（MACアドレスでのDHCP固定推奨）'),
    blank(),

    h2('2.4 開発環境からの設定値コピー'),
    p('既存の開発環境（192.168.1.11）から以下の値をメモしておいてください。'),
    blank(),
    dataTable(
      ['設定項目', 'コマンド / 確認方法'],
      [
        ['JWT_SECRET', 'cat ~/projects/log-server/apps/api/.env | grep JWT_SECRET'],
        ['DBパスワード', 'cat ~/projects/log-server/apps/api/.env | grep DATABASE_URL'],
        ['管理者パスワード', '既知（admin1234 等）'],
        ['APIキー（既存）', 'CMS > プロジェクト > APIキー管理'],
      ],
      [2800, 6946]
    ),
    pb()
  ];
}

// ─── 第3章: サーバー初期セットアップ ───
function chapter3() {
  return [
    h1('3. サーバー初期セットアップ'),
    h2('3.1 OS初期設定'),
    h3('システム更新'),
    ...codeBlock([
      'sudo apt update && sudo apt upgrade -y',
      'sudo apt install -y curl git build-essential ufw fail2ban',
    ]),
    blank(),

    h3('タイムゾーン設定（JST）'),
    ...codeBlock([
      'sudo timedatectl set-timezone Asia/Tokyo',
      'timedatectl status  # Asia/Tokyo であることを確認',
    ]),
    blank(),

    h2('3.2 Node.js のインストール（nvm 経由）'),
    ...codeBlock([
      '# nvm インストール',
      'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash',
      'source ~/.bashrc',
      '',
      '# Node.js 20 LTS インストール',
      'nvm install 20',
      'nvm use 20',
      'nvm alias default 20',
      '',
      '# バージョン確認',
      'node -v   # v20.x.x',
      'npm -v    # 10.x.x',
    ]),
    blank(),

    h2('3.3 pm2 のインストール'),
    p('pm2（Process Manager 2）はNode.jsプロセスをデーモンとして管理するツールです。'),
    ...codeBlock([
      'npm install -g pm2',
      '',
      '# システム起動時に自動起動設定',
      'pm2 startup',
      '# 出力されたコマンド（sudo env ...）をそのまま実行',
    ]),
    blank(),

    h2('3.4 PostgreSQL のインストール'),
    ...codeBlock([
      '# PostgreSQL 16 インストール',
      'sudo apt install -y postgresql postgresql-contrib',
      'sudo systemctl enable postgresql',
      'sudo systemctl start postgresql',
      '',
      '# DBユーザー・データベース作成',
      'sudo -u postgres psql << EOF',
      'CREATE USER tlog WITH PASSWORD \'your_strong_password\';',
      'CREATE DATABASE tlogdb OWNER tlog;',
      'GRANT ALL PRIVILEGES ON DATABASE tlogdb TO tlog;',
      '\\q',
      'EOF',
    ]),
    blank(),

    h3('ポート変更（開発環境との統一）'),
    p('開発環境に合わせてPostgreSQLのポートを5434に変更します。'),
    ...codeBlock([
      'sudo nano /etc/postgresql/16/main/postgresql.conf',
      '# 以下の行を変更:',
      '# port = 5432  →  port = 5434',
      '',
      '# タイムゾーン設定も追加:',
      '# timezone = \'Asia/Tokyo\'',
      '',
      'sudo systemctl restart postgresql',
      '',
      '# 接続確認',
      'psql -U tlog -d tlogdb -h 127.0.0.1 -p 5434 -c "SELECT now();"',
    ]),
    blank(),

    h2('3.5 Redis のインストール'),
    ...codeBlock([
      'sudo apt install -y redis-server',
      '',
      '# 設定: localhost のみ待ち受け（セキュリティ設定）',
      'sudo nano /etc/redis/redis.conf',
      '# bind 127.0.0.1 -::1  （既定値のまま確認）',
      '',
      'sudo systemctl enable redis-server',
      'sudo systemctl restart redis-server',
      '',
      '# 動作確認',
      'redis-cli ping  # PONG が返ればOK',
    ]),
    pb()
  ];
}

// ─── 第4章: アプリケーションデプロイ ───
function chapter4() {
  return [
    h1('4. TLog アプリケーションのデプロイ'),
    h2('4.1 リポジトリのクローン'),
    ...codeBlock([
      'cd ~',
      'mkdir -p projects && cd projects',
      'git clone https://github.com/karkyon/log-server.git',
      'cd log-server',
    ]),
    blank(),

    h2('4.2 依存パッケージのインストール'),
    ...codeBlock([
      'npm install',
    ]),
    blank(),

    h2('4.3 API 環境変数の設定'),
    ...codeBlock([
      'nano apps/api/.env',
    ]),
    blank(),
    p('.env ファイルの内容（以下をそのまま貼り付けて各値を変更）：'),
    ...codeBlock([
      'DATABASE_URL="postgresql://tlog:your_strong_password@localhost:5434/tlogdb"',
      'JWT_SECRET="your_jwt_secret_here"  # 開発環境からコピー',
      'PORT=3099',
      'SCREENSHOT_DIR="/home/ubuntu/projects/log-server/screenshots"',
      '# CORS: SDK を組み込む外部アプリのオリジンを指定',
      'CORS_ORIGINS="http://your-external-app.example.com,https://your-external-app.example.com"',
    ]),
    blank(),
    noteBox('CORS_ORIGINS には SDK を組み込む外部アプリのオリジン（プロトコル＋ドメイン＋ポート）をカンマ区切りで指定します。複数アプリに対応する場合はすべて列挙してください。', 'warn'),
    blank(),

    h2('4.4 CMS 環境変数の設定'),
    ...codeBlock([
      'nano apps/cms/.env.local',
    ]),
    blank(),
    ...codeBlock([
      '# CMSからAPIへの接続（同一サーバー内なのでlocalhost）',
      'NEXT_PUBLIC_API_URL=http://localhost:3099',
    ]),
    blank(),

    h2('4.5 Prisma セットアップ（DB初期化）'),
    ...codeBlock([
      '# Prismaクライアント生成',
      'npx prisma generate',
      '',
      '# マイグレーション適用（テーブル作成）',
      'npx prisma migrate deploy',
      '',
      '# マイグレーション完了確認',
      'psql -U tlog -d tlogdb -h 127.0.0.1 -p 5434 -c "\\dt"',
    ]),
    blank(),

    h2('4.6 ビルド'),
    ...codeBlock([
      '# API ビルド',
      'cd apps/api',
      'npm run build',
      'cd ../..',
      '',
      '# CMS ビルド（数分かかります）',
      'cd apps/cms',
      'npm run build',
      'cd ../..',
    ]),
    blank(),

    h2('4.7 pm2 で起動'),
    ...codeBlock([
      '# APIサーバー起動',
      'pm2 start apps/api/dist/main.js --name tlog-api',
      '',
      '# CMSサーバー起動',
      'pm2 start "npm start" --name tlog-cms --cwd apps/cms',
      '',
      '# 起動確認',
      'pm2 status',
      '',
      '# pm2設定を保存（再起動後も自動起動）',
      'pm2 save',
    ]),
    blank(),
    noteBox('pm2 status で tlog-api / tlog-cms 両方が online になっていれば起動成功です。', 'ok'),
    blank(),

    h2('4.8 管理者アカウントの初期作成'),
    ...codeBlock([
      'curl -s -X POST http://localhost:3099/api/auth/register \\',
      '  -H "Content-Type: application/json" \\',
      '  -d \'{"username":"admin","password":"your_admin_password","email":"admin@example.com"}\' \\',
      '  | python3 -m json.tool',
      '',
      '# {"id": "...", "username": "admin"} が返ればOK',
    ]),
    blank(),
    noteBox('管理者パスワードは十分に強いものを設定してください。このAPIは認証不要で呼び出せるため、初回登録後は不要なら無効化することを推奨します。', 'warn'),
    pb()
  ];
}

// ─── 第5章: ファイアウォール設定 ───
function chapter5() {
  return [
    h1('5. ファイアウォール設定（UFW）'),
    p('UFW（Uncomplicated Firewall）で外部からのアクセスを制限します。API（3099）のみ外部公開し、CMS（3002）はLAN内のみに限定します。'),
    blank(),

    h2('5.1 UFW 基本設定'),
    ...codeBlock([
      '# デフォルトポリシー設定',
      'sudo ufw default deny incoming',
      'sudo ufw default allow outgoing',
      '',
      '# SSH 許可（切断されないよう最初に設定）',
      'sudo ufw allow ssh',
      '# ※ IP制限する場合（推奨）:',
      '# sudo ufw allow from 192.168.x.0/24 to any port 22',
    ]),
    blank(),

    h2('5.2 TLog API の外部公開許可'),
    ...codeBlock([
      '# API（3099）: 全外部IPから許可（SDK接続用）',
      'sudo ufw allow 3099/tcp comment "TLog API - SDK endpoint"',
    ]),
    blank(),

    h2('5.3 CMS のLAN内アクセスのみ許可'),
    ...codeBlock([
      '# CMS（3002）: LAN内のみ許可（例: 192.168.1.0/24 のネットワークの場合）',
      'sudo ufw allow from 192.168.1.0/24 to any port 3002 comment "TLog CMS - LAN only"',
      '',
      '# ※ サーバーのLANセグメントに合わせて変更してください',
    ]),
    blank(),

    h2('5.4 UFW 有効化と確認'),
    ...codeBlock([
      '# UFW 有効化',
      'sudo ufw enable',
      '',
      '# ルール確認',
      'sudo ufw status verbose',
    ]),
    blank(),
    p('期待されるルール出力：'),
    ...codeBlock([
      'Status: active',
      '',
      'To                         Action      From',
      '--                         ------      ----',
      '22/tcp                     ALLOW IN    Anywhere',
      '3099/tcp                   ALLOW IN    Anywhere',
      '3002/tcp                   ALLOW IN    192.168.1.0/24',
    ]),
    blank(),

    h2('5.5 fail2ban によるSSH保護'),
    ...codeBlock([
      'sudo systemctl enable fail2ban',
      'sudo systemctl start fail2ban',
      '',
      '# SSH への不正アクセス試行をブロック',
      'sudo fail2ban-client status sshd',
    ]),
    blank(),
    noteBox('PostgreSQL（5434）とRedis（6379）はbind設定でlocalhost専用にしているため、UFWルールは不要です。', 'info'),
    pb()
  ];
}

// ─── 第6章: DDNS・ルーター設定 ───
function chapter6() {
  return [
    h1('6. DDNS・ルーター設定'),
    h2('6.1 No-IP アカウント・ホスト名作成'),
    p('以下の手順でDDNSホスト名を作成します。'),
    num('https://www.noip.com にアクセスしてアカウント作成'),
    num('ダッシュボード > Dynamic DNS > Create Hostname'),
    num('ホスト名を入力（例: tlog-api.ddns.net）'),
    num('Record Type: DNS Host（A）を選択'),
    num('Create Hostname をクリック'),
    blank(),

    h2('6.2 No-IP Dynamic Update Client（DUC）のインストール'),
    p('DUCはIPアドレス変動時に自動でDDNSを更新するクライアントです。'),
    ...codeBlock([
      '# DUC インストール（Ubuntu 24.04）',
      'cd /tmp',
      'wget https://dmej8g5cpdyqd.cloudfront.net/duc-install.sh',
      'bash duc-install.sh',
      '',
      '# サービス起動・有効化',
      'sudo systemctl enable noip2',
      'sudo systemctl start noip2',
      '',
      '# 設定（アカウント情報の入力）',
      'sudo /usr/local/bin/noip2 -C  # インタラクティブ設定',
      '',
      '# 動作確認',
      'sudo noip2 -S',
    ]),
    blank(),
    noteBox('DUCが正常に動作すると、IPアドレスが変わった際に自動でDDNSレコードを更新します。無料プランのホスト名は30日ごとに更新確認が必要です。', 'warn'),
    blank(),

    h2('6.3 ルーターのポートフォワーディング設定'),
    p('ルーターの管理画面で以下のNAT転送（ポートフォワーディング）を設定します。'),
    blank(),
    dataTable(
      ['設定項目', '値', '備考'],
      [
        ['プロトコル', 'TCP', ''],
        ['外部ポート（WAN側）', '3099', 'DDNSでアクセスされるポート'],
        ['内部IPアドレス（LAN側）', '192.168.x.x', 'サーバーの固定LAN IP'],
        ['内部ポート（LAN側）', '3099', 'TLog APIのポート'],
        ['有効', 'ON / 有効', ''],
      ],
      [3000, 2500, 4246]
    ),
    blank(),
    noteBox('ルーターの設定画面はメーカー・機種によって異なります。「ポートフォワーディング」「バーチャルサーバー」「静的NAT」等の名称で機能を探してください。', 'info'),
    blank(),

    h2('6.4 疎通確認'),
    ...codeBlock([
      '# 1. DNSが解決できるか確認（サーバー上で実行）',
      'nslookup tlog-api.ddns.net',
      '',
      '# 2. 外部ネットワーク（スマホのモバイル回線等）からcurlで確認',
      'curl -s http://tlog-api.ddns.net:3099/api/auth/login \\',
      '  -X POST -H "Content-Type: application/json" \\',
      '  -d \'{"username":"admin","password":"your_password"}\'',
      '',
      '# {"accessToken": "..."} が返ればOK',
    ]),
    pb()
  ];
}

// ─── 第7章: プロジェクト・APIキー設定 ───
function chapter7() {
  return [
    h1('7. プロジェクト・APIキー設定'),
    p('外部アプリからログを収集するためには、プロジェクトを作成してAPIキーを発行する必要があります。'),
    blank(),

    h2('7.1 CMS からの設定（推奨）'),
    num('CMS にアクセス: http://192.168.x.x:3002 （LAN内のPCから）'),
    num('admin アカウントでログイン'),
    num('「新規プロジェクト作成」から外部アプリのプロジェクトを作成'),
    num('プロジェクト詳細 > APIキー管理 > 「新規APIキー発行」'),
    num('発行されたAPIキー（ak_xxxxx...）をメモ'),
    blank(),

    h2('7.2 API から直接設定する場合'),
    ...codeBlock([
      '# ログインしてアクセストークン取得',
      'TOKEN=$(curl -s -X POST http://localhost:3099/api/auth/login \\',
      '  -H "Content-Type: application/json" \\',
      '  -d \'{"username":"admin","password":"your_password"}\' \\',
      '  | python3 -c "import sys,json; print(json.load(sys.stdin)[\'accessToken\'])")',
      '',
      '# プロジェクト作成',
      'curl -s -X POST http://localhost:3099/api/projects \\',
      '  -H "Authorization: Bearer $TOKEN" \\',
      '  -H "Content-Type: application/json" \\',
      '  -d \'{"name":"MyApp Project","slug":"myapp","description":"外部アプリ連携"}\' \\',
      '  | python3 -m json.tool',
      '',
      '# APIキー発行（slugをプロジェクトIDとして使用）',
      'curl -s -X POST http://localhost:3099/api/projects/myapp/apikeys \\',
      '  -H "Authorization: Bearer $TOKEN" \\',
      '  -H "Content-Type: application/json" \\',
      '  -d \'{"name":"本番用APIキー"}\' \\',
      '  | python3 -m json.tool',
    ]),
    blank(),
    noteBox('APIキー（ak_で始まる文字列）は発行時にのみ全文表示されます。必ず安全な場所に保存してください。', 'warn'),
    pb()
  ];
}

// ─── 第8章: SDK組み込みガイド ───
function chapter8() {
  return [
    h1('8. 外部アプリへのSDK組み込みガイド'),
    p('外部アプリに TLog SDK を組み込んでログ収集を開始します。'),
    blank(),

    h2('8.1 SDK の読み込み'),
    p('外部アプリの共通ライブラリ（全ページで読み込まれるHTML/JSファイル）の末尾に以下を追加します。'),
    ...codeBlock([
      '<!-- TLog SDK 読み込み（DDNSのAPIエンドポイントから配信） -->',
      '<script src="http://tlog-api.ddns.net:3099/assets/tlog-sdk.min.js"></script>',
      '<script>',
      'TLog.init({',
      '  apiKey: \'ak_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\',  // 発行したAPIキー',
      '  serverUrl: \'http://tlog-api.ddns.net:3099\',   // DDNSエンドポイント',
      '  projectId: \'myapp\',                           // プロジェクトのslug',
      '  autoStart: true,   // ページロード時に自動でTrace開始',
      '});',
      '</script>',
    ]),
    blank(),

    h2('8.2 各ページでの計装'),
    p('各ページのレンダリング完了後に以下を1行追加するだけで、CLICK・INPUT・SCREEN_LOADイベントの自動収集が始まります。'),
    ...codeBlock([
      '// 各ページの初期化処理（レンダリング後に実行）',
      'TLogAutoInstrument.init(\'SCREEN_ID\', {',
      '  screenName: \'画面表示名\',',
      '});',
      '',
      '// 例: 商品一覧画面の場合',
      'TLogAutoInstrument.init(\'PRODUCTS_LIST\', {',
      '  screenName: \'商品一覧\',',
      '});',
    ]),
    blank(),

    h2('8.3 TraceID継承（マルチ画面ワークフロー）'),
    p('画面遷移をまたぐワークフローを1つのTraceとして記録するため、SDKはsessionStorageを使用してTraceIDを継承します。'),
    blank(),

    h3('パターンA: 全画面自動継承（シンプル）'),
    p('autoStart: true だけで全画面が同一TraceIDを継承します。ブラウザセッション中は1つのTraceIDでトレース継続。'),
    ...codeBlock([
      '// 共通ライブラリ（全画面共通）',
      'TLog.init({',
      '  apiKey: \'ak_xxx...\',',
      '  serverUrl: \'http://tlog-api.ddns.net:3099\',',
      '  projectId: \'myapp\',',
      '  autoStart: true,   // sessionStorageにtraceIdがあれば継承',
      '});',
    ]),
    blank(),

    h3('パターンB: 特定画面を起点に新規Trace開始'),
    p('ワークフローの起点となる画面（例: ログイン画面）でのみ isTraceOrigin: true を指定します。'),
    ...codeBlock([
      '// 起点画面（例: ログイン画面）のみ',
      'TLog.init({',
      '  apiKey: \'ak_xxx...\',',
      '  serverUrl: \'http://tlog-api.ddns.net:3099\',',
      '  projectId: \'myapp\',',
      '  autoStart: true,',
      '  isTraceOrigin: true,  // この画面から必ず新規Trace開始',
      '});',
      '',
      '// その他の画面は isTraceOrigin なし → TraceIDを継承',
    ]),
    blank(),

    h2('8.4 ログアウト・セッション終了時の処理'),
    p('ユーザーがログアウトする際は、TraceIDをsessionStorageから削除してTraceを終了します。'),
    ...codeBlock([
      '// ログアウト処理内に追加',
      'sessionStorage.removeItem(\'tlog_trace_id\');',
      'sessionStorage.removeItem(\'tlog_seq\');',
      'TLog.stopTrace();  // サーバー側でTraceをCOMPLETEDに更新',
    ]),
    blank(),

    h2('8.5 SDK API リファレンス'),
    blank(),
    dataTable(
      ['メソッド / オプション', '説明'],
      [
        ['TLog.init(config)', 'SDK初期化。共通ライブラリで1回だけ呼ぶ'],
        ['autoStart: true', 'ページロード時にstartTrace()を自動実行'],
        ['isTraceOrigin: true', 'この画面を新規Traceの起点にする'],
        ['TLog.startTrace(opts)', '手動でTrace開始。opts: { userId, label }'],
        ['TLog.stopTrace()', 'Trace終了（COMPLETEDステータスに更新）'],
        ['TLog.getTraceId()', '現在のTraceIDを返す'],
        ['TLog.log(type, screen, elem, payload)', 'カスタムイベントを送信'],
        ['TLogAutoInstrument.init(screenId, opts)', 'ページ全体の自動計装を開始'],
        ['TLog.screenLoad(screenId, name)', 'SCREEN_LOADイベントを手動送信'],
      ],
      [3600, 6146]
    ),
    pb()
  ];
}

// ─── 第9章: 動作確認 ───
function chapter9() {
  return [
    h1('9. 動作確認チェックリスト'),
    blank(),

    h2('9.1 インフラ確認'),
    ...codeBlock([
      '# サービス状態確認',
      'pm2 status',
      '',
      '# PostgreSQL確認',
      'sudo systemctl status postgresql',
      '',
      '# Redis確認',
      'redis-cli ping',
      '',
      '# UFWルール確認',
      'sudo ufw status',
      '',
      '# DDNSクライアント確認',
      'sudo systemctl status noip2',
    ]),
    blank(),

    h2('9.2 API疎通確認'),
    ...codeBlock([
      '# LAN内から確認',
      'curl http://localhost:3099/api/auth/login -X POST \\',
      '  -H "Content-Type: application/json" \\',
      '  -d \'{"username":"admin","password":"your_password"}\'',
      '',
      '# 外部ネットワーク（スマホのモバイル回線等）から確認',
      'curl http://tlog-api.ddns.net:3099/api/auth/login -X POST \\',
      '  -H "Content-Type: application/json" \\',
      '  -d \'{"username":"admin","password":"your_password"}\'',
      '',
      '# SDK APIキー疎通テスト（外部ネットワークから）',
      'curl -X POST http://tlog-api.ddns.net:3099/sdk/trace/start \\',
      '  -H "x-api-key: ak_xxx..." \\',
      '  -H "Content-Type: application/json" \\',
      '  -d \'{"projectId":"myapp","operatorId":"test","metadata":{}}\' \\',
      '  | python3 -m json.tool',
      '',
      '# {"traceId": "xxx"} が返ればSDK接続成功',
    ]),
    blank(),

    h2('9.3 CMS動作確認（LAN内PCから）'),
    num('http://192.168.x.x:3002 にブラウザでアクセス'),
    num('ログイン画面が表示されることを確認'),
    num('admin アカウントでログイン'),
    num('プロジェクト一覧・Trace一覧が表示されること'),
    blank(),

    h2('9.4 CMS外部アクセス遮断確認'),
    ...codeBlock([
      '# 外部ネットワーク（スマホのモバイル回線等）から実行',
      '# Connection refused または Timeout になればOK',
      'curl --connect-timeout 5 http://tlog-api.ddns.net:3002/',
    ]),
    blank(),
    noteBox('CMSへの外部アクセスが遮断されていれば「Connection refused」または「タイムアウト」になります。CMS画面が表示された場合はUFW設定を見直してください。', 'warn'),
    pb()
  ];
}

// ─── 第10章: 運用・メンテナンス ───
function chapter10() {
  return [
    h1('10. 運用・メンテナンス'),
    h2('10.1 アプリケーションの更新手順'),
    ...codeBlock([
      'cd ~/projects/log-server',
      '',
      '# 最新コードを取得',
      'git pull origin main',
      '',
      '# 依存パッケージ更新',
      'npm install',
      '',
      '# DBマイグレーション適用',
      'npx prisma generate',
      'npx prisma migrate deploy',
      '',
      '# API再ビルド・再起動',
      'cd apps/api && npm run build && cd ../..',
      'pm2 restart tlog-api',
      '',
      '# CMS再ビルド・再起動',
      'cd apps/cms && npm run build && cd ../..',
      'pm2 restart tlog-cms',
    ]),
    blank(),

    h2('10.2 スクリーンショット管理'),
    p('SDKが自動収集したスクリーンショットはサーバー上に蓄積されます。定期的なクリーンアップを設定します。'),
    ...codeBlock([
      '# 30日以上前のスクショを削除するcronジョブ設定',
      'crontab -e',
      '',
      '# 以下を追加（毎日午前3時に実行）:',
      '0 3 * * * find /home/ubuntu/projects/log-server/screenshots -name "*.png" -mtime +30 -delete',
    ]),
    blank(),

    h2('10.3 DBバックアップ'),
    ...codeBlock([
      '# 手動バックアップ',
      'pg_dump -U tlog -h 127.0.0.1 -p 5434 tlogdb > backup_$(date +%Y%m%d).sql',
      '',
      '# 定期自動バックアップ（crontab）',
      '0 2 * * * pg_dump -U tlog -h 127.0.0.1 -p 5434 tlogdb > \\',
      '  /home/ubuntu/backups/tlogdb_$(date +%Y%m%d).sql',
    ]),
    blank(),

    h2('10.4 ログ確認'),
    ...codeBlock([
      '# APIログ確認',
      'pm2 logs tlog-api --lines 50',
      '',
      '# CMSログ確認',
      'pm2 logs tlog-cms --lines 50',
      '',
      '# UFW拒否ログ確認',
      'sudo grep "UFW BLOCK" /var/log/ufw.log | tail -20',
    ]),
    pb()
  ];
}

// ─── 第11章: トラブルシューティング ───
function chapter11() {
  return [
    h1('11. トラブルシューティング'),
    blank(),
    dataTable(
      ['症状', '原因', '対処法'],
      [
        ['外部からAPIに接続できない（タイムアウト）', 'ルーターのNAT設定漏れ、またはUFWブロック', 'ルーターのポートフォワーディング設定を確認。sudo ufw status でルール確認'],
        ['SDK接続時に401エラー', 'APIキーが無効または期限切れ', 'CMS でAPIキーの状態を確認。必要に応じて再発行'],
        ['CORSエラーが発生する', 'CORS_ORIGINSに外部アプリのオリジンが未記載', '.env の CORS_ORIGINS にオリジンを追加してAPIを再起動'],
        ['CMSにLAN外からアクセスできる', 'UFWのCMSルールが誤っている', 'sudo ufw status で3002のルールを確認・修正'],
        ['DDNSが解決できない', 'DDNSクライアント未起動またはDNS反映待ち', 'sudo systemctl status noip2 で確認。最大数分かかる場合あり'],
        ['pm2がOS再起動後に起動しない', 'pm2 save未実行またはstartup設定漏れ', 'pm2 startup → 出力コマンドを実行 → pm2 save'],
        ['マイグレーションエラー', 'スキーマの不整合', 'npx prisma migrate status で確認。必要に応じて手動で適用'],
        ['スクショが保存されない', 'SCREENSHOT_DIRが存在しないまたは権限不足', 'mkdir -p でディレクトリ作成。chown でオーナー確認'],
      ],
      [2600, 2400, 4746]
    ),
    pb()
  ];
}

// ─── 付録 ───
function appendix() {
  return [
    h1('付録A: 環境変数リファレンス'),
    blank(),
    dataTable(
      ['変数名', 'ファイル', '説明', '例'],
      [
        ['DATABASE_URL', 'apps/api/.env', 'PostgreSQL接続文字列', 'postgresql://tlog:pass@localhost:5434/tlogdb'],
        ['JWT_SECRET', 'apps/api/.env', 'JWT署名シークレット（開発環境からコピー）', '長いランダム文字列'],
        ['PORT', 'apps/api/.env', 'APIポート番号', '3099'],
        ['SCREENSHOT_DIR', 'apps/api/.env', 'スクショ保存ディレクトリ', '/home/ubuntu/.../screenshots'],
        ['CORS_ORIGINS', 'apps/api/.env', '許可するオリジン（カンマ区切り）', 'http://app.example.com'],
        ['NEXT_PUBLIC_API_URL', 'apps/cms/.env.local', 'CMSからAPIへの接続URL', 'http://localhost:3099'],
      ],
      [2200, 1800, 2800, 2946]
    ),
    blank(), blank(),

    h1('付録B: No-IP 無料プランの制限事項'),
    blank(),
    bul('無料プランのホスト名は3件まで'),
    bul('30日ごとに更新確認が必要（メールで通知）。確認しないとホスト名が削除される'),
    bul('長期運用する場合は有料プラン（Plus）またはCloudflareへの移行を検討'),
    blank(), blank(),

    h1('付録C: CMS画面一覧'),
    blank(),
    dataTable(
      ['画面', 'URL（LAN内）', '説明'],
      [
        ['ログイン', 'http://192.168.x.x:3002/login', '管理者ログイン'],
        ['プロジェクト一覧', 'http://192.168.x.x:3002/projects', 'プロジェクト管理・作成'],
        ['Trace一覧', 'http://192.168.x.x:3002/projects/{id}/traces', 'ログ収集済みTraceの一覧'],
        ['Trace詳細', 'http://192.168.x.x:3002/projects/{id}/traces/{traceId}', 'ログ・スクショ・コンソールのレビュー'],
        ['パターン管理', 'http://192.168.x.x:3002/projects/{id}/patterns', 'ログパターンの登録・管理'],
      ],
      [2200, 3600, 3946]
    ),
  ];
}

// ─── ドキュメント生成 ───
async function main() {
  const children = [
    ...coverPage(),
    ...chapter1(),
    ...chapter2(),
    ...chapter3(),
    ...chapter4(),
    ...chapter5(),
    ...chapter6(),
    ...chapter7(),
    ...chapter8(),
    ...chapter9(),
    ...chapter10(),
    ...chapter11(),
    ...appendix(),
  ];

  const doc = new Document({
    numbering,
    styles: {
      default: {
        document: { run: { font: 'メイリオ', size: 20 } }
      },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { font: 'メイリオ', size: 32, bold: true, color: C.primary },
          paragraph: { spacing: { before: 400, after: 200 }, outlineLevel: 0 } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { font: 'メイリオ', size: 26, bold: true, color: C.secondary },
          paragraph: { spacing: { before: 280, after: 140 }, outlineLevel: 1 } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { font: 'メイリオ', size: 22, bold: true, color: C.dark },
          paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 2 } },
      ]
    },
    sections: [{
      properties: {
        page: {
          size: { width: PAGE.w, height: PAGE.h },
          margin: { top: PAGE.mt, right: PAGE.mr, bottom: PAGE.mb, left: PAGE.ml }
        }
      },
      children
    }]
  });

  const buffer = await Packer.toBuffer(doc);
  const out = './TLog_本番環境デプロイ手順書_v1.docx';
  fs.writeFileSync(out, buffer);
  console.log('完了:', out);
}

main().catch(e => { console.error(e); process.exit(1); });
