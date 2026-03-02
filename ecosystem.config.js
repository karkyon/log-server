module.exports = {
  apps: [
    {
      name: 'tlog-api',
      cwd: '/home/karkyon/projects/log-server/apps/api',
      script: 'npm',
      args: 'run start:prod',
      env: {
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://tlog:tlog_pass@localhost:5434/tlogdb',
        REDIS_URL: 'redis://localhost:6379',
        JWT_SECRET: 'change_this_to_random_string_in_production',
        API_PORT: '3099',
        SCREENSHOT_DIR: '/home/karkyon/projects/log-server/screenshots',
      },
    },
  ],
};
