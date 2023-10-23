/* @flow */

import {
  tip,
  toArray,
  hyphenate,
  formatComponentName,
  invokeWithErrorHandling,
} from "../util/index";
import { updateListeners } from "../vdom/helpers/index";

export function initEvents(vm: Component) {
  vm._events = Object.create(null);
  vm._hasHookEvent = false;  // # 用于判断是否存在生命周期钩子的事件侦听器
  // init parent attached events
  const listeners = vm.$options._parentListeners;
  if (listeners) {
    updateComponentListeners(vm, listeners);
  }
}

let target: any;

function add(event, fn) {
  target.$on(event, fn);
}

function remove(event, fn) {
  target.$off(event, fn);
}

function createOnceHandler(event, fn) {
  const _target = target;
  return function onceHandler() {
    const res = fn.apply(null, arguments);
    if (res !== null) {
      _target.$off(event, onceHandler);
    }
  };
}

export function updateComponentListeners(
  vm: Component,
  listeners: Object,
  oldListeners: ?Object
) {
  target = vm;
  updateListeners(
    listeners,
    oldListeners || {},
    add,
    remove,
    createOnceHandler,
    vm
  );
  target = undefined;
}

export function eventsMixin(Vue: Class<Component>) {
  const hookRE = /^hook:/;

  Vue.prototype.$on = function (
    event: string | Array<string>,
    fn: Function
  ): Component {
    const vm: Component = this;
    if (Array.isArray(event)) {
      // # event 是有多个事件名组成的数组，则遍历这些事件，依次递归调用 $on
      for (let i = 0, l = event.length; i < l; i++) {
        vm.$on(event[i], fn);
      }
    } else {
      (vm._events[event] || (vm._events[event] = [])).push(fn);
      // optimize hook:event cost by using a boolean flag marked at registration
      // instead of a hash lookup
      /*
        # hookEvent，提供从外部为组件实例注入声明周期方法的机会
        # 比如从组件外部为组件的 mounted 方法注入额外的逻辑
        # 该能力是结合 callhook 方法实现的
      */
      if (hookRE.test(event)) {
        vm._hasHookEvent = true;
      }
    }
    return vm;
  };

  // # $on -> $off -> fn()
  Vue.prototype.$once = function (event: string, fn: Function): Component {
    const vm: Component = this;
    function on() {
      vm.$off(event, on);
      fn.apply(vm, arguments);
    }
    on.fn = fn;
    vm.$on(event, on);
    return vm;
  };

  Vue.prototype.$off = function (
    event?: string | Array<string>,
    fn?: Function
  ): Component {
    const vm: Component = this;
    // all
    // # 移除实例上的所有监听器
    if (!arguments.length) {
      vm._events = Object.create(null);
      return vm;
    }
    // array of events
    // # 遍历 event 数组，递归调用 vm.$off
    if (Array.isArray(event)) {
      for (let i = 0, l = event.length; i < l; i++) {
        vm.$off(event[i], fn);
      }
      return vm;
    }
    // specific event
    const cbs = vm._events[event];
    if (!cbs) {
      // # 表示没有注册过该事件
      return vm;
    }
    if (!fn) {
      vm._events[event] = null;
      return vm;
    }
    // specific handler
    // # 移除指定事件的指定回调函数，就是从事件的回调数组中找到该回调函数，然后删除
    let cb;
    let i = cbs.length;
    while (i--) {
      cb = cbs[i];
      if (cb === fn || cb.fn === fn) {
        cbs.splice(i, 1);
        break;
      }
    }
    return vm;
  };

  Vue.prototype.$emit = function (event: string): Component {
    const vm: Component = this;
    if (process.env.NODE_ENV !== "production") {
      const lowerCaseEvent = event.toLowerCase();
      if (lowerCaseEvent !== event && vm._events[lowerCaseEvent]) {
        /*
          # HTML 属性不区分大小写，所以你不能使用 v-on 监听小驼峰形式的事件名（eventName）
          # 而应该使用连字符形式的事件名（event-name)
        */
        tip(
          `Event "${lowerCaseEvent}" is emitted in component ` +
            `${formatComponentName(
              vm
            )} but the handler is registered for "${event}". ` +
            `Note that HTML attributes are case-insensitive and you cannot use ` +
            `v-on to listen to camelCase events when using in-DOM templates. ` +
            `You should probably use "${hyphenate(
              event
            )}" instead of "${event}".`
        );
      }
    }
    let cbs = vm._events[event];
    if (cbs) {
      cbs = cbs.length > 1 ? toArray(cbs) : cbs;
      // # 将伪数组转换成数组
      const args = toArray(arguments, 1);
      const info = `event handler for "${event}"`;
      for (let i = 0, l = cbs.length; i < l; i++) {
        // # 遍历执行
        invokeWithErrorHandling(cbs[i], vm, args, vm, info);
      }
    }
    return vm;
  };
}
