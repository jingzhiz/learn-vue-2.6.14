/* @flow */

import Dep from "./dep";
import VNode from "../vdom/vnode";
import { arrayMethods } from "./array";
import {
  def,
  warn,
  hasOwn,
  hasProto,
  isObject,
  isPlainObject,
  isPrimitive,
  isUndef,
  isValidArrayIndex,
  isServerRendering,
} from "../util/index";

const arrayKeys = Object.getOwnPropertyNames(arrayMethods);

/**
 * In some cases we may want to disable observation inside a component's
 * update computation.
 */
export let shouldObserve: boolean = true;

export function toggleObserving(value: boolean) {
  shouldObserve = value;
}

/**
 * Observer class that is attached to each observed
 * object. Once attached, the observer converts the target
 * object's property keys into getter/setters that
 * collect dependencies and dispatch updates.
 */
/*
  # 观察者类，会被附加到每个被观察的对象上，value.__ob__ = this
  # 而对象的各个属性则会被转换成 getter/setter，并收集依赖和通知更新
*/
export class Observer {
  value: any;
  dep: Dep;
  vmCount: number; // number of vms that have this object as root $data

  constructor(value: any) {
    this.value = value;
    this.dep = new Dep();
    this.vmCount = 0;
    // # 在 value 对象上设置 __ob__ 属性
    def(value, "__ob__", this);
    if (Array.isArray(value)) {
      // # 对数组进行特殊处理
      // # 覆盖数组默认的七个原型方法，以实现数组响应式
      if (hasProto) {
        // # __proto__ 不是标准属性，所以有些浏览器不支持
        protoAugment(value, arrayMethods);
      } else {
        copyAugment(value, arrayMethods, arrayKeys);
      }
      this.observeArray(value);
    } else {
      // # value 为对象，为对象的每个属性（包括嵌套对象）设置响应式
      this.walk(value);
    }
  }

  /**
   * Walk through all properties and convert them into
   * getter/setters. This method should only be called when
   * value type is Object.
   */
  walk(obj: Object) {
    // # 遍历对象的 key，全部变成 getter/setters，进行响应式处理
    const keys = Object.keys(obj);
    for (let i = 0; i < keys.length; i++) {
      defineReactive(obj, keys[i]);
    }
  }

  /**
   * Observe a list of Array items.
   */
  observeArray(items: Array<any>) {
    // # 观察数组中的每一项
    for (let i = 0, l = items.length; i < l; i++) {
      observe(items[i]);
    }
  }
}

// helpers

/**
 * Augment a target Object or Array by intercepting
 * the prototype chain using __proto__
 */
function protoAugment(target, src: Object) {
  /* eslint-disable no-proto */
  target.__proto__ = src;
  /* eslint-enable no-proto */
}

/**
 * Augment a target Object or Array by defining
 * hidden properties.
 */
/* istanbul ignore next */
function copyAugment(target: Object, src: Object, keys: Array<string>) {
  /*
    # 在目标对象上定义指定属性
    # 比如数组：为数组对象定义那七个方法
  */
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i];
    def(target, key, src[key]);
  }
}

/**
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 */
/*
  # 响应式处理的真正入口
  # 为对象创建观察者实例，如果对象已经被观察过，则返回已有的观察者实例，否则创建新的观察者实例
*/
export function observe(value: any, asRootData: ?boolean): Observer | void {
  // # 非对象和 VNode 实例不做响应式处理
  if (!isObject(value) || value instanceof VNode) {
    return;
  }
  let ob: Observer | void;
  // # 如果 value 对象上存在 __ob__ 属性，则表示已经做过观察了，直接返回 __ob__ 属性
  if (hasOwn(value, "__ob__") && value.__ob__ instanceof Observer) {
    ob = value.__ob__;
  } else if (
    shouldObserve &&
    !isServerRendering() &&
    (Array.isArray(value) || isPlainObject(value)) &&
    Object.isExtensible(value) &&
    !value._isVue
  ) {
    ob = new Observer(value);
  }
  if (asRootData && ob) {
    ob.vmCount++;
  }
  return ob;
}

/**
 * Define a reactive property on an Object.
 */
export function defineReactive(
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {
  // # 实例化 dep，一个 key 一个 dep
  const dep = new Dep();

  // # 不可以配置的话直接返回
  const property = Object.getOwnPropertyDescriptor(obj, key);
  if (property && property.configurable === false) {
    return;
  }

  // cater for pre-defined getter/setters
  const getter = property && property.get;
  const setter = property && property.set;
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key];
  }

  // # 对每个子项也添加观察
  let childOb = !shallow && observe(val);
  /*
    # 数据描述符和存取描述符。
    # 数据描述符是一个具有值的属性，该值可以是可写的，也可以是不可写的。
    # 存取描述符是由 getter 函数和 setter 函数所描述的属性。
    # 一个描述符只能是这两者其中之一；不能同时是两者。
  */
  Object.defineProperty(obj, key, {
    // # 可枚举
    enumerable: true,
    // # 可配置
    configurable: true,
    // # 拦截读取
    get: function reactiveGetter() {
      const value = getter ? getter.call(obj) : val;
      if (Dep.target) {
        // # 开始收集依赖
        dep.depend();
        if (childOb) {
          // # this.key.childKey 响应式
          childOb.dep.depend();
          if (Array.isArray(value)) {
            // # 为数组中的对象进行处理
            dependArray(value);
          }
        }
      }
      return value;
    },
    // # 拦截更改
    set: function reactiveSetter(newVal) {
      const value = getter ? getter.call(obj) : val;
      /* eslint-disable no-self-compare */
      if (newVal === value || (newVal !== newVal && value !== value)) {
        // # 如果新值和旧值一样直接返回，不触发响应式更新
        return;
      }
      /* eslint-enable no-self-compare */
      if (process.env.NODE_ENV !== "production" && customSetter) {
        customSetter();
      }
      // #7981: for accessor properties without setter
      if (getter && !setter) return;
      if (setter) {
        setter.call(obj, newVal);
      } else {
        val = newVal;
      }

      // # 观察新值
      childOb = !shallow && observe(newVal);

      // # 通知依赖进行更新
      dep.notify();
    },
  });
}

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 */
/*
  # Vue.set = set
  # 通过 Vue.set 或者 this.$set 方法给 target 的指定 key 设置值 val
  # 如果 target 是对象，并且 key 原本不存在，则为新 key 设置响应式，然后执行依赖通知
*/
export function set(target: Array<any> | Object, key: any, val: any): any {
  if (
    process.env.NODE_ENV !== "production" &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(
      `Cannot set reactive property on undefined, null, or primitive value: ${(target: any)}`
    );
  }
  // # 更新数组指定下标的元素，Vue.set(array, idx, val)，通过 splice 方法实现响应式更新
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.length = Math.max(target.length, key);
    target.splice(key, 1, val);
    return val;
  }
  // # 更新对象已有属性，Vue.set(obj, key, val)，执行更新即可
  if (key in target && !(key in Object.prototype)) {
    target[key] = val;
    return val;
  }
  const ob = (target: any).__ob__;
  if (target._isVue || (ob && ob.vmCount)) {
    /*
      # 不能向 Vue 实例或者 $data 添加动态添加响应式属性，vmCount 的用处之一，
      # this.$data 的 ob.vmCount = 1，表示根组件，其它子组件的 vm.vmCount 都是 0
    */
    process.env.NODE_ENV !== "production" &&
      warn(
        "Avoid adding reactive properties to a Vue instance or its root $data " +
          "at runtime - declare it upfront in the data option."
      );
    return val;
  }

  // # target 不是响应式对象，新属性会被设置，但是不会做响应式处理
  if (!ob) {
    target[key] = val;
    return val;
  }
  // # 给对象定义新属性，通过 defineReactive 方法设置响应式
  defineReactive(ob.value, key, val);
  // # 触发依赖更新
  ob.dep.notify();
  return val;
}

/**
 * Delete a property and trigger change if necessary.
 */
/*
  # Vue.delete = del
  # 通过 Vue.delete 或者 vm.$delete 删除 target 对象的指定 key
  # 数组通过 splice 方法实现，对象则通过 delete 运算符删除指定 key，并执行依赖通知
*/
export function del(target: Array<any> | Object, key: any) {
  if (
    process.env.NODE_ENV !== "production" &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(
      `Cannot delete reactive property on undefined, null, or primitive value: ${(target: any)}`
    );
  }

  // # target 为数组，则通过 splice 方法删除指定下标的元素
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.splice(key, 1);
    return;
  }
  const ob = (target: any).__ob__;
  if (target._isVue || (ob && ob.vmCount)) {
    // # 避免删除 Vue 实例的属性或者 $data 的数据
    process.env.NODE_ENV !== "production" &&
      warn(
        "Avoid deleting properties on a Vue instance or its root $data " +
          "- just set it to null."
      );
    return;
  }

  // # 如果属性不存在直接结束
  if (!hasOwn(target, key)) {
    return;
  }

  // # 使用 delete 操作符直接删掉对象上的属性
  delete target[key];
  if (!ob) {
    return;
  }

  // # 通知依赖执行更新
  ob.dep.notify();
}

/**
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 */
/*
  # 遍历每个数组元素，递归处理数组项为对象的情况，为其添加依赖
  # 因为前面的递归阶段无法为数组中的对象元素添加依赖
*/
function dependArray(value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i];
    e && e.__ob__ && e.__ob__.dep.depend();
    if (Array.isArray(e)) {
      dependArray(e);
    }
  }
}
