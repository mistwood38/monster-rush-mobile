# 怪潮突围 Monster Rush · Codex 开工资料 V1.7

> 本分支 `codex-assets-v1.7` 仅供 Codex 获取资料；`main` 保留原有线上 V2.1，不要直接修改或部署 `main`。

## 资料放置位置

请将下面四个 ZIP 上传到**当前文件夹** `codex_delivery/v1.7/`（不是上传到 Codex 对话）：

1. `01_设计和基础文件_V1.7.zip` — 8,613,818 bytes；正式设计、指令、数值配置、V1.3 可玩参考及技术说明。
2. `02_运行时图片资源_V1.7.zip` — 19,906,514 bytes；721 张 WebP 运行时素材等。
3. `03_职业独立造型_V1.7.zip` — 11,833,601 bytes；职业角色造型和动作候选。
4. `04_动画演示预览_V1.7.zip` — 18,816,945 bytes；浏览器动画、视觉审查页面等。

四包合计约 59.17 MB（按十进制），**每包均低于 GitHub 网页单文件 25 MiB 上限**。四包同时存储在仓库中，不受 Codex 对话附件总额 50 MB 的限制。

## 上传后让 Codex 执行

1. 使用仓库 `mistwood38/monster-rush-mobile`，从 `codex-assets-v1.7` 分支获取四个 ZIP。
2. **先检查四个 ZIP 实际都已提交；缺包不得假装读取。**
3. 完全解压四包到同一工作目录，保留内部路径。它们互不冲突，仅顶层 `READ_FIRST_THIS_PART.txt` 在多包中重复，该提示文件可忽略覆盖。
4. 阅读解压后的 `00_Codex_复制执行指令.md`、`README_上传说明_CN.md`、`01_正式游戏设计` 及美术资源动画清单。
5. 对照已有 Three.js V2.1 代码，开发真正的竖屏 2.5D 游戏，复用可用模块。
6. 在另一个专用开发分支工作；持续提交代码和自动化测试；不要合并或发布到 `main`。
7. 最终提交 PR、真实运行截图、测试记录及缺陷清单；安卓真机未测试时必须如实说明。

**注意：** 美术包包含可运行候选资产，并非所有独立人物动作都已达到发行级原画品质；不要把静态演示误当完整游戏。

### 本地解压示例

```bash
mkdir -p /tmp/monster-rush-codex-assets
for z in codex_delivery/v1.7/*.zip; do
  unzip -o "$z" -d /tmp/monster-rush-codex-assets
done
```

## 各包 SHA-256

```text
29c4dbb5d00745d848d4b05c3fc517746b44a5f75388510a7d218ac8e1391cf3  01_设计和基础文件_V1.7.zip
98ad3f23a1561645898f8f185203b6fe32573bd72d8369bafd8abbe585d2b96e  02_运行时图片资源_V1.7.zip
fa2a31fd939df26aaa0053e7c4f15171eca85190e72be7cd71d8faf4a74029c3  03_职业独立造型_V1.7.zip
7159aa33019e79fb13e21705be783f838d2a9cdeb92fb239d0c4771a8a13b075  04_动画演示预览_V1.7.zip
```
