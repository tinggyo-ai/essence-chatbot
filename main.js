const path = require('path');
const fs   = require('fs');

// ── ELECTRON_RUN_AS_NODE 감지 시 올바른 환경으로 재실행 ──
const electronOrPath = require('electron');
if (typeof electronOrPath === 'string') {
    const { spawn } = require('child_process');
    const env = Object.assign({}, process.env);
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(electronOrPath, [__dirname], {
        env,
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
    });
    child.unref();
    process.exit(0);
}

const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, shell, safeStorage } = electronOrPath;
const crypto = require('crypto');
const os = require('os');

const GROQ_URL     = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL  = 'llama-3.1-8b-instant';
const VISION_MODEL   = 'meta-llama/llama-4-scout-17b-16e-instruct';

const SYSTEM_PROMPT = `당신은 Essence(AI Responsive Intelligence Assistant)입니다.
IT 기업에서 일하는 직원들의 전반적인 업무를 도와주는 친근한 AI 동료입니다.

[말투 & 태도]
- 항상 존댓말을 사용하고, 예의 바르고 친절하게 대화합니다.
- 딱딱하지 않고 따뜻하고 친근한 친구 같은 느낌으로 말합니다.
- 상황에 맞는 센스 있는 표현을 자연스럽게 씁니다.

[답변 원칙]
- 반드시 사실(팩트) 기반으로 답변하며, 불확실한 내용은 "확실하지 않지만"이라고 먼저 밝힙니다.
- 모르는 것은 모른다고 솔직하게 말합니다.
- 답변은 간결하고 핵심을 먼저 전달합니다.

[전문 분야]
- IT/개발, 기획, 마케팅, 인사, 총무, 회계 등 IT 기업의 전반적인 업무를 지원합니다.
- 문서 작성, 이메일 초안, 보고서, 회의록, 일정 관리, 아이디어 정리 등을 도와줍니다.
- 코드 리뷰, 기술 문서, 개발 관련 질문에도 답변합니다.

한국어로 대화합니다.`;

let win;
let tray;

const MARGIN       = 16;
const EXPANDED     = { w: 380, h: 560 };
const COLLAPSED    = { w: 92,  h: 120 };
const MIN_EXPANDED = { w: 320, h: 440 };

function clamp(n, min, max) { return Math.max(min, Math.min(n, max)); }

const legacyUserDataDir = path.join(__dirname, 'userdata');
const secureUserDataDir = path.join(app.getPath('appData'), 'Essence');
app.setPath('userData', secureUserDataDir);

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function migrateFileIfNeeded(name) {
    const oldPath = path.join(legacyUserDataDir, name);
    const newPath = path.join(app.getPath('userData'), name);
    if (!fs.existsSync(newPath) && fs.existsSync(oldPath)) {
        ensureDir(path.dirname(newPath));
        fs.copyFileSync(oldPath, newPath);
    }
}

function migrateDirIfNeeded(name) {
    const oldPath = path.join(legacyUserDataDir, name);
    const newPath = path.join(app.getPath('userData'), name);
    if (!fs.existsSync(newPath) && fs.existsSync(oldPath)) {
        fs.cpSync(oldPath, newPath, { recursive: true });
    }
}

['aria-settings.json', 'window-state.json', 'license.json'].forEach(migrateFileIfNeeded);
migrateDirIfNeeded('histories');

function isTrustedSender(event) {
    try {
        const senderUrl = event.senderFrame?.url || event.sender?.getURL?.() || '';
        return senderUrl.startsWith('file://') &&
            (senderUrl.endsWith('/index.html') || senderUrl.endsWith('/license.html'));
    } catch {
        return false;
    }
}

function guardEvent(event) {
    if (!isTrustedSender(event)) throw new Error('Blocked untrusted IPC sender');
}

function sendToRenderer(channel, ...args) {
    if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
}

function sanitizeString(value, max = 4000) {
    return typeof value === 'string' ? value.slice(0, max) : '';
}

function sanitizeModel(value, fallback = DEFAULT_MODEL) {
    const allowed = new Set(['llama-3.1-8b-instant', 'llama-3.3-70b-versatile', VISION_MODEL]);
    return allowed.has(value) ? value : fallback;
}

function sanitizeMessages(messages) {
    if (!Array.isArray(messages)) return [];
    return messages.slice(-30).map((m) => ({
        role: ['user', 'assistant', 'system'].includes(m?.role) ? m.role : 'user',
        content: sanitizeString(m?.content, 20000),
    })).filter((m) => m.content);
}

function sanitizeImageDataUrl(value) {
    if (typeof value !== 'string') return null;
    if (value.length > 8 * 1024 * 1024) return null;
    return /^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=\r\n]+$/i.test(value) ? value : null;
}

function sanitizeApiKey(value) {
    const key = sanitizeString(value, 300);
    return /^gsk_[A-Za-z0-9_-]{10,}$/.test(key) ? key : '';
}

function sanitizeHistoryTitle(value) {
    const title = sanitizeString(value, 80).replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim();
    return title || 'untitled';
}

const ALLOWED_EXTERNAL_ORIGINS = new Set([
    'https://console.groq.com',
    'https://groq.com',
]);

function openAllowedExternal(url) {
    let parsed;
    try { parsed = new URL(String(url)); } catch { return false; }
    if (parsed.protocol !== 'https:' || !ALLOWED_EXTERNAL_ORIGINS.has(parsed.origin)) return false;
    shell.openExternal(parsed.href);
    return true;
}

function encryptSecret(value) {
    if (!value) return '';
    if (safeStorage?.isEncryptionAvailable?.()) {
        return 'enc:v1:' + safeStorage.encryptString(String(value)).toString('base64');
    }
    return String(value);
}

function decryptSecret(value) {
    if (typeof value !== 'string') return '';
    if (!value.startsWith('enc:v1:')) return value;
    if (!safeStorage?.isEncryptionAvailable?.()) return '';
    try {
        return safeStorage.decryptString(Buffer.from(value.slice(7), 'base64'));
    } catch {
        return '';
    }
}

app.on('web-contents-created', (_, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
        openAllowedExternal(url);
        return { action: 'deny' };
    });
    contents.on('will-navigate', (event, url) => {
        if (!String(url).startsWith('file://')) event.preventDefault();
    });
});

function getPos(w, h) {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    return { x: width - w - MARGIN, y: height - h - MARGIN };
}

function settingsPath() {
    return path.join(app.getPath('userData'), 'aria-settings.json');
}
function loadSettings() {
    try {
        const data = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
        if (data.groqApiKey) data.groqApiKey = decryptSecret(data.groqApiKey);
        return data;
    } catch { return {}; }
}
function saveSettings(data) {
    const dir = app.getPath('userData');
    ensureDir(dir);
    const existing = loadSettings();
    const clean = {
        groqApiKey  : sanitizeApiKey(data?.groqApiKey || existing.groqApiKey),
        customPrompt: sanitizeString(data?.customPrompt, 4000),
        model       : sanitizeModel(data?.model),
        botName     : sanitizeString(data?.botName || 'Essence', 80),
        charId      : sanitizeString(data?.charId || 'robot', 40),
    };
    const stored = { ...clean, groqApiKey: encryptSecret(clean.groqApiKey) };
    fs.writeFileSync(settingsPath(), JSON.stringify(stored, null, 2));
}

function windowStatePath() {
    return path.join(app.getPath('userData'), 'window-state.json');
}
function loadWindowState() {
    try { return JSON.parse(fs.readFileSync(windowStatePath(), 'utf8')); }
    catch { return { w: EXPANDED.w, h: EXPANDED.h, x: null, y: null }; }
}
function saveWindowState(w, h) {
    const dir = app.getPath('userData');
    ensureDir(dir);
    try {
        const prev = JSON.parse(fs.readFileSync(windowStatePath(), 'utf8'));
        fs.writeFileSync(windowStatePath(), JSON.stringify({ w, h, x: prev.x ?? null, y: prev.y ?? null }));
    } catch {
        fs.writeFileSync(windowStatePath(), JSON.stringify({ w, h, x: null, y: null }));
    }
}
function saveCollapsedPos() {
    if (!win || win.isDestroyed()) return;
    const b = win.getBounds();
    try {
        const state = JSON.parse(fs.readFileSync(windowStatePath(), 'utf8'));
        fs.writeFileSync(windowStatePath(), JSON.stringify({ ...state, x: b.x, y: b.y }));
    } catch {
        const dir = app.getPath('userData');
        ensureDir(dir);
        fs.writeFileSync(windowStatePath(), JSON.stringify({ w: EXPANDED.w, h: EXPANDED.h, x: b.x, y: b.y }));
    }
}

// ── License ───────────────────────────────────────────────────────────
const LIC_PREFIX = 'ESS';
const LIC_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAu+ivtyhFPfZHRgaQPTyTfTSKMjU8ZZPZVmmGSJvMPp4=
-----END PUBLIC KEY-----`;

function licensePath() {
    return path.join(app.getPath('userData'), 'license.json');
}
function validateLicenseKey(key) {
    const raw = String(key || '').trim().replace(/\s/g, '');
    const match = raw.match(new RegExp(`^${LIC_PREFIX}-(\\d{4})\\.([A-Za-z0-9_-]+)$`));
    if (!match) return false;
    const [, serial, signature] = match;
    if (!/^\d{4}$/.test(serial)) return false;
    const n = parseInt(serial, 10);
    if (n < 1 || n > 1000) return false;
    try {
        return crypto.verify(
            null,
            Buffer.from(`${LIC_PREFIX}-${serial}`),
            crypto.createPublicKey(LIC_PUBLIC_KEY),
            Buffer.from(signature, 'base64url')
        );
    } catch {
        return false;
    }
}
function isLicenseActivated() {
    try {
        const data = JSON.parse(fs.readFileSync(licensePath(), 'utf8'));
        return data.activated === true && validateLicenseKey(data.key);
    } catch { return false; }
}
function saveLicense(key) {
    const dir = app.getPath('userData');
    ensureDir(dir);
    fs.writeFileSync(licensePath(), JSON.stringify({
        activated: true, key, date: new Date().toISOString(),
    }));
}

let isExpanded     = false;
let isDragging     = false;
let resizingByCode = false;
let lockedSize     = null;
let resizeSession  = null;

function lockWindowSize(w, h) {
    if (!win || win.isDestroyed()) return;
    lockedSize = { w, h };
    win.setResizable(false);
    win.setMinimumSize(w, h);
    win.setMaximumSize(w, h);
}
function unlockWindowSizeForBounds() {
    if (!win || win.isDestroyed()) return;
    win.setMaximumSize(32767, 32767);
    win.setMinimumSize(1, 1);
    win.setResizable(false);
}
function setLockedBounds(bounds) {
    if (!win || win.isDestroyed()) return;
    resizingByCode = true;
    try {
        unlockWindowSizeForBounds();
        win.setBounds(bounds);
        lockWindowSize(bounds.width, bounds.height);
    } finally {
        resizingByCode = false;
    }
}
function enforceLockedSize() {
    if (!win || win.isDestroyed() || resizingByCode || !lockedSize) return;
    const b = win.getBounds();
    if (b.width === lockedSize.w && b.height === lockedSize.h) return;
    resizingByCode = true;
    try {
        unlockWindowSizeForBounds();
        win.setBounds({ x: b.x, y: b.y, width: lockedSize.w, height: lockedSize.h });
        lockWindowSize(lockedSize.w, lockedSize.h);
    } finally {
        resizingByCode = false;
    }
}
function repaintCollapsedWindow() {
    if (!win || win.isDestroyed() || isExpanded) return;
    const b = win.getBounds();
    win.setBackgroundColor('#00000000');
    setLockedBounds({ x: b.x, y: b.y, width: COLLAPSED.w, height: COLLAPSED.h });
    win.webContents.invalidate();
}
function saveCurrentExpandedSize() {
    if (!win || win.isDestroyed() || !isExpanded) return;
    const b = win.getBounds();
    saveWindowState(b.width, b.height);
}
function lockCurrentWindowSize() {
    if (!win || win.isDestroyed()) return;
    const b = win.getBounds();
    lockWindowSize(b.width, b.height);
}
function startCustomResize(payload = {}) {
    if (!win || win.isDestroyed() || !isExpanded) return;
    const cursor = screen.getCursorScreenPoint();
    resizeSession = {
        sx: Number.isFinite(payload.sx) ? payload.sx : cursor.x,
        sy: Number.isFinite(payload.sy) ? payload.sy : cursor.y,
        bounds: win.getBounds(),
    };
    lockCurrentWindowSize();
}
function moveCustomResize(payload = {}) {
    if (!win || win.isDestroyed() || !isExpanded || !resizeSession) return;
    const cursor = screen.getCursorScreenPoint();
    const px = Number.isFinite(payload.sx) ? payload.sx : cursor.x;
    const py = Number.isFinite(payload.sy) ? payload.sy : cursor.y;
    const dx = px - resizeSession.sx;
    const dy = py - resizeSession.sy;
    const base = resizeSession.bounds;
    const right  = base.x + base.width;
    const bottom = base.y + base.height;
    const { x: ax, y: ay } = screen.getDisplayNearestPoint({ x: px, y: py }).workArea;
    const newX = clamp(base.x + dx, ax, right  - MIN_EXPANDED.w);
    const newY = clamp(base.y + dy, ay, bottom - MIN_EXPANDED.h);
    setLockedBounds({ x: newX, y: newY, width: right - newX, height: bottom - newY });
}
function endCustomResize() {
    if (!resizeSession) return;
    resizeSession = null;
    saveCurrentExpandedSize();
    lockCurrentWindowSize();
}

function showWindow() {
    if (!win) return;
    win.show();
    win.focus();
}

function setupTray() {
    const iconPath = path.join(__dirname, 'icon.png');
    const icon = fs.existsSync(iconPath)
        ? nativeImage.createFromPath(iconPath)
        : nativeImage.createEmpty();

    tray = new Tray(icon);
    tray.setToolTip('');
    tray.setContextMenu(Menu.buildFromTemplate([
        { label: 'Essence 열기', click: () => showWindow() },
        { type: 'separator' },
        { label: '종료',       click: () => app.quit() },
    ]));
    tray.on('click', () => showWindow());
}

function createMainWindow() {
    const ws = loadWindowState();
    const p  = (ws.x != null && ws.y != null) ? { x: ws.x, y: ws.y } : getPos(COLLAPSED.w, COLLAPSED.h);

    win = new BrowserWindow({
        width : COLLAPSED.w,
        height: COLLAPSED.h,
        x: p.x,
        y: p.y,
        frame          : false,
        transparent    : true,
        backgroundColor: '#00000000',
        hasShadow      : false,
        alwaysOnTop    : false,
        skipTaskbar    : true,
        resizable      : false,
        show           : false,
        webPreferences : {
            preload              : path.join(__dirname, 'preload.js'),
            contextIsolation     : true,
            nodeIntegration      : false,
            sandbox              : true,
            webSecurity          : true,
            backgroundThrottling : false,
        },
    });

    win.setAlwaysOnTop(true, 'floating');
    win.setIgnoreMouseEvents(true, { forward: true });

    win.setTitle('');
    win.loadFile('index.html');
    win.once('ready-to-show', () => win.show());
    win.on('page-title-updated', (e) => { e.preventDefault(); win.setTitle(''); });

    win.on('will-resize', (e) => {
        if (resizingByCode) return;
        e.preventDefault();
        enforceLockedSize();
    });
    win.on('resize', () => enforceLockedSize());

    setupTray();
}

function createLicenseWindow() {
    const licWin = new BrowserWindow({
        width: 440,
        height: 310,
        resizable: false,
        center: true,
        frame: true,
        title: 'Essence 라이센스 활성화',
        webPreferences: {
            preload         : path.join(__dirname, 'license-preload.js'),
            contextIsolation: true,
            nodeIntegration : false,
            sandbox         : true,
            webSecurity     : true,
        },
    });
    licWin.setMenuBarVisibility(false);
    licWin.loadFile('license.html');

    ipcMain.handle('validate-license', (event, key) => {
        guardEvent(event);
        const valid = validateLicenseKey(key);
        if (valid) saveLicense(key);
        return { valid };
    });
    ipcMain.on('license-activated', (event) => {
        guardEvent(event);
        licWin.close();
        createMainWindow();
    });
    licWin.on('closed', () => { if (!win) app.quit(); });
}

app.whenReady().then(() => {
    try { saveSettings(loadSettings()); } catch {}
    if (isLicenseActivated()) {
        createMainWindow();
    } else {
        createLicenseWindow();
    }
});

ipcMain.on('expand', (event) => {
    if (!isTrustedSender(event)) return;
    isExpanded = true;
    win.setIgnoreMouseEvents(false);
    const b = win.getBounds();
    const ws = loadWindowState();
    setLockedBounds({ x: b.x + b.width - ws.w, y: b.y + b.height - ws.h,
                      width: ws.w, height: ws.h });
});

ipcMain.on('collapse', (event) => {
    if (!isTrustedSender(event)) return;
    isExpanded = false;
    const b = win.getBounds();
    saveWindowState(b.width, b.height);
    setLockedBounds({ x: b.x + b.width - COLLAPSED.w, y: b.y + b.height - COLLAPSED.h,
                      width: COLLAPSED.w, height: COLLAPSED.h });
    repaintCollapsedWindow();
});

ipcMain.on('mouse-enter-robot', (event) => {
    if (!isTrustedSender(event)) return;
    win.setIgnoreMouseEvents(false);
    if (isExpanded) enforceLockedSize();
});
ipcMain.on('mouse-leave-robot', (event) => {
    if (!isTrustedSender(event)) return;
    if (isExpanded) return;
    if (!isDragging) repaintCollapsedWindow();
});

let dragOffset = null;
ipcMain.on('drag-start', (event, payload = {}) => {
    if (!isTrustedSender(event)) return;
    isDragging = true;
    win.setIgnoreMouseEvents(false);
    const b = win.getBounds();
    const cursor = screen.getCursorScreenPoint();
    const startX = Number.isFinite(payload.sx) ? payload.sx : cursor.x;
    const startY = Number.isFinite(payload.sy) ? payload.sy : cursor.y;
    dragOffset = { dx: startX - b.x, dy: startY - b.y };
});
ipcMain.on('drag-move', (event) => {
    if (!isTrustedSender(event)) return;
    if (!dragOffset) return;
    const cursor = screen.getCursorScreenPoint();
    const { x: ax, y: ay, width, height } = screen.getDisplayNearestPoint(cursor).workArea;
    const b = win.getBounds();
    const x = Math.max(ax, Math.min(Math.round(cursor.x - dragOffset.dx), ax + width  - b.width));
    const y = Math.max(ay, Math.min(Math.round(cursor.y - dragOffset.dy), ay + height - b.height));
    win.setPosition(x, y);
    enforceLockedSize();
});
ipcMain.on('drag-end', (event, payload = {}) => {
    if (!isTrustedSender(event)) return;
    isDragging = false;
    dragOffset = null;
    if (!isExpanded) {
        saveCollapsedPos();
        if (payload.overRobot) win.setIgnoreMouseEvents(false);
        else repaintCollapsedWindow();
    }
    setTimeout(() => win.webContents.invalidate(), 30);
});
ipcMain.on('release-mouse', (event) => {
    if (!isTrustedSender(event)) return;
    if (isExpanded) return;
    isDragging = false;
    dragOffset = null;
    repaintCollapsedWindow();
});
ipcMain.on('invalidate-window', (event) => {
    if (!isTrustedSender(event)) return;
    setTimeout(() => win.webContents.invalidate(), 30);
});

ipcMain.on('resize-window-start', (event, payload = {}) => { if (isTrustedSender(event)) startCustomResize(payload); });
ipcMain.on('resize-window-move',  (event, payload = {}) => { if (isTrustedSender(event)) moveCustomResize(payload); });
ipcMain.on('resize-window-end',   (event)               => { if (isTrustedSender(event)) endCustomResize(); });

ipcMain.handle('get-settings',  (event)       => { guardEvent(event); return loadSettings(); });
ipcMain.handle('save-settings', (event, data) => { guardEvent(event); saveSettings(data); return true; });

ipcMain.handle('get-auto-launch', (event) => {
    guardEvent(event);
    return app.getLoginItemSettings().openAtLogin;
});
ipcMain.handle('set-auto-launch', (event, val) => {
    guardEvent(event);
    app.setLoginItemSettings({ openAtLogin: val === true, path: process.execPath, args: [__dirname] });
    return true;
});

// Groq API 스트리밍
ipcMain.on('chat-stream', async (event, payload = {}) => {
    if (!isTrustedSender(event)) return;
    try {
        const apiKey = sanitizeApiKey(payload.apiKey);
        if (!apiKey) {
            sendToRenderer('chat-error', 'Invalid API key');
            return;
        }
        let finalModel    = sanitizeModel(payload.model);
        let finalMessages = sanitizeMessages(payload.messages);
        const image       = sanitizeImageDataUrl(payload.image);

        if (image) {
            finalModel = VISION_MODEL;
            const last = finalMessages[finalMessages.length - 1] || {};
            finalMessages = [
                ...finalMessages.slice(0, -1),
                {
                    role: 'user',
                    content: [
                        { type: 'image_url', image_url: { url: image } },
                        { type: 'text', text: last.content || '이 이미지를 분석해줘.' },
                    ],
                },
            ];
        }

        const res = await fetch(GROQ_URL, {
            method : 'POST',
            headers: {
                'Content-Type' : 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model   : finalModel,
                messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...finalMessages],
                stream  : true,
            }),
        });

        if (!res.ok) {
            const err = await res.text();
            sendToRenderer('chat-error', `Groq error (${res.status}): ${err}`);
            return;
        }

        const reader  = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();
            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const data = line.slice(6).trim();
                if (data === '[DONE]') { sendToRenderer('chat-done'); continue; }
                try {
                    const json = JSON.parse(data);
                    const chunk = json.choices?.[0]?.delta?.content;
                    if (chunk) sendToRenderer('chat-chunk', chunk);
                } catch {}
            }
        }
        sendToRenderer('chat-done');
    } catch (err) {
        sendToRenderer('chat-error', err.message);
    }
});

ipcMain.on('open-external', (event, url) => {
    if (!isTrustedSender(event)) return;
    openAllowedExternal(url);
});

// ── History (대화 요약 저장/불러오기) ──────────────────────────────
const historiesDir = () => path.join(app.getPath('userData'), 'histories');

ipcMain.handle('list-histories', (event) => {
    guardEvent(event);
    const dir = historiesDir();
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
        .filter(f => f.endsWith('.md'))
        .sort()
        .map(f => f.replace(/\.md$/, ''));
});

ipcMain.handle('save-history', (event, payload = {}) => {
    guardEvent(event);
    const dir = historiesDir();
    ensureDir(dir);
    const safe = sanitizeHistoryTitle(payload.title);
    fs.writeFileSync(path.join(dir, safe + '.md'), sanitizeString(payload.content, 200000), 'utf8');
    return true;
});

ipcMain.handle('load-history', (event, title) => {
    guardEvent(event);
    const safe = sanitizeHistoryTitle(title);
    const p = path.join(historiesDir(), safe + '.md');
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
});

ipcMain.handle('delete-history', (event, title) => {
    guardEvent(event);
    const safe = sanitizeHistoryTitle(title);
    const p = path.join(historiesDir(), safe + '.md');
    if (fs.existsSync(p)) fs.unlinkSync(p);
    return true;
});

ipcMain.handle('summarize-chat', async (event, payload = {}) => {
    guardEvent(event);
    const apiKey = sanitizeApiKey(payload.apiKey);
    if (!apiKey) throw new Error('Invalid API key');
    const messages = sanitizeMessages(payload.messages);
    const model = sanitizeModel(payload.model);
    const res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
            'Content-Type' : 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                ...messages,
                { role: 'user', content: '지금까지의 대화를 인수인계 문서 형식으로 요약해주세요. 다음 세션에서 AI가 맥락을 빠르게 파악할 수 있도록 핵심 주제, 중요한 결정사항, 진행 중인 작업, 이어서 논의할 내용을 마크다운 형식으로 간결하게 정리해주세요.' },
            ],
            stream: false,
        }),
    });
    if (!res.ok) throw new Error(`Groq 오류 (${res.status}): ${await res.text()}`);
    const data = await res.json();
    return data.choices[0].message.content;
});

ipcMain.handle('transcribe-audio', async (event, payload = {}) => {
    guardEvent(event);
    const apiKey = sanitizeApiKey(payload.apiKey);
    if (!apiKey) throw new Error('Invalid API key');
    const base64 = sanitizeString(payload.base64, 40 * 1024 * 1024);
    const mimeType = /^audio\/[-+.\w]+$/.test(payload.mimeType || '') ? payload.mimeType : 'audio/mpeg';
    const filename = sanitizeHistoryTitle(payload.filename || 'audio');
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length > 25 * 1024 * 1024) throw new Error('Audio file is too large');
    const blob   = new Blob([buffer], { type: mimeType });
    const form   = new FormData();
    form.append('file', blob, filename);
    form.append('model', 'whisper-large-v3');
    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method : 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body   : form,
    });
    if (!res.ok) throw new Error(`Whisper 오류 (${res.status}): ${await res.text()}`);
    const data = await res.json();
    return data.text;
});

ipcMain.on('uninstall', (event) => {
    if (!isTrustedSender(event)) return;
    const installDir = __dirname;

    // 개발 환경(C:\chatbot 등)에서 실수로 실행되는 것을 방지
    const normalized = installDir.replace(/\//g, '\\').toLowerCase();
    if (normalized !== 'c:\\essence') {
        sendToRenderer('chat-error',
            '⚠️ 언인스톨은 C:\\Essence 에 정식 설치된 경우에만 사용 가능합니다.\n현재 경로: ' + installDir);
        return;
    }

    const tempScript = os.tmpdir() + '\\essence_remove.bat';
    const script = [
        '@echo off',
        'timeout /t 8 /nobreak > nul',
        `rmdir /S /Q "${installDir}" 2>nul`,
        'timeout /t 3 /nobreak > nul',
        `if exist "${installDir}" rmdir /S /Q "${installDir}" 2>nul`,
        `if exist "%USERPROFILE%\\Desktop\\Essence.lnk" del "%USERPROFILE%\\Desktop\\Essence.lnk"`,
        `if exist "%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Essence" rmdir /S /Q "%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Essence"`,
        'reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Essence" /f >nul 2>&1',
        'del "%~f0"',
    ].join('\r\n');
    fs.writeFileSync(tempScript, script, 'utf8');
    const { spawn } = require('child_process');
    spawn('cmd', ['/c', tempScript], { detached: true, stdio: 'ignore' }).unref();
    app.quit();
});

ipcMain.on('quit', (event) => {
    if (isTrustedSender(event)) app.quit();
});

app.on('before-quit', () => { saveCurrentExpandedSize(); if (!isExpanded) saveCollapsedPos(); });
app.on('window-all-closed', () => {});

process.on('uncaughtException', (err) => {
    console.error('[Essence 오류]', err.message);
});
