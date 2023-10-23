```js
├─ src                         // 主要源码所在位置，核心内容
│   ├─ compiler                // 模板编译相关文件，将 template 编译为 render 函数
│       ├─ codegen             // 把AST(抽象语法树)转换为Render函数
│       ├─ directives          // 生成Render函数之前需要处理的东西
│       ├─ parser              // 模板编译成AST
│   ├─ core                    // Vue核心代码，包括了内置组件、全局API封装、Vue实例化、响应式原理、vdom(虚拟DOM)、工具函数等等。
│       ├─ components          // 组件相关属性，包含抽象出来的通用组件 如：Keep-Alive
│       ├─ global-api          // Vue全局API，如Vue.use(),Vue.nextTick(),Vue.config()等，包含给Vue构造函数挂载全局方法(静态方法)或属性的代码。 链接：https://012-cn.vuejs.org/api/global-api.html
│       ├─ instance            // 实例化相关内容，生命周期、事件等，包含Vue构造函数设计相关的代码
│       ├─ observer            // 响应式核心目录，双向数据绑定相关文件。包含数据观测的核心代码
│       ├─ util                // 工具方法
│       └─ vdom                // 虚拟DOM相关的代码，包含虚拟DOM创建(creation)和打补丁(patching)的代码
│   ├─ platforms               // vue.js和平台构建有关的内容 不同平台的不同构建的入口文件也在这里 （Vue.js 是一个跨平台的MVVM框架）
│       ├── web                // web端 （渲染，编译，运行时等，包括部分服务端渲染）
│       │   ├── compiler       // web端编译相关代码，用来编译模版成render函数basic.js
│       │   ├── entry-compiler.js               // vue-template-compiler 包的入口文件
│       │   ├── entry-runtime-with-compiler.js  // 独立构建版本的入口，它在 entry-runtime 的基础上添加了模板(template)到render函数的编译器
│       │   ├── entry-runtime.js                // 运行时构建的入口，不包含模板(template)到render函数的编译器，所以不支持 `template` 选项，我们使用vue默认导出的就是这个运行时的版本。
│       │   ├── entry-server-basic-renderer.js  // 输出 packages/vue-server-renderer/basic.js 文件
│       │   ├── entry-server-renderer.js        // vue-server-renderer 包的入口文件
│       │   ├── runtime        // web端运行时相关代码，用于创建Vue实例等
│       │   ├── server         // 服务端渲染（ssr）
│       │   └── util           // 工具类相关内容
│       └─ weex                // 混合运用 weex框架 (一端开发，三端运行: Android、iOS 和 Web 应用) 2016年9月3日~4日 尤雨溪正式宣布以技术顾问的身份加盟阿里巴巴Weex团队， 做Vue和Weex的整合 让Vue的语法能跨三端
│   ├─ server                  // 服务端渲染相关内容（ssr）
│   ├─ sfc                     // 转换单文件组件（*.vue）
│   └─ shared                  // 共享代码 全局共享的方法和常量
```
