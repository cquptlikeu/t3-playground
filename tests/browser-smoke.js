'use strict';

/*
 * 浏览器端冒烟测试（可选，需要本机安装 Chrome）：
 * 用 Node 内置模块启动静态服务器，通过 DevTools 协议驱动 headless Chrome，
 * 验证新增 / 完成 / 删除 / 刷新后持久化。无需安装任何 npm 依赖。
 *
 * 用法：node tests/browser-smoke.js
 * 自定义 Chrome 路径：CHROME_PATH=/path/to/chrome node tests/browser-smoke.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SERVER_PORT = Number(process.env.SMOKE_PORT || 8137);
const CDP_PORT = Number(process.env.SMOKE_CDP_PORT || 9333);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || '';
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function assert(condition, message) {
  if (!condition) throw new Error('ASSERTION FAILED: ' + message);
  console.log('  ok - ' + message);
}

function startServer() {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    const relative = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
    const filePath = path.join(ROOT, relative);
    if (!filePath.startsWith(ROOT + path.sep)) {
      res.writeHead(403);
      res.end('forbidden');
      return;
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(SERVER_PORT, '127.0.0.1', () => resolve(server)));
}

async function waitForTarget() {
  for (let i = 0; i < 100; i++) {
    try {
      const response = await fetch('http://127.0.0.1:' + CDP_PORT + '/json/list');
      const targets = await response.json();
      const page = targets.find((t) => t.type === 'page' && t.url.includes('index.html'));
      if (page && page.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch (error) {
      /* Chrome not ready yet */
    }
    await sleep(150);
  }
  throw new Error('Timed out waiting for the Chrome DevTools target');
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 0;
    this.pending = new Map();
    this.handlers = new Map();
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const entry = this.pending.get(message.id);
        if (!entry) return;
        this.pending.delete(message.id);
        if (message.error) entry.reject(new Error(message.method + ': ' + message.error.message));
        else entry.resolve(message.result);
      } else if (message.method) {
        (this.handlers.get(message.method) || []).forEach((handler) => handler(message.params));
      }
    };
  }

  send(method, params) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }

  on(method, handler) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(handler);
  }

  once(method) {
    return new Promise((resolve) => {
      const handler = (params) => {
        const list = this.handlers.get(method) || [];
        this.handlers.set(method, list.filter((h) => h !== handler));
        resolve(params);
      };
      this.on(method, handler);
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error('Page script error: ' + JSON.stringify(result.exceptionDetails.exception || result.exceptionDetails));
    }
    return result.result.value;
  }
}

async function main() {
  const chromePath = findChrome();
  if (!chromePath) {
    throw new Error('未找到 Chrome，请用 CHROME_PATH 环境变量指定浏览器可执行文件');
  }

  const server = await startServer();
  const userDataDir = path.join(os.tmpdir(), 'todo-smoke-profile-' + Date.now());
  const chrome = spawn(
    chromePath,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--remote-debugging-port=' + CDP_PORT,
      '--user-data-dir=' + userDataDir,
      '--window-size=1280,900',
      'http://127.0.0.1:' + SERVER_PORT + '/index.html',
    ],
    { stdio: 'ignore' }
  );

  let ws;
  try {
    const wsUrl = await waitForTarget();
    ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = () => reject(new Error('WebSocket connection failed'));
    });

    const cdp = new CDP(ws);
    const pageErrors = [];
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    cdp.on('Runtime.exceptionThrown', (params) => {
      pageErrors.push(params.exceptionDetails.text || 'unknown exception');
    });

    let pageReady = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        pageReady = await cdp.evaluate(
          'location.href.includes("index.html") && document.readyState === "complete" && !!document.querySelector("#empty-state")'
        );
      } catch (error) {
        pageReady = false;
      }
      if (pageReady) break;
      await sleep(100);
    }
    if (!pageReady) {
      throw new Error('App page did not initialize; current location: ' + (await cdp.evaluate('location.href')));
    }

    console.log('\n[1] Initial render');
    const initial = await cdp.evaluate(`({
      emptyVisible: !document.querySelector('#empty-state').hidden,
      listHidden: document.querySelector('#todo-list').hidden,
      count: document.querySelectorAll('.todo').length,
      summary: document.querySelector('#summary').textContent
    })`);
    assert(initial.emptyVisible === true, 'empty state is visible on first load');
    assert(initial.listHidden === true, 'todo list is hidden when empty');
    assert(initial.count === 0, 'no todo items initially');

    console.log('\n[2] Add / complete / delete via real DOM events');
    const flow = await cdp.evaluate(`(() => {
      const q = (s) => document.querySelector(s);
      const qa = (s) => [...document.querySelectorAll(s)];
      const add = (text) => {
        q('#todo-input').value = text;
        q('#todo-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      };
      const out = {};

      add('  写冒烟测试  ');
      out.afterFirstAdd = qa('.todo__text').map((el) => el.textContent);
      out.inputCleared = q('#todo-input').value === '';
      out.emptyHidden = q('#empty-state').hidden;
      out.summaryAfterAdd = q('#summary').textContent;

      add('第二条');
      out.countAfterSecondAdd = qa('.todo').length;

      qa('.todo__priority-select')[0].value = 'high';
      qa('.todo__priority-select')[0].dispatchEvent(new Event('change', { bubbles: true }));
      qa('.todo__priority-select')[1].value = 'medium';
      qa('.todo__priority-select')[1].dispatchEvent(new Event('change', { bubbles: true }));
      out.visiblePriorities = qa('.todo__priority').map((el) => el.textContent);
      qa('.todo__priority-select')[1].value = 'low';
      qa('.todo__priority-select')[1].dispatchEvent(new Event('change', { bubbles: true }));
      q('#priority-sort').value = 'priority';
      q('#priority-sort').dispatchEvent(new Event('change', { bubbles: true }));
      out.priorityOrder = qa('.todo__priority').map((el) => el.textContent);
      q('#priority-sort').value = 'manual';
      q('#priority-sort').dispatchEvent(new Event('change', { bubbles: true }));

      qa('.todo__checkbox')[0].click();
      out.firstDone = q('.todo').classList.contains('todo--done');
      out.summaryAfterToggle = q('#summary').textContent;

      qa('.todo__delete')[1].click();
      out.remainingTexts = qa('.todo__text').map((el) => el.textContent);
      out.summaryAfterDelete = q('#summary').textContent;
      out.storage = JSON.parse(localStorage.getItem('t3-todo-app.v1'));

      q('#todo-input').value = '   ';
      q('#todo-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      out.blankInputIgnored = qa('.todo').length === 1;
      return out;
    })()`);
    assert(flow.afterFirstAdd.length === 1 && flow.afterFirstAdd[0] === '写冒烟测试', 'first todo is added and trimmed');
    assert(flow.inputCleared === true, 'input is cleared after adding');
    assert(flow.emptyHidden === true, 'empty state hides after adding');
    assert(flow.countAfterSecondAdd === 2, 'second todo is added');
    assert(flow.visiblePriorities[0] === '高' && flow.visiblePriorities[1] === '中', 'high and medium priority badges render');
    assert(flow.priorityOrder[0] === '高' && flow.priorityOrder[1] === '低', 'priority sort puts high before low');
    assert(flow.firstDone === true, 'checkbox click marks the first todo done');
    assert(flow.summaryAfterToggle === '共 2 项，1 项未完成', 'summary counts only unfinished todos');
    assert(flow.remainingTexts.length === 1 && flow.remainingTexts[0] === '写冒烟测试', 'delete removes the clicked todo');
    assert(flow.summaryAfterDelete === '共 1 项，0 项未完成', 'summary updates after delete');
    assert(flow.storage.length === 1 && flow.storage[0].done === true && flow.storage[0].text === '写冒烟测试', 'localStorage holds the surviving todo');
    assert(flow.blankInputIgnored === true, 'blank input does not add a todo');

    console.log('\n[3] Reload persistence');
    const loaded = cdp.once('Page.loadEventFired');
    await cdp.send('Page.reload');
    await loaded;
    await cdp.evaluate('new Promise((resolve) => setTimeout(resolve, 150))');
    const afterReload = await cdp.evaluate(`({
      texts: [...document.querySelectorAll('.todo__text')].map((el) => el.textContent),
      done: document.querySelector('.todo') ? document.querySelector('.todo').classList.contains('todo--done') : null,
      summary: document.querySelector('#summary').textContent,
      emptyHidden: document.querySelector('#empty-state').hidden
    })`);
    assert(afterReload.texts.length === 1 && afterReload.texts[0] === '写冒烟测试', 'todo survives a page reload');
    assert(afterReload.done === true, 'completed state survives a page reload');
    assert(afterReload.emptyHidden === true, 'empty state stays hidden after reload');
    assert(afterReload.summary === '共 1 项，0 项未完成', 'summary is restored after reload');

    console.log('\n[4] Search filter');
    const search = await cdp.evaluate(`(() => {
      const q = (s) => document.querySelector(s);
      const qa = (s) => [...document.querySelectorAll(s)];
      const add = (text) => {
        q('#todo-input').value = text;
        q('#todo-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      };
      const type = (value) => {
        const el = q('#search-input');
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      const out = {};

      add('Buy Milk');
      add('写周报');
      out.countBeforeSearch = qa('.todo').length;

      type('milk');
      out.caseInsensitiveMatches = qa('.todo__text').map((el) => el.textContent);
      out.summaryMatched = q('#summary').textContent;
      out.emptyHiddenWhileMatching = q('#empty-state').hidden;
      out.clearVisible = !q('#search-clear').hidden;

      type('周报');
      out.chineseMatches = qa('.todo__text').map((el) => el.textContent);

      type('不存在的关键词');
      out.noMatchCount = qa('.todo').length;
      out.noMatchListHidden = q('#todo-list').hidden;
      out.noMatchEmptyVisible = !q('#empty-state').hidden;
      out.noMatchMessage = q('#empty-state').textContent;
      out.noMatchSummary = q('#summary').textContent;
      out.storageDuringSearch = JSON.parse(localStorage.getItem('t3-todo-app.v1')).length;

      q('#search-clear').click();
      out.afterClearCount = qa('.todo').length;
      out.afterClearValue = q('#search-input').value;
      out.afterClearSummary = q('#summary').textContent;
      out.afterClearEmptyHidden = q('#empty-state').hidden;
      out.afterClearClearHidden = q('#search-clear').hidden;
      out.afterClearStorage = JSON.parse(localStorage.getItem('t3-todo-app.v1')).length;

      type('milk');
      q('#search-input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      out.afterEscapeValue = q('#search-input').value;
      out.afterEscapeCount = qa('.todo').length;
      return out;
    })()`);
    assert(search.countBeforeSearch === 3, 'search starts from the full list');
    assert(search.caseInsensitiveMatches.length === 1 && search.caseInsensitiveMatches[0] === 'Buy Milk', 'search matches case-insensitively');
    assert(search.summaryMatched === '匹配 1 项，共 3 项', 'summary shows matched and total counts while searching');
    assert(search.emptyHiddenWhileMatching === true, 'empty state is hidden when the search has matches');
    assert(search.clearVisible === true, 'clear button appears while a search is active');
    assert(search.chineseMatches.length === 1 && search.chineseMatches[0] === '写周报', 'search matches Chinese keywords');
    assert(search.noMatchCount === 0 && search.noMatchListHidden === true, 'no results hides the list');
    assert(search.noMatchEmptyVisible === true, 'no results shows the empty state');
    assert(search.noMatchMessage === '没有匹配「不存在的关键词」的待办。', 'no-result message includes the keyword');
    assert(search.noMatchSummary === '匹配 0 项，共 3 项', 'summary reports zero matches');
    assert(search.storageDuringSearch === 3, 'filtering does not change stored data');
    assert(search.afterClearCount === 3, 'clearing the search restores the full list');
    assert(search.afterClearValue === '', 'clear button empties the search field');
    assert(search.afterClearSummary === '共 3 项，2 项未完成', 'summary returns to the total after clearing');
    assert(search.afterClearEmptyHidden === true, 'empty state stays hidden after clearing');
    assert(search.afterClearClearHidden === true, 'clear button hides when the search is empty');
    assert(search.afterClearStorage === 3, 'clearing the search leaves stored data untouched');
    assert(search.afterEscapeValue === '' && search.afterEscapeCount === 3, 'Escape clears the search and restores the full list');

    console.log('\n[5] Search and priority sorting together');
    const combined = await cdp.evaluate(`(() => {
      const q = (s) => document.querySelector(s);
      const qa = (s) => [...document.querySelectorAll(s)];
      const add = (text, priority) => {
        q('#priority-input').value = priority;
        q('#todo-input').value = text;
        q('#todo-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      };
      add('Task low', 'low');
      add('Task high', 'high');
      add('Task medium', 'medium');
      q('#search-input').value = 'task';
      q('#search-input').dispatchEvent(new Event('input', { bubbles: true }));
      q('#priority-sort').value = 'priority';
      q('#priority-sort').dispatchEvent(new Event('change', { bubbles: true }));
      const before = qa('.todo__text').map((el) => el.textContent);
      qa('.todo__checkbox')[0].click();
      const done = q('.todo').classList.contains('todo--done');
      const afterComplete = qa('.todo__text').map((el) => el.textContent);
      qa('.todo__delete')[2].click();
      const afterDelete = qa('.todo__text').map((el) => el.textContent);
      const storedCount = JSON.parse(localStorage.getItem('t3-todo-app.v1')).length;
      q('#search-clear').click();
      return {
        before,
        done,
        afterComplete,
        afterDelete,
        storedCount,
        afterClearCount: qa('.todo').length,
      };
    })()`);
    assert(combined.before.join('|') === 'Task high|Task medium|Task low', 'search results are sorted by priority');
    assert(combined.done === true && combined.afterComplete[0] === 'Task high', 'completion keeps the active search and sort');
    assert(combined.afterDelete.join('|') === 'Task high|Task medium', 'deletion keeps search and sort on remaining matches');
    assert(combined.storedCount === 5, 'search and sort do not remove non-matching todos from storage');
    assert(combined.afterClearCount === 5, 'clearing the search restores all remaining todos');

    assert(pageErrors.length === 0, 'no uncaught page exceptions (' + pageErrors.length + ')');
    console.log('\nSMOKE TEST PASSED');
  } finally {
    if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    chrome.kill();
    server.close();
    await sleep(300);
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch (error) {
      console.warn('(profile cleanup skipped: ' + error.code + ')');
    }
  }
}

main().catch((error) => {
  console.error('\nSMOKE TEST FAILED:', error.message);
  process.exitCode = 1;
});
