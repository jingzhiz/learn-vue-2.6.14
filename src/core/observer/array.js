/*
 * not type checking this file because flow doesn't play well with
 * dynamically accessing methods on Array prototype
 */

import { def } from "../util/index";

// # 备份数组原型对象
const arrayProto = Array.prototype;
export const arrayMethods = Object.create(arrayProto);

// # 操作数组的七个方法，这七个方法可以改变数组自身
const methodsToPatch = [
  "push",
  "pop",
  "shift",
  "unshift",
  "splice",
  "sort",
  "reverse",
];

/**
 * Intercept mutating methods and emit events
 */
// # 拦截可变的这些方法，并执行
methodsToPatch.forEach(function (method) {
  // cache original method
  const original = arrayProto[method];
  def(arrayMethods, method, function mutator(...args) {
    // # 执行方法
    const result = original.apply(this, args);
    const ob = this.__ob__;
    let inserted;
    // # 如果是以下三个方法，则表示插入新元素
    switch (method) {
      case "push":
      case "unshift":
        inserted = args;
        break;
      case "splice":
        inserted = args.slice(2);
        break;
    }
    // # 对插入的新元素做响应式处理
    if (inserted) ob.observeArray(inserted);
    // notify change
    // # 通知依赖改变
    ob.dep.notify();

    // # 返回结果
    return result;
  });
});
