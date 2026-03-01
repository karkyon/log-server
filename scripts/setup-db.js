'use strict';
const { prisma } = require('../lib/prisma');
const bcrypt     = require('bcryptjs');
const SCREENS = [
  ['MC_DRAWING_LIST','図面一覧'],
  ['MC_INDEX_PROGRAM_EDIT','インデックスプログラム編集'],
  ['MC_EQUIPMENT_LIST','設備一覧'],
  ['MC_MACHINING_INFO','マシニング情報管理'],
  ['MC_SYSTEM_OPERATION_HISTORY','システム操作履歴'],
  ['MC_PRODUCTS_LIST','部品一覧'],
  ['MC_PHOTO_LIST','写真一覧'],
  ['MC_SETUP_SHEET_BACK','段取シートバック'],
  ['MC_SETUP_SHEET_ISSUE_REPEAT','段取シート発行リピート'],
  ['MC_RAW_CLAW_SEARCH','生爪検索'],
  ['MC_SP_SETUP_SHEET_NOTIFY','SP段取シート通知'],
  ['MC_TOOLING_EDIT_BASIC','ツーリング編集（基本版）'],
  ['MC_TOOLING_EDIT_DETAIL','ツーリング編集（詳細版）'],
  ['MC_INFO_UPDATE_CONFIRM','情報更新内容確認'],
  ['MC_OPERATOR_AUTHENTICATION','ユーザ認証'],
  ['MC_WORK_RESULT_LIST','作業実績登録一覧'],
  ['MC_WORK_RESULT_EDIT','作業実績登録'],
  ['MC_WORKOFFSET_RESULT','ワークオフセット・設備稼働実績'],
  ['MC_RAW_CLAW_EDIT_SHEET_LIST','生爪編集・段取シート一覧'],
  ['MC_LOG_OPERATION_HISTORY','ログ操作履歴'],
  ['MC_MACHINING_WORK_HISTORY','作業実績（加工履歴）'],
  ['MC_MACHINING','マシニング情報'],
];
async function main() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nTLog v3.0 — DB初期データ投入\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const pw = process.env.ADMIN_PASSWORD || 'Admin@TLog2026';
  const admin = await prisma.user.upsert({
    where: { username: 'admin' }, update: {},
    create: { username: 'admin', passwordHash: await bcrypt.hash(pw, 12), displayName: 'システム管理者', role: 'ADMIN' },
  });
  console.log(`✅ admin: id=${admin.id}  パスワード: ${pw}  ← 必ず変更してください`);
  const proj = await prisma.project.upsert({
    where: { slug: 'machining-system' }, update: {},
    create: { slug: 'machining-system', name: 'マシニングシステム',
      description: 'TALON マシニング管理システム テスト記録', createdById: admin.id },
  });
  console.log(`✅ プロジェクト: id=${proj.id}  APIキー: ${proj.apiKey}`);
  console.log('   ★ talon_testcase_logger.js に PROJECT_API_KEY として設定してください');
  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId: proj.id, userId: admin.id } }, update: {},
    create: { projectId: proj.id, userId: admin.id, role: 'ADMIN' },
  });
  let cnt = 0;
  for (const [screenId, screenName] of SCREENS) {
    await prisma.screen.upsert({
      where: { projectId_screenId: { projectId: proj.id, screenId } },
      update: { screenName }, create: { projectId: proj.id, screenId, screenName },
    });
    cnt++;
  }
  console.log(`✅ 画面マスタ: ${cnt}件\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}
main().catch(e => { console.error('❌', e.message); process.exit(1); })
      .finally(() => prisma.$disconnect());
