# Stage1st · JetBrains / Darcula 外观

一个油猴（Tampermonkey / Violentmonkey）用户脚本，把 [Stage1st](https://stage1st.com/)（基于 Discuz! X3.5）的版块列表与帖子页换成 JetBrains IDE / Darcula 风格。仅改变外观，保留站点原有内容与交互。

灵感来自 [czm15053/linuxdo-idea-ui](https://github.com/czm15053/linuxdo-idea-ui)（那个脚本面向 Discourse 的 Linux DO；本脚本针对完全不同的 Discuz! 平台重写）。

## 功能特性

- 🌙 **Darcula 主题** — 默认深色 Darcula 配色，一键切换 IntelliJ Light，选择记忆在 `localStorage`
- 🧭 **IDE 菜单条** — 顶部注入 `File Edit View …` 风格假菜单栏；品牌区是两个可点主页：GitHub 仓库（`hosinokoe/s1-idea-ui`）与 Stage1st `2b` 版块
- 🌿 **版块列表 → Git Log** — 每个主题行标题前生成伪 git-graph 装饰线（泳道 / 颜色由 tid 哈希决定），营造 IDE 版本控制视图的味道
- 📑 **帖子页 → 编辑器标签页** — 帖子顶部注入编辑器 tab（文件名 = `帖子标题.java`）
- 💻 **帖子正文 → 代码编辑器** — 每楼正文渲染成带**行号 gutter** 的代码框：1 楼生成假 Java 头（`package` / `import` / Javadoc `@author @floor @since` / `public class 标题`），回帖变成 `void reply_作者_楼层() { … }` 方法；正文文字化为 `//` 注释行，真代码块夹在 `// ----- code -----` 之间，配语法高亮（关键字 / 字符串 / 方法名 / 注释）
- 🙈 **精简论坛头像** — 隐藏每楼左侧的头像与个人资料块（作者已折进代码框的类头），作者列收窄成一条窄栏（照搬参考脚本隐藏头像的思路）
- 🖼️ **图片折叠预览** — 图片渲染成一行 `// image` 注释，默认收起，**悬浮 / 聚焦 / 点击固定**才展开；预览图是原帖 `<img>` 的克隆（已由 Discuz 以正确 referer 加载），保证悬浮必出图
- 📊 **状态栏** — 底部常驻 `UTF-8 · 4 spaces · Java · Discuz! X3.5 · Darcula` 状态条

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
- **DOM 装饰** — 列表页用 `decorateThreadList()` 给主题行注入伪 git-graph SVG（`buildGitSvg` + `hashInt` 定泳道/颜色），帖子页用 `decorateThread()` 注入编辑器标签页（`sanitizeFileStem` 生成文件名）
- **正文代码化** — 帖子页 `syncCodeFrames()` 给每楼 `.t_f` 建一个「行号 gutter + 代码窗格」代码框并隐藏原正文：`buildHeaderLines()` 生成 1 楼类头 / 回帖方法头，`collectBodyLines()` 把正文文本转 `//` 注释行、`<pre>` 转代码块、`<img>` 转 `// image` 折叠行，`highlightCode()` 做正则语法着色
- **图片折叠** — 图片行默认收起，`bindCodeImageHover()` 处理点击固定，悬浮 / 聚焦即时预览由纯 CSS 负责；预览图是原帖 `<img>` 的克隆（原图已由 Discuz 以正确 referer 加载好，克隆比重新猜 URL 更可靠）
- **非 SPA 适配** — Discuz! 为整页刷新，脚本在 `DOMContentLoaded` 后套用一次，并挂一个节流的 `MutationObserver` 兜住异步加载（如置顶折叠展开）时的列表更新

## 已知限制

- **选择器依赖 Discuz! DOM 结构** — 若 Stage1st 更换模板或升级 Discuz! 大版本，作者 / 楼层 / 时间 / 正文选择器可能失效，需更新脚本中对应规则
- **语法着色是启发式** — `highlightCode()` 用正则做关键字 / 字符串 / 注释着色，非真正词法分析，复杂内容可能着色不准
- **图片默认收起** — 图片渲染成 `// image` 注释行，需悬浮 / 聚焦 / 点击才展开预览（照搬参考脚本的交互）
- **仅改外观** — 不改变任何站点数据与交互逻辑

## 开发 / 测试

脚本内的纯函数（`detectPageType` / `hashInt` / `sanitizeFileStem` / `sanitizeIdent` / `pickRealImageSrc` / `wrapPlainText` / `highlightCode` / `escapeHtml`）带 node 断言自检：

```bash
node s1-idea.user.js        # 运行内置自检
node test/selfCheck.test.js # 运行测试文件
```

## 贡献

欢迎提 Issue 或 PR，尤其是选择器更新与新主题配色。

## License

MIT
