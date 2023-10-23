import { initMixin } from "./init";
import { stateMixin } from "./state";
import { renderMixin } from "./render";
import { eventsMixin } from "./events";
import { lifecycleMixin } from "./lifecycle";
import { warn } from "../util/index";

function Vue(options) {
  if (process.env.NODE_ENV !== "production" && !(this instanceof Vue)) {
    warn("Vue is a constructor and should be called with the `new` keyword");
  }

  // ! 开始初始化
  // debugger
  this._init(options);
}

// debugger

// # 定义 Vue.prototype._init 方法
initMixin(Vue);

/*
  # 定义数据相关：
  #  Vue.prototype.$data
  #  Vue.prototype.$props
  #  Vue.prototype.$set
  #  Vue.prototype.$delete
  #  Vue.prototype.$watch
*/
stateMixin(Vue);

/*
  # 定义事件相关的方法：
  #  Vue.prototype.$on
  #  Vue.prototype.$once
  #  Vue.prototype.$off
  #  Vue.prototype.$emit
*/
eventsMixin(Vue);

/*
  # 定义生命周期：
  #  Vue.prototype._update
  #  Vue.prototype.$forceUpdate
  #  Vue.prototype.$destroy
*/
lifecycleMixin(Vue);

/*
  # 定义：
  #  Vue.prototype.$nextTick
  #  Vue.prototype._render
*/
renderMixin(Vue);

export default Vue;
