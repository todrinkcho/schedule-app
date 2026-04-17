// Service Worker - 日程助手后台运行脚本
const PUSHPLUS_TOKEN = '560ed4722e304023a18e893e986205a6';
const WORKER_API = 'https://schedule-ai.todrink2333.workers.dev/api';
const CHECK_INTERVAL = 60000; // 每分钟检查一次

// 缓存最新的日程数据
let cachedSchedules = [];
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存

// 获取日程数据
async function fetchSchedules() {
    const now = Date.now();
    
    // 如果缓存还没过期，直接用缓存
    if (now - lastFetchTime < CACHE_DURATION && cachedSchedules.length > 0) {
        return cachedSchedules;
    }
    
    try {
        const response = await fetch(WORKER_API);
        if (response.ok) {
            cachedSchedules = await response.json();
            lastFetchTime = now;
        }
    } catch (e) {
        console.log('SW: 获取数据失败', e);
    }
    
    return cachedSchedules;
}

// 保存日程数据
async function saveSchedules(schedules) {
    try {
        await fetch(WORKER_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ schedules })
        });
        cachedSchedules = schedules;
        lastFetchTime = Date.now();
    } catch (e) {
        console.log('SW: 保存数据失败', e);
    }
}

// 发送推送
async function sendPush(title, content) {
    try {
        const url = `http://www.pushplus.plus/send?token=${PUSHPLUS_TOKEN}&title=${encodeURIComponent(title)}&content=${encodeURIComponent(content)}`;
        await fetch(url);
        return true;
    } catch (e) {
        console.log('SW: 推送失败', e);
        return false;
    }
}

// 检查并发送提醒
async function checkReminders() {
    const schedules = await fetchSchedules();
    const now = new Date();
    
    let hasChanges = false;
    
    for (const schedule of schedules) {
        if (schedule.notified) continue;
        
        const remindTime = new Date(schedule.remindAt);
        if (now >= remindTime) {
            const title = `📅 提醒：${schedule.event}`;
            const content = `${schedule.summary}\n\n⏰ 事件时间：${schedule.time}\n🔔 提醒时间：${formatTime(remindTime)}`;
            
            const success = await sendPush(title, content);
            if (success) {
                schedule.notified = true;
                hasChanges = true;
                
                // 尝试显示系统通知
                self.registration.showNotification(title, {
                    body: schedule.summary,
                    icon: '/icon.png',
                    badge: '/badge.png',
                    tag: String(schedule.id)
                });
            }
        }
    }
    
    if (hasChanges) {
        await saveSchedules(schedules);
        
        // 通知所有客户端更新
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
            client.postMessage({ type: 'SCHEDULES_UPDATED' });
        });
    }
}

function formatTime(date) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
}

// 启动定时检查
let checkTimer = null;

function startPeriodicCheck() {
    // 先立即检查一次
    checkReminders();
    
    // 然后定时检查
    checkTimer = setInterval(checkReminders, CHECK_INTERVAL);
}

// 监听安装事件
self.addEventListener('install', (event) => {
    console.log('SW: 安装成功');
    self.skipWaiting();
    startPeriodicCheck();
});

// 监听激活事件
self.addEventListener('activate', (event) => {
    console.log('SW: 激活成功');
    event.waitUntil(self.clients.claim());
    startPeriodicCheck();
});

// 监听消息
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    // 收到同步请求
    if (event.data && event.data.type === 'SYNC_REQUEST') {
        checkReminders();
    }
});

// 监听通知点击
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    // 打开或聚焦网页
    event.waitUntil(
        self.clients.matchAll({ type: 'window' }).then((clients) => {
            // 如果已有窗口，聚焦它
            for (const client of clients) {
                if (client.url.includes('index.html') && 'focus' in client) {
                    return client.focus();
                }
            }
            // 否则打开新窗口
            return self.clients.openWindow('index.html');
        })
    );
});

// 定期唤醒（防止浏览器休眠）- 尝试使用 Background Sync
self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'check-reminders') {
        event.waitUntil(checkReminders());
    }
});

// 尝试注册周期性同步（需要权限）
async function registerPeriodicSync() {
    if ('periodicSync' in self.registration) {
        try {
            await self.registration.periodicSync.register('check-reminders', {
                minInterval: CHECK_INTERVAL,
                networkState: 'online'
            });
            console.log('SW: 周期性同步注册成功');
        } catch (e) {
            console.log('SW: 周期性同步注册失败', e);
        }
    }
}

// 初始化
startPeriodicCheck();
registerPeriodicSync();
