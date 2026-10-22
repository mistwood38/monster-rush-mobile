# 当前开发入口

继续 `codex/horde-combat-rework`，不要重新从零开始。回退分支 `backup/final-road-squad-5b01820`；`codex/final-road-squad`仍保留原版。**不合并main，不正式发布。**

- [本轮实际画面、连续视频、逐阶段数据与限制](horde-review/REVIEW.md)
- [持续进度](../DEV_PROGRESS.md) · [剩余问题](../REMAINING_ISSUES.md)
- [四ZIP与V1.7正式设计审计](v17/REVIEW.md)

核心现在是GPU实例化的原创关节3D怪潮、骨骼编队与空间网格碰撞。队员、宠物、战甲、词条的正式数据/逻辑继续复用，别恢复32怪上限或旧的平面战士。

先看验收报告中的真实失败局和未验证项。下一步应是安卓硬件剖析、自然成长/真人试玩与美术精修；不要把纯逻辑或软件GPU测试数作为发行验收。
