// ~/projects/log-server/server.js  v3.0
// ============================================================
// 変更履歴:
//   v3.0 - PostgreSQL（Prisma）+ Redis + JWT認証 に全面移行
//          認証API: /api/auth/login, /refresh, /logout, /me
//          ログ受信: /api/log, /api/screenshot, /api/consolelog
//                    ※ APIキー認証（talon_testcase_logger.js用）
//          レビューAPI: /api/projects/:id/verdicts, patterns, issues
//          後方互換: /log, /screenshot, /consolelog（APIキー認証）
//          管理API: /api/users（ADMINのみ）
// ============================================================
'use strict';

require('dotenv').config();

const express     = require('express');
const cors        = require('cors');
const fs          = require('fs');
const path        = require('path');
const jwt         = require('jsonwebtoken');
const bcrypt      = require('bcryptjs');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');
const Redis        = require('ioredis');
const { prisma }   = require('./lib/prisma');

const app  = express();
const PORT = parseInt(process.env.PORT || '3099', 10);
const SS_BASE_DIR = process.env.SS_BASE_DIR || path.join(__dirname, 'logs', 'screenshots');

const JWT_SECRET              = process.env.JWT_SECRET || 'change_me';
const JWT_EXPIRES_IN          = process.env.JWT_EXPIRES_IN || '15m';
const REFRESH_TOKEN_EXPIRES_DAYS = parseInt(process.env.REFRESH_TOKEN_EXPIRES_DAYS || '7', 10);

// ── Redis クライアント ─────────────────────────────────────
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  enableOfflineQueue: false,
  lazyConnect: true,
});
redis.connect().catch(e => console.error('[REDIS] 接続失敗:', e.message));

// ── ディレクトリ確保 ──────────────────────────────────────
[SS_BASE_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ── ミドルウェア ──────────────────────────────────────────
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());

// ── ユーティリティ ────────────────────────────────────────
function sanitizeId(id) {
  if (!id || typeof id !== 'string') return 'UNKNOWN';
  return id.replace(/[^A-Za-z0-9_\-]/g, '_').slice(0, 64);
}

// ============================================================
// 認証ヘルパー
// ============================================================
function signAccessToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

async function saveRefreshToken(userId, token) {
  const ttl = REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60;
  await redis.set(`rt:${token}`, String(userId), 'EX', ttl);
}

async function verifyRefreshToken(token) {
  const userId = await redis.get(`rt:${token}`);
  return userId ? parseInt(userId, 10) : null;
}

async function deleteRefreshToken(token) {
  await redis.del(`rt:${token}`);
}

// ── JWT 認証ミドルウェア ───────────────────────────────────
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: '認証が必要です' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'トークンが無効または期限切れです' });
  }
}

// ── ADMIN 権限チェック ─────────────────────────────────────
function adminOnly(req, res, next) {
  if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: '管理者権限が必要です' });
  next();
}

// ── APIキー認証ミドルウェア（TALONクライアント用）────────
async function apiKeyMiddleware(req, res, next) {
  // まず JWT を確認
  const auth  = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET);
      // プロジェクトIDをヘッダーまたはbodyから取得
      req.projectId = parseInt(req.headers['x-project-id'] || req.body?.projectId || '1', 10);
      return next();
    } catch {}
  }

  // 次に APIキー を確認
  const apiKey = req.headers['x-api-key'] || req.body?.apiKey;
  if (apiKey) {
    const project = await prisma.project.findUnique({ where: { apiKey } });
    if (project && project.isActive) {
      req.projectId = project.id;
      return next();
    }
  }

  return res.status(401).json({ error: 'JWT または APIキーが必要です' });
}

// ── プロジェクトアクセス権チェック ────────────────────────
async function projectAccess(req, res, next) {
  const projectId = parseInt(req.params.projectId || req.params.id, 10);
  if (isNaN(projectId)) return res.status(400).json({ error: 'プロジェクトIDが不正です' });

  if (req.user?.role === 'ADMIN') {
    req.projectId = projectId;
    return next();
  }

  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: req.user.userId } }
  });
  if (!member) return res.status(403).json({ error: 'このプロジェクトへのアクセス権がありません' });

  req.projectId = projectId;
  req.memberRole = member.role;
  next();
}

// ============================================================
// 認証 API
// ============================================================

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'username と password は必須です' });

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || !user.isActive) return res.status(401).json({ error: 'ユーザー名またはパスワードが違います' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'ユーザー名またはパスワードが違います' });

    const accessToken    = signAccessToken({ userId: user.id, username: user.username, role: user.role });
    const refreshToken   = uuidv4();
    await saveRefreshToken(user.id, refreshToken);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
      maxAge:   REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
    });

    // 参加プロジェクト一覧
    const memberships = await prisma.projectMember.findMany({
      where: { userId: user.id },
      include: { project: { select: { id: true, slug: true, name: true } } },
    });

    res.json({
      accessToken,
      user: {
        id:          user.id,
        username:    user.username,
        displayName: user.displayName,
        role:        user.role,
      },
      projects: memberships.map(m => ({ ...m.project, memberRole: m.role })),
    });
  } catch (e) {
    console.error('[LOGIN ERROR]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/auth/refresh
app.post('/api/auth/refresh', async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) return res.status(401).json({ error: 'リフレッシュトークンがありません' });

    const userId = await verifyRefreshToken(refreshToken);
    if (!userId) return res.status(401).json({ error: 'リフレッシュトークンが無効または期限切れです' });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) return res.status(401).json({ error: 'ユーザーが無効です' });

    // ローテーション: 古いトークンを削除して新しいものを発行
    await deleteRefreshToken(refreshToken);
    const newRefreshToken = uuidv4();
    await saveRefreshToken(user.id, newRefreshToken);

    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
      maxAge:   REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
    });

    const accessToken = signAccessToken({ userId: user.id, username: user.username, role: user.role });
    res.json({ accessToken });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/auth/logout
app.post('/api/auth/logout', async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (refreshToken) await deleteRefreshToken(refreshToken);
    res.clearCookie('refreshToken');
    res.json({ status: 'ok' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/auth/me
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, username: true, displayName: true, role: true, isActive: true },
    });
    if (!user) return res.status(404).json({ error: 'ユーザーが見つかりません' });

    const memberships = await prisma.projectMember.findMany({
      where: { userId: user.id },
      include: { project: { select: { id: true, slug: true, name: true } } },
    });

    res.json({
      user,
      projects: memberships.map(m => ({ ...m.project, memberRole: m.role })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/auth/change-password
app.post('/api/auth/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: '現在のパスワードと新しいパスワードは必須です' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'パスワードは8文字以上にしてください' });

    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    const ok   = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) return res.status(401).json({ error: '現在のパスワードが違います' });

    await prisma.user.update({
      where:  { id: req.user.userId },
      data:   { passwordHash: await bcrypt.hash(newPassword, 12) },
    });
    res.json({ status: 'ok' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// ユーザー管理 API（ADMIN のみ）
// ============================================================

// GET /api/users
app.get('/api/users', authMiddleware, adminOnly, async (req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, username: true, displayName: true, role: true, isActive: true, createdAt: true }
  });
  res.json(users);
});

// POST /api/users
app.post('/api/users', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { username, password, displayName, role } = req.body;
    if (!username || !password || !displayName) return res.status(400).json({ error: 'username, password, displayName は必須です' });
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { username, passwordHash, displayName, role: role || 'MEMBER' },
      select: { id: true, username: true, displayName: true, role: true },
    });
    res.status(201).json(user);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'そのユーザー名は既に使用されています' });
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/users/:id
app.put('/api/users/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { displayName, role, isActive } = req.body;
    const user = await prisma.user.update({
      where: { id: parseInt(req.params.id, 10) },
      data:  { ...(displayName && { displayName }), ...(role && { role }), ...(isActive !== undefined && { isActive }) },
      select: { id: true, username: true, displayName: true, role: true, isActive: true },
    });
    res.json(user);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// プロジェクト API
// ============================================================

// GET /api/projects
app.get('/api/projects', authMiddleware, async (req, res) => {
  try {
    const where = req.user.role === 'ADMIN'
      ? { isActive: true }
      : { isActive: true, members: { some: { userId: req.user.userId } } };
    const projects = await prisma.project.findMany({
      where,
      include: { _count: { select: { logs: true, screens: true } } },
    });
    res.json(projects);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/projects（ADMINのみ）
app.post('/api/projects', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { slug, name, description } = req.body;
    const project = await prisma.project.create({
      data: { slug, name, description, createdById: req.user.userId },
    });
    // 作成者をADMINメンバーとして追加
    await prisma.projectMember.create({
      data: { projectId: project.id, userId: req.user.userId, role: 'ADMIN' },
    });
    res.status(201).json(project);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'そのスラッグは既に使用されています' });
    res.status(500).json({ error: e.message });
  }
});

// GET /api/projects/:id/features（画面一覧）
app.get('/api/projects/:id/features', authMiddleware, projectAccess, async (req, res) => {
  try {
    const screens = await prisma.screen.findMany({ where: { projectId: req.projectId } });
    const logCounts = await prisma.log.groupBy({
      by: ['featureId'], where: { projectId: req.projectId }, _count: { id: true }
    });
    const logMap = Object.fromEntries(logCounts.map(r => [r.featureId, r._count.id]));
    res.json(screens.map(s => ({ ...s, logCount: logMap[s.screenId] || 0 })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/projects/:id/members
app.post('/api/projects/:id/members', authMiddleware, projectAccess, async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN' && req.memberRole !== 'ADMIN')
      return res.status(403).json({ error: 'プロジェクト管理者権限が必要です' });
    const { userId, role } = req.body;
    const member = await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: req.projectId, userId } },
      update: { role },
      create: { projectId: req.projectId, userId, role: role || 'MEMBER' },
    });
    res.json(member);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/projects/:id/apikey（APIキー取得 - ADMINのみ）
app.get('/api/projects/:id/apikey', authMiddleware, adminOnly, async (req, res) => {
  const project = await prisma.project.findUnique({
    where:  { id: parseInt(req.params.id, 10) },
    select: { apiKey: true, name: true },
  });
  if (!project) return res.status(404).json({ error: 'プロジェクトが見つかりません' });
  res.json(project);
});

// ============================================================
// ログ受信 API（TALONクライアント → DB保存）
// ============================================================

// POST /api/log（新エンドポイント）
app.post('/api/log', apiKeyMiddleware, async (req, res) => {
  try {
    const featureId = sanitizeId(req.body.featureId);
    await prisma.log.create({
      data: {
        projectId: req.projectId,
        featureId,
        traceId:  req.body.traceId  || 'unknown',
        type:     req.body.type     || 'UNKNOWN',
        payload:  req.body,
        ts:       new Date(req.body.ts || Date.now()),
      },
    });
    res.sendStatus(200);
  } catch (e) {
    console.error('[LOG ERROR]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/screenshot（新エンドポイント）
app.post('/api/screenshot', apiKeyMiddleware, async (req, res) => {
  try {
    const { featureId: rawFid, traceId, screenId, trigger, imageData } = req.body;
    const featureId = sanitizeId(rawFid);

    // ファイル保存
    const featureSSDir = path.join(SS_BASE_DIR, featureId);
    if (!fs.existsSync(featureSSDir)) fs.mkdirSync(featureSSDir, { recursive: true });
    const ts      = new Date().toISOString().replace(/[:.]/g, '-');
    const ext     = imageData.startsWith('data:image/jpeg') ? 'jpg' : 'png';
    const safeT   = sanitizeId(trigger || 'UNKNOWN');
    const safeTr  = sanitizeId(traceId || 'NOTRACE');
    const fileName = `${ts}_${featureId}_${safeT}_${safeTr}.${ext}`;
    const filePath  = path.join(featureSSDir, fileName);
    const base64   = imageData.replace(/^data:image\/\w+;base64,/, '');
    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));

    // DB保存
    await prisma.screenshot.create({
      data: {
        projectId: req.projectId,
        featureId,
        traceId:  traceId  || 'unknown',
        trigger:  trigger  || 'UNKNOWN',
        fileName,
        filePath,
        ts: new Date(),
      },
    });

    // Logにも SHOT エントリを記録（後方互換）
    await prisma.log.create({
      data: {
        projectId: req.projectId,
        featureId,
        traceId: traceId || 'unknown',
        type: 'SHOT',
        payload: { type: 'SHOT', featureId, traceId, trigger, screenId, fileName },
        ts: new Date(),
      },
    });

    res.sendStatus(200);
  } catch (e) {
    console.error('[SCREENSHOT ERROR]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/consolelog（新エンドポイント）
app.post('/api/consolelog', apiKeyMiddleware, async (req, res) => {
  try {
    const featureId = sanitizeId(req.body.featureId);
    await prisma.consoleLog.create({
      data: {
        projectId: req.projectId,
        featureId,
        traceId:  req.body.lastTraceId || null,
        level:    req.body.level       || 'log',
        args:     req.body.args        || [],
        stack:    req.body.stack       || null,
        ts:       new Date(req.body.ts || Date.now()),
      },
    });
    res.sendStatus(200);
  } catch (e) {
    console.error('[CONSOLELOG ERROR]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// 後方互換エンドポイント（旧 /log, /screenshot, /consolelog）
// ============================================================
app.post('/log',        apiKeyMiddleware, (req, res, next) => { req.url = '/api/log';        next('route'); });
app.post('/screenshot', apiKeyMiddleware, (req, res, next) => { req.url = '/api/screenshot'; next('route'); });
app.post('/consolelog', apiKeyMiddleware, (req, res, next) => { req.url = '/api/consolelog'; next('route'); });

// ============================================================
// レビューデータ API
// ============================================================

// --- 判定（Verdicts）---
app.get('/api/projects/:id/verdicts', authMiddleware, projectAccess, async (req, res) => {
  const verdicts = await prisma.verdict.findMany({ where: { projectId: req.projectId } });
  res.json(verdicts);
});

app.post('/api/projects/:id/verdicts', authMiddleware, projectAccess, async (req, res) => {
  try {
    const { seqKey, verdict, issueData } = req.body;
    const result = await prisma.verdict.upsert({
      where:  { projectId_seqKey: { projectId: req.projectId, seqKey } },
      update: { verdict, issueData: issueData || null, updatedById: req.user.userId },
      create: { projectId: req.projectId, seqKey, verdict, issueData: issueData || null, updatedById: req.user.userId },
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 一括更新（判定を複数まとめて保存）
app.put('/api/projects/:id/verdicts', authMiddleware, projectAccess, async (req, res) => {
  try {
    const { verdicts } = req.body; // [{ seqKey, verdict, issueData }]
    const results = [];
    for (const v of verdicts) {
      const result = await prisma.verdict.upsert({
        where:  { projectId_seqKey: { projectId: req.projectId, seqKey: v.seqKey } },
        update: { verdict: v.verdict, issueData: v.issueData || null, updatedById: req.user.userId },
        create: { projectId: req.projectId, seqKey: v.seqKey, verdict: v.verdict, issueData: v.issueData || null, updatedById: req.user.userId },
      });
      results.push(result);
    }
    res.json(results);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- 作業パターン（Patterns）---
app.get('/api/projects/:id/patterns', authMiddleware, projectAccess, async (req, res) => {
  const patterns = await prisma.pattern.findMany({
    where:   { projectId: req.projectId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(patterns);
});

app.post('/api/projects/:id/patterns', authMiddleware, projectAccess, async (req, res) => {
  try {
    const { name, screenMode, description, seqData, memo } = req.body;
    const pattern = await prisma.pattern.create({
      data: { projectId: req.projectId, name, screenMode, description, seqData, memo, createdById: req.user.userId },
    });
    res.status(201).json(pattern);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/projects/:id/patterns/:patternId', authMiddleware, projectAccess, async (req, res) => {
  try {
    const { name, screenMode, description, seqData, status, memo } = req.body;
    const pattern = await prisma.pattern.update({
      where: { id: parseInt(req.params.patternId, 10) },
      data:  { name, screenMode, description, seqData, status, memo },
    });
    res.json(pattern);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/projects/:id/patterns/:patternId', authMiddleware, projectAccess, async (req, res) => {
  await prisma.pattern.delete({ where: { id: parseInt(req.params.patternId, 10) } });
  res.json({ status: 'ok' });
});

// --- 課題（Issues）---
app.get('/api/projects/:id/issues', authMiddleware, projectAccess, async (req, res) => {
  const { featureId, status } = req.query;
  const where = {
    projectId: req.projectId,
    ...(featureId && { featureId }),
    ...(status    && { status }),
  };
  const issues = await prisma.issue.findMany({ where, orderBy: { createdAt: 'desc' } });
  res.json(issues);
});

app.post('/api/projects/:id/issues', authMiddleware, projectAccess, async (req, res) => {
  try {
    const { featureId, seqKey, title, type, priority, description } = req.body;
    const issue = await prisma.issue.create({
      data: { projectId: req.projectId, featureId, seqKey, title, type, priority, description, createdById: req.user.userId },
    });
    res.status(201).json(issue);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/projects/:id/issues/:issueId', authMiddleware, projectAccess, async (req, res) => {
  try {
    const { title, type, priority, status, description } = req.body;
    const issue = await prisma.issue.update({
      where: { id: parseInt(req.params.issueId, 10) },
      data:  { title, type, priority, status, description, updatedById: req.user.userId },
    });
    res.json(issue);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/projects/:id/issues/:issueId', authMiddleware, projectAccess, async (req, res) => {
  await prisma.issue.delete({ where: { id: parseInt(req.params.issueId, 10) } });
  res.json({ status: 'ok' });
});

// ============================================================
// ログ参照 API（generate-review.js 用）
// ============================================================
app.get('/api/projects/:id/logs', authMiddleware, projectAccess, async (req, res) => {
  const { featureId, limit } = req.query;
  const logs = await prisma.log.findMany({
    where:   { projectId: req.projectId, ...(featureId && { featureId }) },
    orderBy: { ts: 'asc' },
    take:    parseInt(limit || '5000', 10),
  });
  res.json(logs);
});

app.get('/api/projects/:id/screenshots', authMiddleware, projectAccess, async (req, res) => {
  const { featureId } = req.query;
  const ss = await prisma.screenshot.findMany({
    where:   { projectId: req.projectId, ...(featureId && { featureId }) },
    orderBy: { ts: 'asc' },
  });
  res.json(ss);
});

app.get('/api/projects/:id/consolelogs', authMiddleware, projectAccess, async (req, res) => {
  const { featureId } = req.query;
  const logs = await prisma.consoleLog.findMany({
    where:   { projectId: req.projectId, ...(featureId && { featureId }) },
    orderBy: { ts: 'asc' },
  });
  res.json(logs);
});

// ============================================================
// ユーティリティ・後方互換
// ============================================================

// GET /ping
app.get('/ping', (req, res) => res.json({ status: 'ok', port: PORT, version: '3.0' }));

// GET /api/health
app.get('/api/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const redisPong = await redis.ping().catch(() => 'FAIL');
    res.json({ status: 'ok', db: 'ok', redis: redisPong === 'PONG' ? 'ok' : 'fail', version: '3.0' });
  } catch (e) {
    res.status(500).json({ status: 'error', error: e.message });
  }
});

// GET /clean（開発用 — 本番では削除推奨）
app.get('/clean', authMiddleware, adminOnly, async (req, res) => {
  try {
    await prisma.log.deleteMany({ where: { projectId: 1 } });
    await prisma.screenshot.deleteMany({ where: { projectId: 1 } });
    await prisma.consoleLog.deleteMany({ where: { projectId: 1 } });
    res.json({ status: 'ok', message: 'DB のログデータを削除しました' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 旧 GET 系エンドポイント（後方互換）────────────────────
app.get('/features', authMiddleware, async (req, res) => {
  const screens = await prisma.screen.findMany({ where: { projectId: 1 } });
  res.json(screens.map(s => s.screenId));
});

app.get('/logs/:featureId', authMiddleware, async (req, res) => {
  const featureId = sanitizeId(req.params.featureId);
  const logs = await prisma.log.findMany({
    where: { projectId: 1, featureId }, orderBy: { ts: 'asc' }
  });
  res.json({ featureId, count: logs.length, entries: logs.map(l => l.payload) });
});

// ============================================================
// サーバ起動
// ============================================================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[LOG SERVER v3.0] 起動 → http://0.0.0.0:${PORT}`);
  console.log(`  認証API  : POST /api/auth/login, /refresh, /logout, /me`);
  console.log(`  ログ受信 : POST /api/log, /api/screenshot, /api/consolelog`);
  console.log(`  レビュー : GET/POST /api/projects/:id/verdicts, patterns, issues`);
  console.log(`  後方互換 : POST /log, /screenshot, /consolelog`);
});

module.exports = app;
