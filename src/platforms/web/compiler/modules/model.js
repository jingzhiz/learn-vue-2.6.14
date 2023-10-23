/* @flow */

/**
 * Expand input[v-model] with dynamic type bindings into v-if-else chains
 * Turn this:
 *   <input v-model="data[type]" :type="type">
 * into this:
 *   <input v-if="type === 'checkbox'" type="checkbox" v-model="data[type]">
 *   <input v-else-if="type === 'radio'" type="radio" v-model="data[type]">
 *   <input v-else :type="type" v-model="data[type]">
 */

import { addRawAttr, getBindingAttr, getAndRemoveAttr } from "compiler/helpers";

import {
  processFor,
  processElement,
  addIfCondition,
  createASTElement,
} from "compiler/parser/index";

/*
  # 处理存在 v-model 的 input 标签，但没处理 v-model 属性
  # 分别处理了 input 为 checkbox、radio 和 其它的情况
  # input 具体是哪种情况由 el.ifConditions 中的条件来判断
  # <input v-mode="test" :type="checkbox or radio or other(比如 text)" />
*/
function preTransformNode(el: ASTElement, options: CompilerOptions) {
  if (el.tag === "input") {
    const map = el.attrsMap;

    /*
      # 不存在 v-model 属性，直接结束
    */
    if (!map["v-model"]) {
      return;
    }

    /*
      # 获取 :type 的值
    */
    let typeBinding;
    if (map[":type"] || map["v-bind:type"]) {
      typeBinding = getBindingAttr(el, "type");
    }
    if (!map.type && !typeBinding && map["v-bind"]) {
      typeBinding = `(${map["v-bind"]}).type`;
    }

    /*
      # 如果存在 type 属性
    */
    if (typeBinding) {
      /*
        # v-if/v-else-if/v-else 等处理
      */
      const ifCondition = getAndRemoveAttr(el, "v-if", true);
      const ifConditionExtra = ifCondition ? `&&(${ifCondition})` : ``;
      const hasElse = getAndRemoveAttr(el, "v-else", true) != null;
      const elseIfCondition = getAndRemoveAttr(el, "v-else-if", true);

      // 1. checkbox
      const branch0 = cloneASTElement(el);
      // process for on the main node
      processFor(branch0);
      addRawAttr(branch0, "type", "checkbox");
      /*
        # 分别处理元素节点的 key、ref、插槽、自闭合的 slot 标签
        # 动态组件、class、style、v-bind、v-on、其它指令和一些原生属性
      */
      processElement(branch0, options);
      branch0.processed = true; // prevent it from double-processed
      branch0.if = `(${typeBinding})==='checkbox'` + ifConditionExtra;
      addIfCondition(branch0, {
        exp: branch0.if,
        block: branch0,
      });

      // 2. add radio else-if condition
      const branch1 = cloneASTElement(el);
      getAndRemoveAttr(branch1, "v-for", true);
      addRawAttr(branch1, "type", "radio");
      /*
        # 分别处理元素节点的 key、ref、插槽、自闭合的 slot 标签
        # 动态组件、class、style、v-bind、v-on、其它指令和一些原生属性
      */
      processElement(branch1, options);
      addIfCondition(branch0, {
        exp: `(${typeBinding})==='radio'` + ifConditionExtra,
        block: branch1,
      });

      // 3. other
      const branch2 = cloneASTElement(el);
      getAndRemoveAttr(branch2, "v-for", true);
      addRawAttr(branch2, ":type", typeBinding);
      /*
        # 分别处理元素节点的 key、ref、插槽、自闭合的 slot 标签
        # 动态组件、class、style、v-bind、v-on、其它指令和一些原生属性
      */
      processElement(branch2, options);
      addIfCondition(branch0, {
        exp: ifCondition,
        block: branch2,
      });

      if (hasElse) {
        branch0.else = true;
      } else if (elseIfCondition) {
        branch0.elseif = elseIfCondition;
      }

      return branch0;
    }
  }
}

function cloneASTElement(el) {
  return createASTElement(el.tag, el.attrsList.slice(), el.parent);
}

export default {
  preTransformNode,
};
