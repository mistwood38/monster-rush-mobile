# 怪潮突围 · Monster Rush V2.0

第三人称竖屏 3D 怪潮生存射击。用左右滑动沿道路移动；战士会自动锁定并开火。穿越左右强化门选择独立战斗属性，射击门体可为奖励充能；拾取实体补给箱可立即切换五种攻击模式。首领攻击会先标记危险区域，横向移动可以躲避。

## 本地运行

游戏不需要构建工具。仓库根目录运行：

```sh
python3 -m http.server 8000
```

访问 `http://localhost:8000/`。Three.js r170 以本地模块形式随仓库发布；音乐与武器音效由 Web Audio API 在玩家点击开始后合成。最高分与两路音量储存在本机。

## GitHub Pages 与离线安装

`.github/workflows/deploy.yml` 在 `main` 更新时发布静态站点。首次启用 Pages 时在仓库 **Settings → Pages → Build and deployment → GitHub Actions** 选择 GitHub Actions。网页、Three.js、清单和图标均使用相对路径，适配 `/<repository>/` 子目录。Service Worker 会缓存本地脚本及 Three.js 模块，并在版本升级后清除旧缓存。

## Three.js 许可

随附 `vendor/three/three.module.min.js` 来自 Three.js `0.170.0`（r170），依照 MIT License 发布；许可文本见 `vendor/three/LICENSE`。游戏角色、道路与低多边形场景由项目代码原创程序生成。

## 质量检查

`node --check game.js` 与 `node --check audio.js` 可检查脚本语法。添加 `?test=1` 后，页面会暴露浏览器内自动化用的测试接口；该模式用于检查战斗属性、武器、奖励门、敌人 AI、Boss 与音频控制，不影响正常游玩。
