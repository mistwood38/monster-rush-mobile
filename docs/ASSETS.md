# 美术来源与实际使用

## 用户上传包

仓库提交 abd994b 中的 `monster_rush_art_pack_v1.zip`（9,861,319 字节）。已实际解压、阅读 README_CN.md 与 asset_manifest.json，并检查四张图片。包内说明明确称其为第一批 AI 美术，**不是完整资产库**。

| 原始图片（路径位于压缩包内） | 运行资源 | 用途 |
|---|---|---|
| assets/characters/player_soldier_back.png | assets/characters/player_soldier_back.webp | 主角与队员分层精灵 |
| assets/backgrounds/highway_day.png | assets/backgrounds/highway_day.webp | 菜单背景、公路与城市配色参考 |
| assets/gates/fire_rate_plus_20.png | assets/gates/fire_rate_plus_20.webp | 对应实际 +20% 射速门的示例视觉，其他属性实时绘字 |
| reference/style_reference_only.png | 未用于运行 | 仅检查风格，不裁切或冒用其中角色、武器、UI |

WebP 按原图等比缩小并编码，原图保留在压缩包。原始清单路径不代表运行目录中还需要重复保存 PNG。

士兵来自单姿态图片：以三个 UV 区域拆成躯干和左右腿，用插值、摆动、倾斜和后坐表现动作。这**不是新的骨骼或完整逐帧动画**。原图中固定枪支仍可见，实际装备另有独立武器模型、枪口与弹丸变化；要达到干净的五套持枪姿态仍需补充拆分素材。

## 本项目原创补充

- `assets/enemies/*.svg`：七类原创敌人图（五基础、精英、Boss），用渐变描边、护甲、爪、核心、炮口区分；躯干与双腿使用分层 UV。
- `assets/pets/*.svg`：四种原创伙伴图标式角色。
- `assets/armors/*.svg`：三套原创护甲覆盖层；配合护盾、粒子、缩放和实际战斗技能。
- 道路、护栏、楼房、光束、爆炸与武器：原创运行时绘制/模型。
- 音乐、枪声：`audio.js` 合成的原创鼓、贝斯、和弦、旋律及噪声/音调分层，不从远端音频站加载。

SVG 本身就是可编辑源文件。没有复制商业游戏角色或打包商业素材。Three.js 是唯一运行库，MIT 原文随仓库保存。

## 待补资料

V1.7 全套设计、正式二十词条明细、专用敌人/伙伴动作帧、各武器干净持枪帧与战甲角色帧当前均不在已收到的包中。当前原创替补美术和设计不能声称已经达到这些尚未收到资料的验收要求。
