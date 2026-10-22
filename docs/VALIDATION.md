# 当前验证记录

最新正式设计接入版本的完整证据见 [V1.7验收报告](v17/REVIEW.md)。旧22项/41项版本报告已由此次记录替代；不要混用旧截图和旧数值。

- `npm test`：31项系统/动画 + 41项真实Chromium/WebGL检查通过。
- 七策略×50局、额外严格无强化50局；最终修复后的每策略5局复验单独记录，详见报告对测试版本的说明。
- 两种手机视口、300秒组合运行、32怪/160弹压力、重复重开资源回收、188条资源缓存和子目录离线启动均有证据。
- `npm run test:performance`：软件WebGL渲染与同步逻辑计时，**不是安卓真机FPS**。
- `npm run test:review`：自包含审查HTML的战斗、音频、词条图标和零额外网络资源请求；file://被环境策略阻止，安卓本地文件打开未测。

[浏览器结构化结果](v17/browser-results.json) · [系统TAP](v17/system-results.tap) · [性能](v17/performance-results.json) · [截图](v17/screenshots/)

GitHub远端Actions未执行；本地通过不表示PR检查、正式发布或安卓最终验收通过。
