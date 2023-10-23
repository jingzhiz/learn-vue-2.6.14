/* @flow */

import { toArray } from "../util/index";

/*
  # 定义 Vue.use，负责为 Vue 安装插件，做了以下两件事：
  #   1、判断插件是否已经被安装，如果安装则直接结束
  #   2、安装插件，执行插件的 install 方法
*/
export function initUse(Vue: GlobalAPI) {
  Vue.use = function (plugin: Function | Object) {
    // # 已经安装过的插件列表
    const installedPlugins =
      this._installedPlugins || (this._installedPlugins = []);
    // # 判断 plugin 是否已经安装，保证不重复安装
    if (installedPlugins.indexOf(plugin) > -1) {
      return this;
    }

    // additional parameters
    // # 将参数变为数组，并且将 Vue 构造函数作为第一个参数传入
    const args = toArray(arguments, 1);
    args.unshift(this);
    if (typeof plugin.install === "function") {
      // # 如果是对象，调用其 install 方法
      plugin.install.apply(plugin, args);
    } else if (typeof plugin === "function") {
      // # 如果是函数，执行本函数
      plugin.apply(null, args);
    }
    // # 将安装后的插件推入至插件列表中进行记录
    installedPlugins.push(plugin);
    return this;
  };
}
