import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import axios from 'axios';
import { fileURLToPath } from 'url';

function formatToISO(date) {
    return date.toISOString().replace('T', ' ').replace('Z', '').replace(/\.\d{3}Z/, '');
}

async function delayTime(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendTelegramMessage(token, chatId, message) {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const data = {
        chat_id: chatId,
        text: message
    };
    try {
        const response = await axios.post(url, data);
        console.log('消息已发送到 Telegram');
    } catch (error) {
        console.error('Telegram 消息发生失败');
    }
}

(async () => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const accounts = JSON.parse(fs.readFileSync(path.join(__dirname, '../accounts.json'), 'utf-8'));
    const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
    const telegramChatId = process.env.TELEGRAM_CHAT_ID;

    const successAccounts = [];
    const failedAccounts = [];

    const nowUtc = formatToISO(new Date());
    const nowBeijing = formatToISO(new Date(new Date().getTime() + 8 * 60 * 60 * 1000)); // 北京时间东8区

    for (const account of accounts) {
        const { username, password, panel } = account;

        // 显示浏览器窗口&使用自定义窗口大小
        const browser = await puppeteer.launch({ headless: false });
        const page = await browser.newPage();

        let url = `https://${panel}/login/?next=/`;

        try {
            await page.goto(url);

            const usernameInput = await page.$('#id_username');
            if (usernameInput) {
                await usernameInput.click({ clickCount: 3 });
                await usernameInput.press('Backspace');
            }
            await page.type('#id_username', username);
            await page.type('#id_password', password);

            const loginButton = await page.$('#submit');
            if (loginButton) {
                await loginButton.click();
            } else {
                throw new Error('无法找到登录按钮');
            }

            await page.waitForNavigation();

            const isLoggedIn = await page.evaluate(() => {
                const logoutButton = document.querySelector('a[href="/logout/"]');
                return logoutButton !== null;
            });

            if (isLoggedIn) {
                successAccounts.push(username);
                console.log(`账号 ${username} 于北京时间 ${nowBeijing}（UTC时间 ${nowUtc}）登录成功！`);
            } else {
                failedAccounts.push(username);
                console.error(`账号 ${username} 登录失败，请检查账号和密码是否正确。`);
            }
        } catch (error) {
            failedAccounts.push(username);
            console.error(`账号 ${username} 登录时出现错误: ${error}`);
        } finally {
            await page.close();
            await browser.close();
            const delay = Math.floor(Math.random() * 5000) + 1000; // 随机延时1秒到5秒之间
            await delayTime(delay);
        }
    }

    // 任务报告
    let report = `serv00&ct8自动化保号脚本运行报告\n\n🕰 北京时间: ${nowBeijing}\n⏰ UTC时间: ${nowUtc}\n\n📝 任务报告:\n`;

    for (const account of accounts) {
        const { username } = account;
        if (successAccounts.includes(username)) {
            report += `✅serv00账号 ${username} 于北京时间 ${nowBeijing}登录面板成功！\n`;
        } else {
            report += `❌serv00账号 ${username} 于北京时间 ${nowBeijing}登录面板失败，请检查账号和密码是否正确。\n`;
        }
    }

    // 统计信息
    report += `\n📊 统计信息:\n`;
    report += `总账号数: ${accounts.length}\n`;
    report += `成功账号数: ${successAccounts.length} ✅\n`;
    report += `失败账号数: ${failedAccounts.length} ❌\n`;

    if (failedAccounts.length > 0) {
        report += `失败的账号是：${failedAccounts.join(', ')}\n`;
    }

    // 发送报告到Telegram
    if (telegramToken && telegramChatId) {
        await sendTelegramMessage(telegramToken, telegramChatId, report);
    }

    console.log('所有账号登录完成！');
})();
