/* @flow */

import { _Set as Set, isObject } from '../util/index'
import type { SimpleSet } from '../util/index'
import VNode from '../vdom/vnode'

const seenObjects = new Set()

/**
 * Recursively traverse an object to evoke all converted
 * getters, so that every nested property inside the object
 * is collected as a "deep" dependency.
 */

export function traverse (val: any) {
  _traverse(val, seenObjects)
  seenObjects.clear()
}
// # 递归遍历对象所有属性添加 getter 实现收集深度依赖
function _traverse (val: any, seen: SimpleSet) {
  let i, keys
  const isA = Array.isArray(val)
  // # 非数组、非对象、Object.freeze()等、vnode 不做处理
  if ((!isA && !isObject(val)) || Object.isFrozen(val) || val instanceof VNode) {
    return
  }

  if (val.__ob__) {
    const depId = val.__ob__.dep.id
    // # 已经存在的不重复收集依赖
    if (seen.has(depId)) {
      return
    }
    seen.add(depId)
  }
  if (isA) {
    // # 对数组中的每一项进行处理
    i = val.length
    while (i--) _traverse(val[i], seen)
  } else {
    // # 对对象中的每一个属性进行处理
    keys = Object.keys(val)
    i = keys.length
    while (i--) _traverse(val[keys[i]], seen)
  }
}
