## 调试流程

### 前置条件
vscode安装`Live Server`插件, 高效调试html页面
vscode安装`Better Comments`插件, 以便于高亮显示注释

### 调试准备
1. 通过`yarn`下载依赖, 下载至安装一些测试工具包时可直接`ctrl c`中断下载, 不影响调试
2. 添加`sourcemap`, 可以在package.json文件里script脚本中dev命令后添加 `--sourcemap`, 或者在scripts文件夹下找到config.js文件, 在genConfig函数中手动给config添加`sourceMap: true`
3. 在examples中创建一个自己用于调试的代码文件夹, 写入一个index.html, 然后通过script标签引入dist文件夹中打包后的Vue源码
4. 执行`yarn run dev`, 这样更改Vue源码后, 将重新生成最新的打包文件
5. 在index.html写入自己想要的案例, 使用`Live Server`插件启动网页, 即可开始调试Vue
