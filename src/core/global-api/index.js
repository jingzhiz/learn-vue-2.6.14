/* @flow */

import config from "../config";
import { initUse } from "./use";
import { initMixin } from "./mixin";
import { initExtend } from "./extend";
import { initAssetRegisters } from "./assets";
import { set, del } from "../observer/index";
import { ASSET_TYPES } from "shared/constants";
import builtInComponents from "../components/index";
import { observe } from "core/observer/index";

import {
  warn,
  extend,
  nextTick,
  mergeOptions,
  defineReactive,
} from "../util/index";

/*
  # 初始化 Vue 的众多全局 API，比如：
  #   默认配置：Vue.config
  #   工具方法：Vue.util.xx
  #   Vue.set、Vue.delete、Vue.nextTick、Vue.observable
  #   Vue.options.components、Vue.options.directives、Vue.options.filters、Vue.options._base
  #   Vue.use、Vue.extend、Vue.mixin、Vue.component、Vue.directive、Vue.filter
*/
export function initGlobalAPI(Vue: GlobalAPI) {
  // config
  const configDef = {};
  // # Vue 的众多默认配置项
  configDef.get = () => config;
  if (process.env.NODE_ENV !== "production") {
    configDef.set = () => {
      warn(
        "Do not replace the Vue.config object, set individual fields instead."
      );
    };
  }
  Object.defineProperty(Vue, "config", configDef);

  // exposed util methods.
  // NOTE: these are not considered part of the public API - avoid relying on
  // them unless you are aware of the risk.
  Vue.util = {
    warn,
    extend,
    mergeOptions,
    defineReactive,
  };

  // # Vue.set / delete / nextTick
  Vue.set = set;
  Vue.delete = del;
  Vue.nextTick = nextTick;

  // 2.6 explicit observable API
  Vue.observable = <T>(obj: T): T => {
    observe(obj);
    return obj;
  };

  Vue.options = Object.create(null);
  // # 'component', 'directive', 'filter'
  ASSET_TYPES.forEach((type) => {
    Vue.options[type + "s"] = Object.create(null);
  });

  // this is used to identify the "base" constructor to extend all plain-object
  // components with in Weex's multi-instance scenarios.
  /* 将 Vue 构造函数挂载到 Vue.options._base 上 */
  Vue.options._base = Vue;

  // #  将 components 添加到 keepAlive 上
  extend(Vue.options.components, builtInComponents);

  initUse(Vue);
  initMixin(Vue);
  initExtend(Vue);
  // # Vue.component/directive/filter
  initAssetRegisters(Vue);
}
