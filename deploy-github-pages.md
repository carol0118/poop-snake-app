# GitHub Pages 发布

这个项目已经按静态站点方式组织，可以直接发布到 GitHub Pages。

建议仓库名：

- `poop-snake-app`

建议发布方式：

1. 在 GitHub 新建仓库 `poop-snake-app`
2. 把本地目录上传到该仓库
3. 进入 GitHub 仓库设置
4. 打开 `Settings > Pages`
5. `Source` 选择 `Deploy from a branch`
6. `Branch` 选择 `main`
7. `Folder` 选择 `/ (root)`

如果你想用 `docs/` 目录发布，也可以：

1. 先执行 `Copy-Item -Recurse * docs` 这种同步操作
2. 在 `Pages` 里选 `main` 分支的 `/docs`

推荐直接用根目录发布，最简单。
