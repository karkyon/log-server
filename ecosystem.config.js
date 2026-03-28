module.exports = {
  apps: [
    {
      name: 'tlog-api',
      cwd: '/home/karkyon/projects/tlog/apps/api',
      script: 'dist/main.js',
      env: {
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://tlog:pass123@localhost:5434/tlogdb',
        REDIS_URL: 'redis://localhost:6379',
        JWT_SECRET: 'b9a2b40daae8dcf5e87e3e09aa1bccec01904ac0779421466b997bd9ba6d6d5f',
        API_PORT: '3099',
        SCREENSHOT_DIR: '/home/karkyon/projects/tlog/screenshots',
      },
    },
    {
      name: 'tlog-cms',
      cwd: '/home/karkyon/projects/tlog/apps/cms',
      script: 'npm',
      args: 'run start',
      env: {
        NODE_ENV: 'production',
        PORT: '3002',
        NEXT_PUBLIC_API_URL: 'http://192.168.168.111:3099',
      },
    },
  ],
};
