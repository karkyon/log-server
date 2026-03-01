// ============================================================
// scripts/db-loader.js  v1.0
// generate-review.js v4.0 用 DB読み込みモジュール
// PostgreSQL(Prisma) からログ・スクショ・コンソールログを取得
// ============================================================
'use strict';
require('dotenv').config();
const path = require('path');

const { prisma } = require(path.join(__dirname, '..', 'lib', 'prisma'));

/**
 * 全featureId → ログエントリ一覧 マップを取得
 * 旧: loadLogs() の .jsonl ファイル読み込みを置き換え
 * @param {number} projectId
 * @returns {Promise<Object>} { featureId: [payloadObj, ...] }
 */
async function loadLogsFromDB(projectId) {
  const logs = await prisma.log.findMany({
    where: { projectId },
    orderBy: { ts: 'asc' },
    select: { featureId: true, payload: true }
  });
  const result = {};
  for (const { featureId, payload } of logs) {
    if (!result[featureId]) result[featureId] = [];
    // payload は Prisma Json 型 → そのまま利用可
    result[featureId].push(payload);
  }
  return result;
}

/**
 * 全featureId → コンソールログ一覧 マップを取得
 * 旧: loadConsoleLogs() の .console.jsonl 読み込みを置き換え
 * @param {number} projectId
 * @returns {Promise<Object>} { featureId: [entryObj, ...] }
 */
async function loadConsoleLogsFromDB(projectId) {
  const rows = await prisma.consoleLog.findMany({
    where: { projectId },
    orderBy: { ts: 'asc' },
    select: { featureId: true, level: true, args: true, traceId: true, ts: true, stack: true }
  });
  const result = {};
  for (const row of rows) {
    if (!result[row.featureId]) result[row.featureId] = [];
    result[row.featureId].push({
      type       : 'CONSOLE',
      featureId  : row.featureId,
      level      : row.level,
      args       : row.args,
      lastTraceId: row.traceId,
      ts         : row.ts ? row.ts.toISOString() : null,
      stack      : row.stack
    });
  }
  return result;
}

/**
 * 全featureId → スクショ情報一覧 マップを取得
 * 旧: loadScreenshots() のファイルシステム読み込みを置き換え
 * @param {number} projectId
 * @returns {Promise<Object>} { featureId: [{ fname, fid, trigger, traceId }, ...] }
 */
async function loadScreenshotsFromDB(projectId) {
  const rows = await prisma.screenshot.findMany({
    where: { projectId },
    orderBy: { ts: 'asc' },
    select: { featureId: true, filePath: true, trigger: true, traceId: true }
  });
  const result = {};
  for (const row of rows) {
    if (!result[row.featureId]) result[row.featureId] = [];
    const fname = path.basename(row.filePath || '');
    result[row.featureId].push({
      fname   : fname,
      fid     : row.featureId,
      trigger : row.trigger || '',
      traceId : row.traceId || ''
    });
  }
  return result;
}

/**
 * DB からプロジェクトの画面一覧（screenId）を取得
 * @param {number} projectId
 * @returns {Promise<string[]>}
 */
async function loadFeatureIdsFromDB(projectId) {
  const screens = await prisma.screen.findMany({
    where: { projectId },
    select: { screenId: true },
    orderBy: { screenId: 'asc' }
  });
  return screens.map(s => s.screenId);
}

/**
 * DB から画面の説明文を取得
 * @param {number} projectId
 * @returns {Promise<Object>} { screenId: description }
 */
async function loadScreenDescriptionsFromDB(projectId) {
  const screens = await prisma.screen.findMany({
    where: { projectId },
    select: { screenId: true, description: true }
  });
  const result = {};
  for (const s of screens) {
    result[s.screenId] = s.description || '';
  }
  return result;
}

/**
 * DB からプロジェクト情報を取得
 * @param {number} projectId
 * @returns {Promise<Object|null>}
 */
async function loadProjectFromDB(projectId) {
  return prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, slug: true, description: true }
  });
}

module.exports = {
  loadLogsFromDB,
  loadConsoleLogsFromDB,
  loadScreenshotsFromDB,
  loadFeatureIdsFromDB,
  loadScreenDescriptionsFromDB,
  loadProjectFromDB
};
