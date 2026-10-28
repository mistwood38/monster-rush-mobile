# 样板资源与许可

本清单只描述 `?art=rebuild` 中实际加载的资源。所有 GLB 是真实网格和材质；生成图片只用于士兵基础色贴图。使用的第三方资源以各原始页面的许可为准，保留来源和作者，方便后续复核。

| 本地资源 | 来源与许可 | 已做处理和运行用途 |
| --- | --- | --- |
| `models/sentinel.glb` | [Sci-fi soldier，Irondust，CC0](https://opengameart.org/content/sci-fi-soldier) | 63 根骨骼，5,076 三角形；保留并编辑角色网格、UV 和法线，添加背包；项目补制 run、idle、shoot、hit、down、activate，持枪绑定右手。生成的基础色仍有接缝及与原法线不一致的风险。主角与所有职业暂共用母体。 |
| `models/stalker.glb`, `stalker-lod.glb` | [3D Horror Game Monster，City Building Game Art，CC0](https://opengameart.org/content/3d-horror-game-monster) | 原模型和 70 根骨骼；近景 3,584、远景 1,611 三角形。来源的跑动动作加上项目补制的 idle、attack、hit、down；普通、快速和远程怪暂共用这一族。 |
| `models/revenant.glb`, `revenant-lod.glb` | [Evil Cyborg，Irondust，CC0](https://opengameart.org/content/evil-cyborg) | 从旧版 FBX 中提取实际网格与 UV；项目新建 11 骨骼和动作。近景 2,061、远景 864 三角形。重甲、突击及精英怪暂共用这一族。 |
| `models/boss.glb` | 同 Evil Cyborg，CC0 | 在同一母体基础上制作独立 GLB，增加肩甲、尖刺和发光核心，3,837 三角形；并非独立雕刻的高精度 Boss。 |
| `models/weapon-*.glb` | 本项目制作 | 五种独立枪械网格，每把约 1,816–2,204 三角形；抓握原点位于局部原点、枪口位于局部 `(0,0,-1.04)`。六管重机枪尚无独立转动动画。 |
| `models/covered-car.glb` | [Covered Car，MP / Poly Haven，CC0](https://polyhaven.com/a/covered_car) | 原始 1K glTF 的网格与贴图直接打包为 GLB；12,592 三角形。游戏复用同一材质和几何三次，第一辆附实时火与烟。原文件地址及 MD5/SHA-256 见 [来源记录](covered-car-source.json)。 |
| `textures/asphalt_02_*`, `damaged_concrete_floor_*`, `rusty_metal_02_*` | [Poly Haven，CC0](https://polyhaven.com/license) | 原始 1K PBR 颜色、法线与粗糙度图；样板中大多数缩为 512 像素，沥青颜色 1024。用于道路、混凝土及金属。 |
| `textures/soldier-base-ai.png` | 本项目的生成式贴图编辑 | 仅是基于原 UV 的候选基础色，不是新模型、自动绑骨或骨骼动画。[制作说明](MATERIAL_PROMPT.md)。 |
| `assets/fonts/NotoSansSC-UI.woff` | [Noto Sans SC，SIL OFL 1.1](https://github.com/google/fonts/tree/main/ofl/notosanssc) | UI 所需字符子集，许可文件保存在 `assets/fonts/OFL-NotoSansSC.txt`。 |
| `vendor/three/addons/` | [Three.js，MIT](https://github.com/mrdoob/three.js/blob/master/LICENSE) | 与仓库自带 Three.js 一致的 r170 加载器、骨架工具和后处理；许可见 `vendor/three/LICENSE`。 |
| `assets/v17/` | 项目已有 V1.7 资源 | 宠物、奖励、词条、声音和部分特效仍由旧资源支持，来源与限制见 [原包审计](../v17/source-audit.json)。 |

## 重新制作

`tools/art/fetch_sources.py` 下载原模型与 PBR 地图并输出哈希，`tools/art/build_assets.py` 和 `build_weapons.py` 使用 Blender 4.3 Python 接口、NumPy < 2 和 Pillow 导出 GLB。上游的 ASCII FBX 使用脚本读取网格及 UV，骨架与权重是项目重建。`fetch_covered_car.py` 校验 Poly Haven 返回的 MD5 并打包 GLB；使用其 API 时按要求注明 Powered by Poly Haven。运行游戏本身不需要联网下载模型或 Python。

资源制作脚本采用 Python 3.11 和 `bpy==4.3.0`；导出结果应重新检查动作、UV、贴图、法线和许可证，不能仅凭生成成功视作可用。下载源文件是开发用途，下载源的服务可用性和原页面许可将来可能变化。
