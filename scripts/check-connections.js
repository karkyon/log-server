'use strict';
require('dotenv').config();
const { prisma } = require('../lib/prisma');
const Redis = require('ioredis');
async function main() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nTLog v3.0 — 接続確認\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  let pgOk = false, redisOk = false;
  try {
    const [v] = await prisma.$queryRaw`SELECT version()`;
    const u = await prisma.user.count(), p = await prisma.project.count(),
          s = await prisma.screen.count(), l = await prisma.log.count();
    console.log('✅ PostgreSQL 接続OK');
    console.log(`   ${v.version.split(' ').slice(0,2).join(' ')}`);
    console.log(`   users:${u} / projects:${p} / screens:${s} / logs:${l}`);
    pgOk = true;
  } catch(e) { console.error('❌ PostgreSQL:', e.message); }
  const redis = new Redis(process.env.REDIS_URL||'redis://localhost:6379',
    { connectTimeout: 3000, lazyConnect: true });
  try {
    await redis.connect();
    console.log(`✅ Redis 接続OK (${await redis.ping()})`);
    redisOk = true;
  } catch(e) { console.error('❌ Redis:', e.message);
  } finally { await redis.quit().catch(() => {}); }
  console.log('');
  console.log(pgOk && redisOk ? '🎉 全接続OK — Step 2 に進めます！' : '⚠️  接続エラーあり');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}
main().catch(e=>{console.error(e);process.exit(1);}).finally(()=>prisma.$disconnect());
