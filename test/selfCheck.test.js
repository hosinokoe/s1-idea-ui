// 纯函数断言测试（node 运行，无框架）。
// 用法: node test/selfCheck.test.js
const assert = require("assert");
const {
  detectPageType,
  hashInt,
  sanitizeFileStem,
  escapeHtml,
  selfCheck,
} = require("../s1-idea.user.js");

// 页面类型判定
assert.strictEqual(detectPageType("/2b/forum-4-1.html", ""), "forum");
assert.strictEqual(detectPageType("/2b/forum.php", "?gid=1"), "forum");
assert.strictEqual(detectPageType("/2b/forum.php", ""), "forum");
assert.strictEqual(detectPageType("/2b/forum.php", "?mod=forumdisplay&fid=4"), "forum");
assert.strictEqual(detectPageType("/2b/thread-2290108-1-1.html", ""), "thread");
assert.strictEqual(detectPageType("/2b/forum.php", "?mod=viewthread&tid=1"), "thread");
assert.strictEqual(detectPageType("/2b/member.php", "?mod=logging"), "other");

// hashInt 稳定且落在区间内
assert.strictEqual(hashInt("abc", 6), hashInt("abc", 6));
assert.ok(hashInt("abc", 6) >= 0 && hashInt("abc", 6) < 6);
assert.notStrictEqual(hashInt("2290108", 1000000), hashInt("2290109", 1000000));

// 文件名清洗
assert.strictEqual(sanitizeFileStem("Hello / World?"), "Hello_World");
assert.strictEqual(sanitizeFileStem("   "), "untitled");
assert.strictEqual(sanitizeFileStem(""), "untitled");

// HTML 转义
assert.strictEqual(escapeHtml('<a href="x">&'), "&lt;a href=&quot;x&quot;&gt;&amp;");

// 脚本自带的自检
assert.strictEqual(selfCheck(), true);

console.log("all tests passed");
