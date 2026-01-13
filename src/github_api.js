/**
 * GitHub API 模块
 * 用于更新 Repository Secrets (Cookie 持久化)
 */

import { Octokit } from '@octokit/rest';
import tweetsodium from 'tweetsodium';
import config from './config.js';

let octokit = null;

/**
 * 初始化 Octokit 客户端
 */
function getOctokit() {
    if (!octokit && config.REPO_TOKEN) {
        octokit = new Octokit({
            auth: config.REPO_TOKEN,
        });
    }
    return octokit;
}

/**
 * 解析仓库信息
 * @returns {{ owner: string, repo: string }}
 */
function parseRepository() {
    const [owner, repo] = config.GITHUB_REPOSITORY.split('/');
    if (!owner || !repo) {
        throw new Error('GITHUB_REPOSITORY 格式无效，应为 owner/repo');
    }
    return { owner, repo };
}

/**
 * 获取仓库的公钥 (用于加密 Secrets)
 */
async function getPublicKey() {
    const client = getOctokit();
    if (!client) {
        throw new Error('GitHub API 未初始化，请检查 REPO_TOKEN');
    }

    const { owner, repo } = parseRepository();
    const { data } = await client.rest.actions.getRepoPublicKey({
        owner,
        repo,
    });

    return {
        key: data.key,
        keyId: data.key_id,
    };
}

/**
 * 加密 Secret 值
 * @param {string} value - 要加密的值
 * @param {string} publicKey - Base64 编码的公钥
 * @returns {string} - Base64 编码的加密值
 */
function encryptSecret(value, publicKey) {
    const messageBytes = Buffer.from(value);
    const keyBytes = Buffer.from(publicKey, 'base64');

    // 使用 tweetsodium 进行加密 (专门用于 GitHub Secrets)
    const encryptedBytes = tweetsodium.seal(messageBytes, keyBytes);

    return Buffer.from(encryptedBytes).toString('base64');
}

/**
 * 更新 GitHub Repository Secret
 * @param {string} secretName - Secret 名称
 * @param {string} secretValue - Secret 值
 */
export async function updateSecret(secretName, secretValue) {
    try {
        const client = getOctokit();
        if (!client) {
            console.log('⚠️ REPO_TOKEN 未配置，跳过 Secret 更新');
            return false;
        }

        const { owner, repo } = parseRepository();
        const { key, keyId } = await getPublicKey();

        const encryptedValue = encryptSecret(secretValue, key);

        await client.rest.actions.createOrUpdateRepoSecret({
            owner,
            repo,
            secret_name: secretName,
            encrypted_value: encryptedValue,
            key_id: keyId,
        });

        console.log(`✅ Secret ${secretName} 已更新`);
        return true;
    } catch (error) {
        console.error(`❌ 更新 Secret ${secretName} 失败:`, error.message);
        throw error;
    }
}

/**
 * 更新 Cookie Secret
 * @param {string} cookieJson - Cookie JSON 字符串
 */
export async function updateCookieSecret(cookieJson) {
    return await updateSecret('MT_COOKIE', cookieJson);
}

/**
 * 更新 Storage Secret
 * @param {string} storageJson - LocalStorage JSON 字符串
 */
export async function updateStorageSecret(storageJson) {
    return await updateSecret('MT_STORAGE', storageJson);
}

export default {
    updateSecret,
    updateCookieSecret,
    updateStorageSecret,
};
