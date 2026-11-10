# 待办事项（Todo List）

一个零依赖的待办事项 Web 应用，使用原生 HTML / CSS / JavaScript 编写，用于验证 T3 Code 的开发工作流（实现 → 检查 → 汇报）。

## 功能

- 新增待办：输入内容后按 Enter 或点击「添加」
- 完成 / 取消完成：勾选左侧复选框，已完成事项显示删除线
- 删除待办：点击右侧「删除」按钮
- 数据持久化：使用 `localStorage`，刷新页面后列表与完成状态保留
- 统计信息：显示总条数与未完成条数；无数据时显示空状态
- 输入处理：自动去除首尾空格、空输入不新增、单条最长 200 字符
- 容错：本地数据损坏时自动忽略非法条目；存储不可用时在页面提示

## 目录结构

```
.
├── index.html          页面结构
├── styles.css          页面样式
├── app.js              DOM 交互与渲染
├── store.js            状态逻辑 + localStorage 持久化（UMD，可在 Node 中测试）
├── tests/
│   ├── store.test.js   状态逻辑单元测试（Node 内置 test runner）
│   └── browser-smoke.js 浏览器端冒烟测试（可选，需要 Chrome）
└── README.md
```

## 运行方法

项目是纯静态页面，没有任何构建步骤和第三方依赖。

**方式一：直接打开**

双击 `index.html`，用桌面浏览器打开即可。脚本使用传统 `<script>` 加载（非 ES Module），因此 `file://` 协议下也能正常运行。

**方式二：本地静态服务器（推荐）**

```bash
# 在项目根目录执行
python3 -m http.server 8000
# Windows 可用: py -m http.server 8000
```

然后访问 <http://localhost:8000/>。

> 现代桌面版 Chrome / Edge / Firefox / Safari 均可。个别浏览器会限制 `file://` 下的 `localStorage`，此时请使用方式二。

## 测试方法

### 1. 单元测试（Node 18+，无依赖）

```bash
node --test tests/store.test.js
```

覆盖内容：创建校验与截断、新增/切换/删除的不可变性、未完成计数、保存与读取往返、损坏 JSON 容错、非法条目清洗、存储读写异常向上抛出。

### 2. 浏览器冒烟测试（可选，需要本机安装 Chrome 或 Edge）

```bash
node tests/browser-smoke.js
# 如自动检测不到浏览器，可指定路径：
CHROME_PATH="/path/to/chrome" node tests/browser-smoke.js
```

该脚本仅使用 Node 内置模块：临时启动静态服务器，通过 DevTools 协议驱动 headless Chrome，自动验证：

- 首次加载的空状态
- 新增（含首尾空格去除、空输入忽略、输入框清空）
- 勾选完成、删除、统计数字
- `localStorage` 中的实际数据
- 刷新页面后列表与完成状态恢复
- 页面无未捕获异常

### 3. 手动验收清单

- [ ] 输入内容按 Enter 能新增一条待办
- [ ] 勾选复选框后文字变灰并加删除线，再次点击可取消
- [ ] 点击「删除」只移除对应那一条
- [ ] 刷新页面后列表和完成状态都还在
- [ ] 只输入空格不会新增
- [ ] 打开 DevTools → Application → Local Storage，能看到键 `t3-todo-app.v1`

## 数据存储

- 键名：`t3-todo-app.v1`
- 值：JSON 数组，每项结构如下：

```json
{
  "id": "0f1c2b3a-...",
  "text": "写周报",
  "done": false,
  "createdAt": 1762732800000
}
```

读取时会校验每个字段，丢弃非法条目；JSON 损坏时按空列表处理。

## 说明

- 不使用任何前端框架、构建工具或第三方依赖。
- `store.js` 采用 UMD 包装：浏览器中暴露 `window.TodoStore`，Node 测试中通过 `require` 加载同一份代码。
- 项目未执行任何 Git 提交或推送。
