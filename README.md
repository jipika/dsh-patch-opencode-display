# dsh-patch-opencode-display

> dsh-patch-opencode-display — DeepSeek Harness 插件

opencode-go 行内用量 pill 的显示修正：`5小时→5h`、隐藏 `Go·` 前缀、行内只留 5h 窗口（面板不受影响）。

作用域说明（0.2.1 起）：本补丁只处理 opencode-go 的 pill。`dsh-commandcode-go` 已把同等显示原生做进自己，补丁会按 pill 按钮的无障碍标签（`aria-label` 含 `CommandCode` 即跳过），两边不会互相干扰。

---

## ☕ 赞赏支持

如果 dsh-patch-opencode-display 对你的研究与测试有所帮助，欢迎请作者喝杯咖啡 ☕

<p align="center">
  <img src="assets/sponsor.jpg" width="260" alt="微信赞赏码" />
  <img src="assets/afdian_reward.jpg" width="200" alt="爱发电赞助码" />
</p>

<p align="center">
  <b>给项目点个 Star ⭐</b> 同样是对开发者最大的鼓励！
</p>
