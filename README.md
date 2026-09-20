# Stage1st · JetBrains / Darcula 外观

一个油猴（Tampermonkey / Violentmonkey）用户脚本，把 [Stage1st](https://stage1st.com/)（基于 Discuz! X3.5）的版块列表与帖子页换成 JetBrains IDE / Darcula 风格。仅改变外观，保留站点原有内容与交互。

灵感来自 [czm15053/linuxdo-idea-ui](https://github.com/czm15053/linuxdo-idea-ui)（那个脚本面向 Discourse 的 Linux DO；本脚本针对完全不同的 Discuz! 平台重写）。

## 功能特性

- 🌙 **Darcula 主题** — 默认深色 Darcula 配色，一键切换 IntelliJ Light，选择记忆在 `localStorage`
- 🧭 **IDE 菜单条** — 顶部注入 `File Edit View …` 风格假菜单栏与 Stage1st 品牌标
- 📖 **正文保持易读** — 只做配色与排版，**不把文字代码化**：正文用比例字体、舒适行距，仅真正的代码块 / 引用才用等宽字体
- 🖼️ **图片直接内联显示** — 自动把 Discuz! 懒加载图片（`file` / `zoomfile` / `data-original`）的真实地址写回，帖子图片无需悬浮即可看到，响应式适配宽度
- 📊 **状态栏** — 底部常驻 `UTF-8 · LF · Discuz! X3.5 · Darcula` 状态条

## 兼容站点

| 站点 | 地址 |
|------|------|
| Stage1st | stage1st.com |
| Saraba1st | bbs.saraba1st.com |

> 平台为 **Discuz! X3.5**，脚本使用标准 Discuz! DOM 选择器（`#threadlisttableid`、`tbody[id^="normalthread_"]`、`#postlist`、`.pct .t_f` 等）。

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/) 浏览器扩展
2. 下载或克隆本仓库
   ```bash
   git clone https://github.com/hosinokoe/s1-idea-ui.git
   ```
3. 打开 `s1-idea.user.js`，复制内容到扩展的「新建脚本」中，或直接拖入扩展安装
4. 访问任意 Stage1st 版块 / 帖子页，外观即被替换

## 使用方法

1. 安装后访问 [stage1st.com](https://stage1st.com/2b/forum.php)
2. 页面自动套用 Darcula IDE 外观
3. 点击顶部菜单栏右侧的 `Darcula` / `IntelliJ Light` 按钮切换明暗主题

## 项目结构

```
s1-idea-ui/
├── s1-idea.user.js     # 用户脚本主体（样式 + DOM 装饰逻辑 + 纯函数自检）
├── test/
│   └── selfCheck.test.js  # 纯函数断言测试（node 运行，无框架）
├── README.md
├── LICENSE
└── .gitignore
```

## 工作原理

- **页面类型判定** — `detectPageType()` 仅凭 URL（`forum-N-N.html` / `thread-N-N-N.html` / `mod=` 参数）判断当前是版块列表页还是帖子页，稳定且不依赖 DOM
- **样式覆盖** — 一段 `RAW_CSS` 用 CSS 变量定义 Darcula / IntelliJ Light 两套配色，通过根节点 class（`.s1-idea-dark`）切换
- **图片揭示** — 帖子页遍历 `<img>`，用 `pickRealImageSrc()` 从 `file` / `zoomfile` / `data-original` 里挑出真实地址写回 `src`，并清掉懒加载钩子，让图片直接内联显示
- **非 SPA 适配** — Discuz! 为整页刷新，脚本在 `DOMContentLoaded` 后套用一次，并挂一个节流的 `MutationObserver` 兜住异步加载（如置顶折叠展开）时的列表更新

## 已知限制

- **选择器依赖 Discuz! DOM 结构** — 若 Stage1st 更换模板或升级 Discuz! 大版本，部分选择器可能失效，需更新脚本中对应规则
- **图片揭示依赖 Discuz! 懒加载属性** — 靠 `file` / `zoomfile` / `data-original` 取真实地址；若模板改用其它懒加载机制则需补规则
- **仅改外观** — 不改变任何站点数据与交互逻辑

## 开发 / 测试

脚本内的纯函数（`detectPageType` / `pickRealImageSrc` / `escapeHtml`）带 node 断言自检：

```bash
node s1-idea.user.js        # 运行内置自检
node test/selfCheck.test.js # 运行测试文件
```

## 贡献

欢迎提 Issue 或 PR，尤其是选择器更新与新主题配色。

## License

MIT
