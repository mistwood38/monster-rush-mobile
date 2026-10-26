# 美术重建执行记录

分支：codex/art-rebuild-vertical-slice。基线 faf5225。main、既有怪潮分支和正式站点不修改。

## 已核查

- 交接中的 adee1e3 之后，怪潮分支新增 faf5225，仅记录美术方向。
- 现有 V1.7 四包没有 GLB/GLTF/FBX/BLEND；部分帧由共同母版处理，不能作为专业独立骨骼动画。
- 当前 actors3d.js 是程序低面数人体与怪物，horde.js 保留 GPU 批绘及空间网格；systems.js / config 中的玩法应保留。
- 已读取 docs/art-direction/ART_DIRECTION.md、v17 来源审计和 horde/growth/optimization 报告；四张用户参考是视觉目标，而非可直接贴进战场的运行资源。

## 本轮路线

将 Irondust 的 CC0 Sci-fi soldier、Evil Cyborg 和 HorrorGameMaker 的 CC0 3D Horror Game Monster 转为本地 GLB，保留 UV/法线并补制动作；采用 Poly Haven CC0 路面/混凝土/金属纹理。资源出处、哈希、修改和动作缺口逐项记录。怪潮以 GPU 骨骼姿态纹理合批，远景 LOD；主角与队员保留真正骨骼动画和枪口绑定。样板通过 ?art=rebuild 进入，旧版仍可回退。

## 执行状态

恢复执行时临时工作区已重置。上一轮未推送的 GLB、代码与截图不能当作现存交付；正从已核查来源恢复。此检查点仅证明接手、审查与分支落地，**不表示美术样板、测试、真机性能或视觉验收完成**。最终报告将列出真正存在并运行验证的文件。

## 验收约束

必须有 1 主角 + 2 职业队员、2 种独立敌人、独立 Boss、可运行高架环境、实时射击/命中特效、真实截图和连续录像。测试注入与自然游玩分开；软件 GPU 结果不得冒充安卓帧率。只有资产、集成和画面达到目标才能扩展全面替换，不能以测试条数宣布美术达标。
