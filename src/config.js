/**
 * 配置管理模块
 * 统一管理环境变量读取和验证
 */

export const config = {
    // M-TEAM 登录凭证
    MT_USERNAME: process.env.MT_USERNAME,
    MT_PASSWORD: process.env.MT_PASSWORD,
    MT_COOKIE: process.env.MT_COOKIE || '',
    MT_STORAGE: process.env.MT_STORAGE || '',  // LocalStorage 持久化

    // Telegram Bot 配置
    TG_BOT_TOKEN: process.env.TG_BOT_TOKEN,
    TG_USER_ID: process.env.TG_USER_ID,

    // GitHub API 配置
    REPO_TOKEN: process.env.REPO_TOKEN,
    GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY || '',

    // M-TEAM URL
    MT_BASE_URL: 'https://kp.m-team.cc',
    MT_LOGIN_URL: 'https://kp.m-team.cc/login.php',
    MT_INDEX_URL: 'https://kp.m-team.cc/index.php',

    // 超时配置 (毫秒)
    RANDOM_DELAY_MAX: 45 * 60 * 1000,  // 随机延迟最大 45 分钟
    DEVICE_APPROVAL_WAIT: 45 * 1000,   // 设备验证等待 45 秒
    TFA_TIMEOUT: 120 * 1000,           // 2FA 验证超时 120 秒
    TFA_POLL_INTERVAL: 3 * 1000,       // 2FA 轮询间隔 3 秒

    // 行为配置 (用于调试)
    RUN_ON_START: process.env.RUN_ON_START === 'true', // 是否在启动时立即执行一次
    SKIP_DELAY: process.env.SKIP_DELAY === 'true',     // 是否跳过随机延迟
};

/**
 * 验证必需的环境变量
 */
export function validateConfig() {
    const required = ['MT_USERNAME', 'MT_PASSWORD', 'TG_BOT_TOKEN', 'TG_USER_ID'];
    const missing = required.filter(key => !config[key]);

    if (missing.length > 0) {
        throw new Error(`缺少必需的环境变量: ${missing.join(', ')}`);
    }

    console.log('✅ 配置验证通过');
    return true;
}

export default config;
