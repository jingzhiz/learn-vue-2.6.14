/* @flow */

import { mergeOptions } from "../util/index";

/*
  # 定义 Vue.mixin，负责全局混入选项，影响之后所有创建的 Vue 实例
  # 这些实例会合并全局混入的选项
*/
export function initMixin(Vue: GlobalAPI) {
  Vue.mixin = function (mixin: Object) {
    this.options = mergeOptions(this.options, mixin);
    return this;
  };
}
