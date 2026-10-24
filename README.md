# 怪潮突围 · Monster Rush

安卓竖屏 2.5D 公路编队射击游戏，Three.js r170、原生 JavaScript、离线 PWA，无后端或运行时 CDN。

**当前是 `codex/horde-combat-rework` 怪潮重做审查分支。回退点 `backup/final-road-squad-5b01820`；不合并 main、不正式发布。**

[上一轮实际截图、怪潮视频、逐阶段CSV与完整报告](docs/horde-review/REVIEW.md)。已改为骨骼3D人物、GPU关节实例怪潮及空间网格碰撞，普通敌人预算320。安卓真机和发行美术尚未验收。

[上一轮优化：远景几何分级、主角遮挡提示、拾取与远程齐射修正](docs/optimization-review/REVIEW.md)。

[最新优化：修复正常流程缺失的射速/弹丸奖励、减少血条遮挡、保护Boss警告](docs/growth-review/REVIEW.md)。

本次已从 `codex-assets-v1.7/codex_delivery/v1.7/` 读取四包，并按正式设计替换此前的临时规则。来源、哈希、原包设计与美术限制保存于 [docs/v17](docs/v17/)。

- 左右相对拖动、自动瞄准射击；所有敌人突破防线都会造成惩罚。
- 数字门二选一、有限射击充能，独立强化弹道、追加弹丸、射速、弹速与伤害。
- 主角加四名持续队员；突击、重火力、护卫按正式 HP/DPS 晋升，阵亡后可补员。护卫持轻型步枪，不沿用旧版霰弹配置。
- 步枪、机枪、霰弹、范围等离子与穿透激光有不同弹丸、真实手部绑定的3D枪械、枪口特效与本地音效。
- 四种三级宠物；更换继承槽位等级及冷却比例，技能需有效目标。
- 三套约12秒战甲；实际开启高级补给后有限随机掉落和四次保底，重复转维修，结束恢复原有武器属性。
- 正式二十词条，最多四槽、两级；约43/78/145/215秒三选一，可升级、替换或跳过。次生伤害不递归触发连锁。
- 招募、宠物选择、击破运输车与精英悬赏事件；95/180/270秒 Boss 节点，护盾重组、扩散齐射、侧翼冲击波与增援。
- 记录、音量、触觉开关本地保存，无永久数值升级。

## 查看与验证

```sh
python3 -m http.server 4173 --bind 0.0.0.0
```

在运行服务器的机器打开 `http://localhost:4173/`。这不是公网地址。安卓 PWA 安装需 HTTPS；当前正式 Pages 地址仍是 main 的旧版本。

```sh
npm ci
npx playwright install chromium
npm test
```

也可指定 `CHROMIUM_PATH=/usr/bin/chromium`。测试自带服务器，从 `/monster-rush-mobile/` 子目录执行真实 WebGL、触控、战斗、存档及离线测试，产物写入 `test-results/`。只有 `?test=1` 开放测试接口。Playwright 仅是开发依赖。

## 文件与交付

- [继续工作入口](DEV_PROGRESS.md) · [本轮验收报告](docs/horde-review/REVIEW.md) · [剩余问题](REMAINING_ISSUES.md)
- `game.js`：道路世界、战斗、敌人/Boss、输入与 UI；`systems.js`：正式本局数值逻辑。
- `actors3d.js`：13骨骼战士/职业/战甲、原创建模、GPU关节怪物；`horde.js`：0–300秒及后续曲线、空间网格、质量档。
- `sprites.js` / `sprite-state.mjs`：复用宠物/局部VFX与动作优先级，不逐帧上传贴图。
- `config/balance-v17.js` / `config/catalog.js`：正式数值和中文显示。
- `assets/v17/`：使用的本地资源、29个音频、图集清单。来源见 [素材说明](docs/ASSETS.md)。
- `tools/import-v17.py`：从四包合并目录重建图集，需 Pillow；游戏运行不依赖 Python。
- `sw.js` / `v17-cache.js`：版本缓存、离线资源。`.github/workflows/deploy.yml` 保持只在 main 更新或手动执行时部署，本次不触发。

资源包本身明确标注：部分动作是程序处理的候选帧，三职业并非全部独立手绘，尚不满足发行美术完整度。功能测试通过不等于安卓真机、最终画师验收或长期流派平衡全部通过。

自包含审查文件可通过 `npm run build:review` 生成到 `test-results/monster-rush-review.html`，不需复制游戏代码、不依赖外部图片或音频服务。`npm run test:review` 验证其可运行及零额外资源请求。此文件没有PWA安装功能；安卓本地文件打开尚未实测，不能把它当作已发布的网址。

本轮测试：`npm test`（系统/空间网格/浏览器/战甲倒地）、`npm run test:balance`（默认21组×5种子；可用`HORDE_SEEDS=3`缩减）、`npm run test:horde-realtime`（至少真实5分钟的HP恢复诊断）、`npm run test:performance`（请隔离运行）、`npm run test:horde-showcase`、`npm run test:horde-fixtures`、`npm run test:horde-visual`。产物在`test-results/horde/`。旧版控制器脚本仍可通过`test:balance:legacy-controller`使用，其历史数据不代表本轮。

[自包含审查ZIP](review/monster-rush-horde-review.zip)只包含HTML与说明，不是已发布站点；安卓本地文件打开未经验证。
