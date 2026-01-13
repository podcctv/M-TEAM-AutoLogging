/**
 * Telegram Bot API 模块
 * 处理消息发送、验证码轮询和截图发送
 */

import axios from 'axios';
import fs from 'fs';
import FormData from 'form-data';
import config from './config.js';

const TG_API_BASE = `https://api.telegram.org/bot${config.TG_BOT_TOKEN}`;

// 记录最后处理的 update_id，避免重复处理
let lastUpdateId = 0;

/**
 * 发送文本消息
 * @param {string} text - 消息内容
 * @param {boolean} markdown - 是否使用 Markdown 格式
 */
export async function sendMessage(text, markdown = true) {
    try {
        const response = await axios.post(`${TG_API_BASE}/sendMessage`, {
            chat_id: config.TG_USER_ID,
            text: text,
            parse_mode: markdown ? 'Markdown' : undefined,
        });
        return response.data;
    } catch (error) {
        console.error('❌ 发送 Telegram 消息失败:', error.message);
        throw error;
    }
}

/**
 * 发送截图/图片
 * @param {string} imagePath - 图片路径
 * @param {string} caption - 图片说明
 */
export async function sendPhoto(imagePath, caption = '') {
    try {
        const form = new FormData();
        form.append('chat_id', config.TG_USER_ID);
        form.append('photo', fs.createReadStream(imagePath));
        if (caption) {
            form.append('caption', caption);
        }

        const response = await axios.post(`${TG_API_BASE}/sendPhoto`, form, {
            headers: form.getHeaders(),
        });
        return response.data;
    } catch (error) {
        console.error('❌ 发送截图失败:', error.message);
        throw error;
    }
}

/**
 * 初始化 - 清空旧的 updates
 */
export async function initUpdates() {
    try {
        const response = await axios.get(`${TG_API_BASE}/getUpdates`, {
            params: { offset: -1 }
        });
        if (response.data.ok && response.data.result.length > 0) {
            lastUpdateId = response.data.result[response.data.result.length - 1].update_id;
        }
        console.log('✅ Telegram updates 已初始化');
    } catch (error) {
        console.error('⚠️ 初始化 updates 失败:', error.message);
    }
}

/**
 * 轮询获取用户输入的验证码
 * 支持两种格式:
 * 1. 直接发送 6 位数字: 123456
 * 2. 命令格式: /mtcode 123456
 * @param {string} prompt - 提示消息
 * @param {number} timeout - 超时时间(毫秒)
 * @returns {Promise<string|null>} - 用户输入的验证码
 */
export async function waitForVerificationCode(prompt, timeout = config.TFA_TIMEOUT) {
    // 发送提示消息
    await sendMessage(prompt);
    console.log('⏳ 等待用户输入验证码...');

    const startTime = Date.now();
    const pollInterval = config.TFA_POLL_INTERVAL;

    while (Date.now() - startTime < timeout) {
        try {
            const response = await axios.get(`${TG_API_BASE}/getUpdates`, {
                params: {
                    offset: lastUpdateId + 1,
                    timeout: 5,
                },
            });

            if (response.data.ok && response.data.result.length > 0) {
                for (const update of response.data.result) {
                    lastUpdateId = update.update_id;

                    // 检查是否来自目标用户的消息
                    if (update.message &&
                        update.message.from &&
                        String(update.message.from.id) === String(config.TG_USER_ID)) {

                        const text = (update.message.text || '').trim();

                        // 支持两种格式:
                        // 1. /mtcode 123456
                        // 2. 直接发送 123456
                        let code = null;

                        // 检查 /mtcode 命令
                        const cmdMatch = text.match(/^\/mtcode\s+(\d{6})$/i);
                        if (cmdMatch) {
                            code = cmdMatch[1];
                        }

                        // 检查纯 6 位数字
                        if (!code) {
                            const numMatch = text.match(/^(\d{6})$/);
                            if (numMatch) {
                                code = numMatch[1];
                            }
                        }

                        if (code) {
                            console.log('✅ 收到验证码');
                            await sendMessage('✅ 验证码已收到，正在验证...');
                            return code;
                        }
                    }
                }
            }
        } catch (error) {
            console.error('⚠️ 轮询 updates 失败:', error.message);
        }

        // 等待下次轮询
        await new Promise(res => setTimeout(res, pollInterval));
    }

    console.log('❌ 等待验证码超时');
    await sendMessage('❌ 验证码输入超时，请重新运行');
    return null;
}

/**
 * 发送设备验证通知
 * @param {string} approvalUrl - 批准链接
 */
export async function sendDeviceApprovalNotice(approvalUrl) {
    const message = `
🔐 *M-TEAM 新设备登录验证*

检测到需要设备验证，请在 45 秒内点击以下链接批准:

${approvalUrl || '(请在已登录设备上批准)'}

⏳ 脚本将等待 45 秒后继续...
`;
    await sendMessage(message);
}

/**
 * 发送登录成功报告
 * @param {object} userData - 用户数据
 */
export async function sendSuccessReport(userData) {
    // 构建消息，只显示有效数据
    let message = `✅ *M-TEAM 登录成功*\n\n`;

    message += `👤 *用户名:* ${userData.username || 'Unknown'}\n`;

    if (userData.level && userData.level !== 'N/A') {
        message += `🏆 *等级:* ${userData.level}\n`;
    }

    message += `\n`;
    message += `📤 *上传量:* ${userData.uploaded || 'N/A'}\n`;
    message += `📥 *下载量:* ${userData.downloaded || 'N/A'}\n`;
    message += `📈 *分享率:* ${userData.ratio || 'N/A'}\n`;

    message += `\n`;
    message += `✨ *魔力值:* ${userData.bonus || 'N/A'}`;

    if (userData.bonusPerHour && userData.bonusPerHour !== 'N/A') {
        message += ` (⏱️ ${userData.bonusPerHour}/时)`;
    }
    message += `\n`;

    if (userData.btClient && userData.btClient !== 'N/A') {
        message += `💻 *客户端:* ${userData.btClient}\n`;
    }

    if (userData.ipv4 && userData.ipv4 !== 'N/A') {
        message += `🌐 *IPv4:* ${userData.ipv4}\n`;
    }

    message += `\n`;
    message += userData.hasNewMessage ? '📬 *有新站内信!*\n' : '';
    message += `⏰ ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`;

    await sendMessage(message);
}

/**
 * 发送错误通知
 * @param {string} error - 错误信息
 * @param {string} screenshotPath - 截图路径(可选)
 */
export async function sendErrorNotice(error, screenshotPath = null) {
    const message = `
❌ *M-TEAM 登录失败*

错误信息: \`${error}\`

⏰ *时间:* ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
`;
    await sendMessage(message);

    if (screenshotPath && fs.existsSync(screenshotPath)) {
        await sendPhoto(screenshotPath, '错误截图');
    }
}

export default {
    sendMessage,
    sendPhoto,
    initUpdates,
    waitForVerificationCode,
    sendDeviceApprovalNotice,
    sendSuccessReport,
    sendErrorNotice,
};
