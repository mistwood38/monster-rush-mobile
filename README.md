# 怪潮突围 · Monster Rush

一款无需安装依赖的竖屏科幻生存射击小游戏，使用原生 HTML、CSS、Canvas 2D 与 JavaScript。支持安卓浏览器触控、离线 PWA 和 GitHub Pages 子目录部署。

## 本地运行

在仓库根目录启动任意静态 HTTP 服务（Service Worker 需要 HTTP 或 HTTPS）：

```sh
python3 -m http.server 8000
```

访问 `http://localhost:8000/`。操作方式：在画面上左右滑动移动战机，武器自动射击；右上角暂停。升级箱会从前方接近，移动拾取即可强化。页面失去焦点时自动暂停。

## GitHub Pages

`.github/workflows/deploy.yml` 会在 `main` 更新时通过 GitHub 官方 Pages Actions 发布仓库根目录。首次发布需要在仓库 **Settings → Pages → Build and deployment** 中选择 **GitHub Actions**。仓库地址为 `https://mistwood38.github.io/monster-rush-mobile/`。

## PWA 与存档

`manifest.webmanifest` 提供独立竖屏安装信息，`sw.js` 缓存游戏文件并在版本变化时清理旧缓存。最高分和音效开关保存在本机 `localStorage`。所有画面和简单音效由代码生成，不请求第三方资源。

## 验证

```sh
node --check game.js
```

浏览器可通过 360×800 竖屏使用；无头浏览器 smoke check 覆盖启动、移动模拟、暂停/继续、Boss 生成、升级反馈及 Service Worker 注册。
