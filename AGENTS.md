# Repository Guidelines

## 项目结构与模块划分
本仓库提供 Node.js 文件分片与合并能力，核心实现位于 `src/index.ts`，所有 TypeScript 源码均存放在 `src/`。执行 `npm run build` 后，编译产物（含 `.js` 与 `.d.ts`）会输出到 `dist/`，发布包仅暴露 `dist/`。测试资源位于 `test/`，其中 `data/` 存放示例文本与图像，`temp/` 为运行期临时目录，`test.filename.*.js` 利用 AVA 覆盖字符串与 Buffer 场景。

## 构建、测试与开发命令
- `npm install`：安装开发依赖（TypeScript、AVA 等），首次克隆后必须执行。
- `npm run clean`：通过 `rimraf` 清理 `dist/` 目录，准备干净的构建环境。
- `npm run build`：顺序执行 `npm run clean && tsc`，确保 `src/` 编译出的 `.js` 与 `.d.ts` 同步。
- `npm test`：执行 AVA 测试 `ava -v ./test/*.js`，默认基于已经构建好的 `dist/` 输出。
- `npm run prepublishOnly`：发布前钩子，依次运行 clean/build/test，阻止带有脏产物的包被发布。

## 编码风格与命名规范
源码使用 TypeScript，推荐启用严格类型检查，保持两空格缩进、单引号、无分号的 Standard 风格。命名遵循小驼峰函数、全大写常量的模式，类型命名使用大驼峰。新增配置请同步更新 `tsconfig.json` 与 `package.json`，避免引入未使用依赖。

## 测试指南
测试框架为 AVA，文件命名沿用 `test.<场景>.js`，断言覆盖 Buffer、字符串及平均分片等关键路径。新增 API 时请补充正向与异常分支，并在测试结束后清理 `test/temp` 中生成的文件。异步用例优先使用 `async/await` 与 `t.plan` 确保断言执行。

## 提交与拉取请求规范
请使用简洁祈使句格式提交信息（如 `refactor: update slice pipeline`），同一逻辑修改保持单次提交。拉取请求需包含变更摘要、测试结果（含 `npm run build && npm test`）以及相关 issue 链接；若调整构建或 API，请附命令示例便于复现。评审通过后再合并，避免直接推送主分支。

## 环境与依赖提示
当前最低版本要求为 Node.js 18，依赖主要为开发期工具链（TypeScript、AVA、@types/node）；运行时代码无额外依赖。离线开发请提前缓存 NPM 包。处理大文件时确保磁盘拥有足够空间，必要时调整 `opts.destPath` 指向自定义临时目录。
