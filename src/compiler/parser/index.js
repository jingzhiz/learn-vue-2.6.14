/* @flow */

import he from "he";
import { parseHTML } from "./html-parser";
import { parseText } from "./text-parser";
import { parseFilters } from "./filter-parser";
import { genAssignmentCode } from "../directives/model";
import { extend, cached, no, camelize, hyphenate } from "shared/util";
import { isIE, isEdge, isServerRendering } from "core/util/env";

import {
  addProp,
  addAttr,
  baseWarn,
  addHandler,
  addDirective,
  getBindingAttr,
  getAndRemoveAttr,
  getRawBindingAttr,
  pluckModuleFunction,
  getAndRemoveAttrByRegex,
} from "../helpers";

export const onRE = /^@|^v-on:/;
export const dirRE = process.env.VBIND_PROP_SHORTHAND
  ? /^v-|^@|^:|^\.|^#/
  : /^v-|^@|^:|^#/;
export const forAliasRE = /([\s\S]*?)\s+(?:in|of)\s+([\s\S]*)/;
export const forIteratorRE = /,([^,\}\]]*)(?:,([^,\}\]]*))?$/;
const stripParensRE = /^\(|\)$/g;
const dynamicArgRE = /^\[.*\]$/;

const argRE = /:(.*)$/;
export const bindRE = /^:|^\.|^v-bind:/;
const propBindRE = /^\./;
const modifierRE = /\.[^.\]]+(?=[^\]]*$)/g;

const slotRE = /^v-slot(:|$)|^#/;

const lineBreakRE = /[\r\n]/;
const whitespaceRE = /[ \f\t\r\n]+/g;

const invalidAttributeRE = /[\s"'<>\/=]/;

const decodeHTMLCached = cached(he.decode);

export const emptySlotScopeToken = `_empty_`;

// configurable state
export let warn: any;
let delimiters;
let transforms;
let preTransforms;
let postTransforms;
let platformIsPreTag;
let platformMustUseProp;
let platformGetTagNamespace;
let maybeComponent;

/*
  # 为指定元素创建 AST 对象
*/
export function createASTElement(
  tag: string,
  attrs: Array<ASTAttr>,
  parent: ASTElement | void
): ASTElement {
  return {
    type: 1,
    tag,
    attrsList: attrs,
    attrsMap: makeAttrsMap(attrs),
    rawAttrsMap: {},
    parent,
    children: [],
  };
}

/**
 * Convert HTML string to AST.
 */
export function parse(
  template: string,
  options: CompilerOptions
): ASTElement | void {
  warn = options.warn || baseWarn;

  /*
    # 是否为 pre 标签
  */
  platformIsPreTag = options.isPreTag || no;
  /*
    # 必须使用 props 进行绑定的属性
  */
  platformMustUseProp = options.mustUseProp || no;
  /*
    # 获取标签的命名空间
  */
  platformGetTagNamespace = options.getTagNamespace || no;
  /*
    # 是否是保留标签（html + svg)
  */
  const isReservedTag = options.isReservedTag || no;

  /*
    # 判断一个元素是否为一个组件
  */
  maybeComponent = (el: ASTElement) =>
    !!(
      el.component ||
      el.attrsMap[":is"] ||
      el.attrsMap["v-bind:is"] ||
      !(el.attrsMap.is ? isReservedTag(el.attrsMap.is) : isReservedTag(el.tag))
    );

  /*
    # 分别获取 options.modules 下的 class、model、style 三个模块中的
    # transformNode、preTransformNode、postTransformNode 方法
    # 负责处理元素节点上的 class、style、v-model
  */
  transforms = pluckModuleFunction(options.modules, "transformNode");
  preTransforms = pluckModuleFunction(options.modules, "preTransformNode");
  postTransforms = pluckModuleFunction(options.modules, "postTransformNode");

  /*
    # 界定分隔符，默认 {{}}
  */
  delimiters = options.delimiters;

  const stack = [];
  const preserveWhitespace = options.preserveWhitespace !== false;
  const whitespaceOption = options.whitespace;
  let root;
  let currentParent;
  let inVPre = false;
  let inPre = false;
  let warned = false;

  function warnOnce(msg, range) {
    if (!warned) {
      warned = true;
      warn(msg, range);
    }
  }

  /*
    # 主要做了 3 件事：
    #   1、如果元素没有被处理过，即 el.processed 为 false，则调用 processElement 方法处理节点上的众多属性
    #   2、让自己和父元素产生关系，将自己放到父元素的 children 数组中，并设置自己的 parent 属性为 currentParent
    #   3、设置自己的子元素，将自己所有非插槽的子元素放到自己的 children 数组中
  */
  function closeElement(element) {
    /*
      # 移除节点末尾的空格，当前 pre 标签内的元素除外
    */
    trimEndingWhitespace(element);

    /*
      # 当前元素不再 pre 节点内，并且也没有被处理过
    */
    if (!inVPre && !element.processed) {
      /*
        # 处理元素上的各种属性、指令、插槽等等
      */
      element = processElement(element, options);
    }
    // tree management
    if (!stack.length && element !== root) {
      // allow root elements with v-if, v-else-if and v-else
      /*
        # 处理根节点上存在 v-if、v-else-if、v-else 指令的情况
        # 如果根节点存在 v-if 指令，则必须还提供一个具有 v-else-if
        # 或者 v-else 的同级别节点，防止根元素不存在
      */
      if (root.if && (element.elseif || element.else)) {
        if (process.env.NODE_ENV !== "production") {
          checkRootConstraints(element);
        }
        addIfCondition(root, {
          exp: element.elseif,
          block: element,
        });
      } else if (process.env.NODE_ENV !== "production") {
        /*
          # 表示不应该在 根元素 上只使用 v-if
          # 应该将 v-if、v-else-if 一起使用，保证组件只有一个根元素
        */
        warnOnce(
          `Component template should contain exactly one root element. ` +
            `If you are using v-if on multiple elements, ` +
            `use v-else-if to chain them instead.`,
          { start: element.start }
        );
      }
    }

    /*
      # 将自己放到父元素的 children 数组中
      # 然后设置自己的 parent 属性为 currentParent
    */
    if (currentParent && !element.forbidden) {
      if (element.elseif || element.else) {
        processIfConditions(element, currentParent);
      } else {
        if (element.slotScope) {
          // scoped slot
          // keep it in the children list so that v-else(-if) conditions can
          // find it as the prev node.
          const name = element.slotTarget || '"default"';
          (currentParent.scopedSlots || (currentParent.scopedSlots = {}))[
            name
          ] = element;
        }
        currentParent.children.push(element);
        element.parent = currentParent;
      }
    }

    // final children cleanup
    // filter out scoped slots
    element.children = element.children.filter((c) => !(c: any).slotScope);
    // remove trailing whitespace node again
    trimEndingWhitespace(element);

    // check pre state
    if (element.pre) {
      inVPre = false;
    }
    if (platformIsPreTag(element.tag)) {
      inPre = false;
    }
    // apply post-transforms
    /*
      # 分别为 element 执行 model、class、style 三个模块的 postTransform 方法
    */
    for (let i = 0; i < postTransforms.length; i++) {
      postTransforms[i](element, options);
    }
  }

  /*
    #  删除元素中空白的文本节点，比如：<div> </div>
    # 删除 div 元素中的空白节点，将其从元素的 children 属性中移出去
  */
  function trimEndingWhitespace(el) {
    // remove trailing whitespace node
    if (!inPre) {
      let lastNode;
      while (
        (lastNode = el.children[el.children.length - 1]) &&
        lastNode.type === 3 &&
        lastNode.text === " "
      ) {
        el.children.pop();
      }
    }
  }

  /*
    # 检查根元素：
    #  不能使用 slot 和 template 标签作为组件的根元素
    #  不能在有状态组件的 根元素 上使用 v-for 指令，因为它会渲染出多个元素
  */
  function checkRootConstraints(el) {
    /*
      # 不能使用 slot 和 template 标签作为组件的根元素
    */
    if (el.tag === "slot" || el.tag === "template") {
      warnOnce(
        `Cannot use <${el.tag}> as component root element because it may ` +
          "contain multiple nodes.",
        { start: el.start }
      );
    }

    /*
      # 不能在有状态组件的根元素上使用 v-for，因为它会渲染出多个元素
    */
    if (el.attrsMap.hasOwnProperty("v-for")) {
      warnOnce(
        "Cannot use v-for on stateful component root element because " +
          "it renders multiple elements.",
        el.rawAttrsMap["v-for"]
      );
    }
  }

  /*
    # 解析 html 模版字符串，处理所有标签以及标签上的属性
  */
  parseHTML(template, {
    warn,
    expectHTML: options.expectHTML,
    isUnaryTag: options.isUnaryTag,
    canBeLeftOpenTag: options.canBeLeftOpenTag,
    shouldDecodeNewlines: options.shouldDecodeNewlines,
    shouldDecodeNewlinesForHref: options.shouldDecodeNewlinesForHref,
    shouldKeepComment: options.comments,
    outputSourceRange: options.outputSourceRange,
    /*
      # 主要做了以下 6 件事情:
      #   1、创建 AST 对象
      #   2、处理存在 v-model 指令的 input 标签，分别处理 input 为 checkbox、radio、其它的情况
      #   3、处理标签上的众多指令，比如 v-pre、v-for、v-if、v-once
      #   4、如果根节点 root 不存在则设置当前元素为根节点
      #   5、如果当前元素为非自闭合标签则将自己 push 到 stack 数组，并记录 currentParent
      #      在接下来处理子元素时用来告诉子元素自己的父节点是谁
      #   6、如果当前元素为自闭合标签，则表示该标签要处理结束了，让自己和父元素产生关系，以及设置自己的子元素
    */
    start(tag, attrs, unary, start, end) {
      // check namespace.
      // inherit parent ns if there is one
      /*
        # 检查命名空间，如果存在，则继承父命名空间
      */
      const ns =
        (currentParent && currentParent.ns) || platformGetTagNamespace(tag);

      // handle IE svg bug
      /* istanbul ignore if */
      if (isIE && ns === "svg") {
        attrs = guardIESVGBug(attrs);
      }

      /*
        # 创建当前标签的 AST 对象
      */
      let element: ASTElement = createASTElement(tag, attrs, currentParent);
      /*
        # 设置命名空间
      */
      if (ns) {
        element.ns = ns;
      }

      /*
        # 这段在非生产环境下会走，在 ast 对象上添加 一些 属性，比如 start、end
      */
      if (process.env.NODE_ENV !== "production") {
        if (options.outputSourceRange) {
          element.start = start;
          element.end = end;
          element.rawAttrsMap = element.attrsList.reduce((cumulated, attr) => {
            cumulated[attr.name] = attr;
            return cumulated;
          }, {});
        }
        attrs.forEach((attr) => {
          /*
            # 验证属性是否有效，比如属性名不能包含: spaces, quotes, <, >, / or =.
          */
          if (invalidAttributeRE.test(attr.name)) {
            warn(
              `Invalid dynamic argument expression: attribute names cannot contain ` +
                `spaces, quotes, <, >, / or =.`,
              {
                start: attr.start + attr.name.indexOf(`[`),
                end: attr.start + attr.name.length,
              }
            );
          }
        });
      }

      /*
        # 非服务端渲染的情况下，模版中不应该出现 style、script 标签
      */
      if (isForbiddenTag(element) && !isServerRendering()) {
        element.forbidden = true;
        process.env.NODE_ENV !== "production" &&
          warn(
            "Templates should only be responsible for mapping the state to the " +
              "UI. Avoid placing tags with side-effects in your templates, such as " +
              `<${tag}>` +
              ", as they will not be parsed.",
            { start: element.start }
          );
      }

      // apply pre-transforms
      /*
        # 为 element 对象分别执行 class、style、model 模块中的 preTransforms 方法
        # 不过 web 平台只有 model 模块有 preTransforms 方法
        # 用来处理存在 v-model 的 input 标签，但没处理 v-model 属性
        # 分别处理了 input 为 checkbox、radio 和 其它的情况
        # input 具体是哪种情况由 el.ifConditions 中的条件来判断
        # <input v-mode="test" :type="checkbox or radio or other(比如 text)" />
       */
      for (let i = 0; i < preTransforms.length; i++) {
        element = preTransforms[i](element, options) || element;
      }

      if (!inVPre) {
        /*
          # 表示 element 是否存在 v-pre 指令，存在则设置 element.pre = true
        */
        processPre(element);
        if (element.pre) {
          /*
            # 存在 v-pre 指令，则设置 inVPre 为 true
            # v-pre 跳过 {{ }} 中的编译
          */
          inVPre = true;
        }
      }

      /*
        # 如果 pre 标签，则设置 inPre 为 true
      */
      if (platformIsPreTag(element.tag)) {
        inPre = true;
      }
      if (inVPre) {
        processRawAttrs(element);
      } else if (!element.processed) {
        // structural directives
        /*
          # 处理 v-for v-if/v-else-if/v-else v-once
        */
        processFor(element);
        processIf(element);
        processOnce(element);
      }

      if (!root) {
        root = element;
        if (process.env.NODE_ENV !== "production") {
          checkRootConstraints(root);
        }
      }

      if (!unary) {
        currentParent = element;
        stack.push(element);
      } else {
        closeElement(element);
      }
    },

    end(tag, start, end) {
      /*
        # 结束标签对应的开始标签的 ast 对象
      */
      const element = stack[stack.length - 1];
      // pop stack
      stack.length -= 1;
      currentParent = stack[stack.length - 1];
      if (process.env.NODE_ENV !== "production" && options.outputSourceRange) {
        element.end = end;
      }
      closeElement(element);
    },

    /*
      # 处理文本，基于文本生成 ast 对象，然后将该 ast 放到它的父元素中，即 currentParent.children
    */
    chars(text: string, start: number, end: number) {
      /*
        # 异常处理，currentParent 不存在说明这段文本没有父元素
      */
      if (!currentParent) {
        if (process.env.NODE_ENV !== "production") {
          /*
            # 文本不能作为组件的根元素
          */
          if (text === template) {
            warnOnce(
              "Component template requires a root element, rather than just text.",
              { start }
            );

            /*
              # 放在根元素之外的文本会被忽略
            */
          } else if ((text = text.trim())) {
            warnOnce(`text "${text}" outside root element will be ignored.`, {
              start,
            });
          }
        }
        return;
      }
      // IE textarea placeholder bug
      /* istanbul ignore if */
      if (
        isIE &&
        currentParent.tag === "textarea" &&
        currentParent.attrsMap.placeholder === text
      ) {
        return;
      }

      /*
        # 当前父元素的所有孩子节点
      */
      const children = currentParent.children;

      /*
        # 对 text 进行一系列的处理，比如删除空白字符
        # 或者存在 whitespaceOptions 选项，则 text 直接置为空或者空格
      */
      if (inPre || text.trim()) {
        text = isTextTag(currentParent) ? text : decodeHTMLCached(text);
      } else if (!children.length) {
        // remove the whitespace-only node right after an opening tag
        text = "";
      } else if (whitespaceOption) {
        if (whitespaceOption === "condense") {
          // in condense mode, remove the whitespace node if it contains
          // line break, otherwise condense to a single space
          text = lineBreakRE.test(text) ? "" : " ";
        } else {
          text = " ";
        }
      } else {
        text = preserveWhitespace ? " " : "";
      }
      if (text) {
        if (!inPre && whitespaceOption === "condense") {
          // condense consecutive whitespaces into single space
          text = text.replace(whitespaceRE, " ");
        }
        let res;

        /*
          # 基于 text 生成 AST 对象
        */
        let child: ?ASTNode;
        if (!inVPre && text !== " " && (res = parseText(text, delimiters))) {
          child = {
            type: 2,
            expression: res.expression,
            tokens: res.tokens,
            text,
          };
        } else if (
          text !== " " ||
          !children.length ||
          children[children.length - 1].text !== " "
        ) {
          child = {
            type: 3,
            text,
          };
        }
        if (child) {
          if (
            process.env.NODE_ENV !== "production" &&
            options.outputSourceRange
          ) {
            child.start = start;
            child.end = end;
          }
          children.push(child);
        }
      }
    },

    /*
      # 处理注释节点
    */
    comment(text: string, start, end) {
      // adding anything as a sibling to the root node is forbidden
      // comments should still be allowed, but ignored
      /*
        # 禁止将任何内容作为 root 的节点的同级进行添加，注释应该被允许，但是会被忽略
        # 如果 currentParent 不存在，说明注释和 root 为同级，忽略
      */
      if (currentParent) {
        const child: ASTText = {
          /*
            # 节点类型
          */
          type: 3,
          /*
            # 注释内容
          */
          text,
          /*
            # 是否为注释
          */
          isComment: true,
        };
        if (
          process.env.NODE_ENV !== "production" &&
          options.outputSourceRange
        ) {
          /*
            # 记录节点的开始索引和结束索引
          */
          child.start = start;
          child.end = end;
        }

        /*
          # 将当前注释节点放到父元素的 children 属性中
        */
        currentParent.children.push(child);
      }
    },
  });
  return root;
}

/*
  # 如果元素上存在 v-pre 指令，则设置 el.pre = true
*/
function processPre(el) {
  if (getAndRemoveAttr(el, "v-pre") != null) {
    el.pre = true;
  }
}

/*
  # 设置 el.attrs 数组对象，每个元素都是一个属性对象
  # { name: attrName, value: attrVal, start, end }
*/
function processRawAttrs(el) {
  const list = el.attrsList;
  const len = list.length;
  if (len) {
    const attrs: Array<ASTAttr> = (el.attrs = new Array(len));
    for (let i = 0; i < len; i++) {
      attrs[i] = {
        name: list[i].name,
        value: JSON.stringify(list[i].value),
      };
      if (list[i].start != null) {
        attrs[i].start = list[i].start;
        attrs[i].end = list[i].end;
      }
    }
  } else if (!el.pre) {
    // non root node in pre blocks with no attributes
    el.plain = true;
  }
}

/*
  # 分别处理元素节点的 key、ref、插槽、自闭合的 slot 标签
  #   动态组件、class、style、v-bind、v-on、其它指令和一些原生属性
  # 然后在 el 对象上添加如下属性：
  # el.key、ref、refInFor、scopedSlot、slotName、component、inlineTemplate、staticClass
  # el.bindingClass、staticStyle、bindingStyle、attrs
*/
export function processElement(element: ASTElement, options: CompilerOptions) {
  processKey(element);

  // determine whether this is a plain element after
  // removing structural attributes
  /*
    # 确定 element 是否为一个普通元素
  */
  element.plain =
    !element.key && !element.scopedSlots && !element.attrsList.length;

  /*
    # el.ref = val, el.refInFor = boolean
  */
  processRef(element);
  /*
    # 处理作为插槽传递给组件的内容
  */
  processSlotContent(element);
  /*
    # 处理自闭合的 slot 标签
  */
  processSlotOutlet(element);
  /*
    # 处理动态组件
  */
  processComponent(element);

  /*
    # 为 element 对象分别执行 class、style、model 模块中的 transformNode 方法
  */
  for (let i = 0; i < transforms.length; i++) {
    element = transforms[i](element, options) || element;
  }

  /*
    # 处理元素上的所有属性：
  */
  processAttrs(element);
  return element;
}

/*
  # 处理元素上的 key 属性
*/
function processKey(el) {
  /*
    # 获取一个 key
  */
  const exp = getBindingAttr(el, "key");
  if (exp) {
    if (process.env.NODE_ENV !== "production") {
      if (el.tag === "template") {
        warn(
          `<template> cannot be keyed. Place the key on real elements instead.`,
          getRawBindingAttr(el, "key")
        );
      }
      if (el.for) {
        const iterator = el.iterator2 || el.iterator1;
        const parent = el.parent;
        if (
          iterator &&
          iterator === exp &&
          parent &&
          parent.tag === "transition-group"
        ) {
          /*
            # 不要在 <transition-group> 的子元素上使用 v-for 的 index 作为 key，这和没用 key 没什么区别
          */
          warn(
            `Do not use v-for index as key on <transition-group> children, ` +
              `this is the same as not using keys.`,
            getRawBindingAttr(el, "key"),
            true /* tip */
          );
        }
      }
    }

    /*
      # 在 el 上添加 key
    */
    el.key = exp;
  }
}

/*
  # 处理元素上的 ref 属性
*/
function processRef(el) {
  const ref = getBindingAttr(el, "ref");
  if (ref) {
    el.ref = ref;
    /*
      # 判断包含 ref 属性的元素是否包含在具有 v-for 指令的元素内或后代元素中
      # 如果是，则 ref 指向的则是包含 DOM 节点或组件实例的数组
    */
    el.refInFor = checkInFor(el);
  }
}

/*
  # 处理 v-for，将结果设置到 el 对象上，得到:
  #  el.for = 可迭代对象，比如 arr
  #  el.alias = 别名，比如 item
*/
export function processFor(el: ASTElement) {
  let exp;

  /*
    # 获取 el 上的 v-for 属性的值
  */
  if ((exp = getAndRemoveAttr(el, "v-for"))) {
    /*
      # 解析 v-for 的表达式，得到 { for: 可迭代对象， alias: 别名 }
      # 比如 { for: arr, alias: item }
    */
    const res = parseFor(exp);
    if (res) {
      /*
        # 将 res 对象上的属性拷贝到 el 对象上
      */
      extend(el, res);
    } else if (process.env.NODE_ENV !== "production") {
      warn(`Invalid v-for expression: ${exp}`, el.rawAttrsMap["v-for"]);
    }
  }
}

type ForParseResult = {
  for: string,
  alias: string,
  iterator1?: string,
  iterator2?: string,
};

/*
  # 处理 v-for 指令
*/
export function parseFor(exp: string): ?ForParseResult {
  const inMatch = exp.match(forAliasRE);
  if (!inMatch) return;
  const res = {};
  res.for = inMatch[2].trim();
  const alias = inMatch[1].trim().replace(stripParensRE, "");
  const iteratorMatch = alias.match(forIteratorRE);
  if (iteratorMatch) {
    res.alias = alias.replace(forIteratorRE, "").trim();
    res.iterator1 = iteratorMatch[1].trim();
    if (iteratorMatch[2]) {
      res.iterator2 = iteratorMatch[2].trim();
    }
  } else {
    res.alias = alias;
  }
  return res;
}

/*
  # 处理 v-if、v-else-if、v-else
  # 得到 el.if = "exp"，el.elseif = exp, el.else = true
  # v-if 属性会额外在 el.ifConditions 数组中添加 { exp, block } 对象
*/
function processIf(el) {
  /*
    # 获取 v-if 属性的值，比如 <div v-if="test"></div>
  */
  const exp = getAndRemoveAttr(el, "v-if");
  if (exp) {
    el.if = exp;
    /*
      # 在 el.ifConditions 数组中添加 { exp, block }
    */
    addIfCondition(el, {
      exp: exp,
      block: el,
    });
  } else {
    /*
      # 处理 v-else，得到 el.else = true
    */
    if (getAndRemoveAttr(el, "v-else") != null) {
      el.else = true;
    }

    /*
      # 处理 v-else-if，得到 el.elseif = exp
    */
    const elseif = getAndRemoveAttr(el, "v-else-if");
    if (elseif) {
      el.elseif = elseif;
    }
  }
}

function processIfConditions(el, parent) {
  /*
    # 找到 parent.children 中的最后一个元素节点
  */
  const prev = findPrevElement(parent.children);
  if (prev && prev.if) {
    addIfCondition(prev, {
      exp: el.elseif,
      block: el,
    });
  } else if (process.env.NODE_ENV !== "production") {
    warn(
      `v-${el.elseif ? 'else-if="' + el.elseif + '"' : "else"} ` +
        `used on element <${el.tag}> without corresponding v-if.`,
      el.rawAttrsMap[el.elseif ? "v-else-if" : "v-else"]
    );
  }
}

function findPrevElement(children: Array<any>): ASTElement | void {
  let i = children.length;
  while (i--) {
    if (children[i].type === 1) {
      return children[i];
    } else {
      if (process.env.NODE_ENV !== "production" && children[i].text !== " ") {
        warn(
          `text "${children[i].text.trim()}" between v-if and v-else(-if) ` +
            `will be ignored.`,
          children[i]
        );
      }
      children.pop();
    }
  }
}

/*
  # 将传递进来的条件对象放进 el.ifConditions 数组中
*/
export function addIfCondition(el: ASTElement, condition: ASTIfCondition) {
  if (!el.ifConditions) {
    el.ifConditions = [];
  }
  el.ifConditions.push(condition);
}

/*
  # 处理 v-once 指令，得到 el.once = true
*/
function processOnce(el) {
  const once = getAndRemoveAttr(el, "v-once");
  if (once != null) {
    el.once = true;
  }
}

// handle content being passed to a component as slot,
// e.g. <template slot="xxx">, <div slot-scope="xxx">
/*
  # 处理作为插槽传递给组件的内容，得到：
  # slotTarget => 插槽名
  # slotTargetDynamic => 是否为动态插槽
  # slotScope => 作用域插槽的值
  # 直接在 <comp> 标签上使用 v-slot 语法时
  # 将上述属性放到 el.scopedSlots 对象上，其它情况直接放到 el 对象上
*/
function processSlotContent(el) {
  let slotScope;
  if (el.tag === "template") {
    slotScope = getAndRemoveAttr(el, "scope");
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== "production" && slotScope) {
      warn(
        `the "scope" attribute for scoped slots have been deprecated and ` +
          `replaced by "slot-scope" since 2.5. The new "slot-scope" attribute ` +
          `can also be used on plain elements in addition to <template> to ` +
          `denote scoped slots.`,
        el.rawAttrsMap["scope"],
        true
      );
    }
    el.slotScope = slotScope || getAndRemoveAttr(el, "slot-scope");
  } else if ((slotScope = getAndRemoveAttr(el, "slot-scope"))) {
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== "production" && el.attrsMap["v-for"]) {
      /*
        #元素不能同时使用 slot-scope 和 v-for，v-for 具有更高的优先级
        #应该用 template 标签作为容器，将 slot-scope 放到 template 标签上
      */
      warn(
        `Ambiguous combined usage of slot-scope and v-for on <${el.tag}> ` +
          `(v-for takes higher priority). Use a wrapper <template> for the ` +
          `scoped slot to make it clearer.`,
        el.rawAttrsMap["slot-scope"],
        true
      );
    }
    el.slotScope = slotScope;
  }

  // slot="xxx"
  /*
    # 具名插槽
  */
  const slotTarget = getBindingAttr(el, "slot");
  if (slotTarget) {
    el.slotTarget = slotTarget === '""' ? '"default"' : slotTarget;
    el.slotTargetDynamic = !!(
      el.attrsMap[":slot"] || el.attrsMap["v-bind:slot"]
    );
    // preserve slot as an attribute for native shadow DOM compat
    // only for non-scoped slots.
    if (el.tag !== "template" && !el.slotScope) {
      addAttr(el, "slot", slotTarget, getRawBindingAttr(el, "slot"));
    }
  }

  // 2.6 v-slot syntax
  if (process.env.NEW_SLOT_SYNTAX) {
    if (el.tag === "template") {
      // v-slot on <template>
      const slotBinding = getAndRemoveAttrByRegex(el, slotRE);
      if (slotBinding) {
        if (process.env.NODE_ENV !== "production") {
          if (el.slotTarget || el.slotScope) {
            warn(`Unexpected mixed usage of different slot syntaxes.`, el);
          }
          if (el.parent && !maybeComponent(el.parent)) {
            warn(
              `<template v-slot> can only appear at the root level inside ` +
                `the receiving component`,
              el
            );
          }
        }
        const { name, dynamic } = getSlotName(slotBinding);
        el.slotTarget = name;
        el.slotTargetDynamic = dynamic;
        el.slotScope = slotBinding.value || emptySlotScopeToken; // force it into a scoped slot for perf
      }
    } else {
      // v-slot on component, denotes default slot
      const slotBinding = getAndRemoveAttrByRegex(el, slotRE);
      if (slotBinding) {
        if (process.env.NODE_ENV !== "production") {
          if (!maybeComponent(el)) {
            warn(
              `v-slot can only be used on components or <template>.`,
              slotBinding
            );
          }
          if (el.slotScope || el.slotTarget) {
            warn(`Unexpected mixed usage of different slot syntaxes.`, el);
          }
          if (el.scopedSlots) {
            warn(
              `To avoid scope ambiguity, the default slot should also use ` +
                `<template> syntax when there are other named slots.`,
              slotBinding
            );
          }
        }
        // add the component's children to its default slot
        const slots = el.scopedSlots || (el.scopedSlots = {});
        const { name, dynamic } = getSlotName(slotBinding);
        const slotContainer = (slots[name] = createASTElement(
          "template",
          [],
          el
        ));
        slotContainer.slotTarget = name;
        slotContainer.slotTargetDynamic = dynamic;
        slotContainer.children = el.children.filter((c: any) => {
          if (!c.slotScope) {
            c.parent = slotContainer;
            return true;
          }
        });
        slotContainer.slotScope = slotBinding.value || emptySlotScopeToken;
        // remove children as they are returned from scopedSlots now
        el.children = [];
        // mark el non-plain so data gets generated
        el.plain = false;
      }
    }
  }
}

/*
  # 解析 binding，得到插槽名称以及是否为动态插槽
*/
function getSlotName(binding) {
  let name = binding.name.replace(slotRE, "");
  if (!name) {
    if (binding.name[0] !== "#") {
      name = "default";
    } else if (process.env.NODE_ENV !== "production") {
      warn(`v-slot shorthand syntax requires a slot name.`, binding);
    }
  }
  return dynamicArgRE.test(name)
    ? // dynamic [name]
      { name: name.slice(1, -1), dynamic: true }
    : // static name
      { name: `"${name}"`, dynamic: false };
}

// handle <slot/> outlets
/*
  # 处理自闭合的 <slot />
*/
function processSlotOutlet(el) {
  if (el.tag === "slot") {
    el.slotName = getBindingAttr(el, "name");
    if (process.env.NODE_ENV !== "production" && el.key) {
      /*
        # 不要在 slot 标签上使用 key 属性
      */
      warn(
        `\`key\` does not work on <slot> because slots are abstract outlets ` +
          `and can possibly expand into multiple elements. ` +
          `Use the key on a wrapping element instead.`,
        getRawBindingAttr(el, "key")
      );
    }
  }
}

/*
  # 处理动态组件，<component :is="compName"></component>
*/
function processComponent(el) {
  let binding;
  if ((binding = getBindingAttr(el, "is"))) {
    el.component = binding;
  }
  if (getAndRemoveAttr(el, "inline-template") != null) {
    el.inlineTemplate = true;
  }
}

/*
  # 处理元素上的所有属性：
  # v-bind 指令变成：el.attrs 或 el.dynamicAttrs = [{ name, value, start, end, dynamic }, ...]，
  #        或者是必须使用 props 的属性，变成了 el.props = [{ name, value, start, end, dynamic }, ...]
  # v-on 指令变成：el.events
  #      或 el.nativeEvents = { name: [{ value, start, end, modifiers, dynamic }, ...] }
  # 其它指令：el.directives = [{name, rawName, value, arg, isDynamicArg, modifier, start, end }, ...]
  # 原生属性：el.attrs = [{ name, value, start, end }]，或者一些必须使用 props 的属性，变成了：
  #         el.props = [{ name, value: true, start, end, dynamic }]
*/
function processAttrs(el) {
  const list = el.attrsList;
  let i, l, name, rawName, value, modifiers, syncGen, isDynamic;
  for (i = 0, l = list.length; i < l; i++) {
    name = rawName = list[i].name;
    value = list[i].value;

    /*
      # 说明该属性是一个指令
    */
    if (dirRE.test(name)) {
      // mark element as dynamic
      /*
        # 元素上存在指令，将元素标记动态元素
      */
      el.hasBindings = true;
      // modifiers
      /*
        # modifiers，在属性名上解析修饰符，比如 xx.lazy
      */
      modifiers = parseModifiers(name.replace(dirRE, ""));
      // support .foo shorthand syntax for the .prop modifier
      if (process.env.VBIND_PROP_SHORTHAND && propBindRE.test(name)) {
        (modifiers || (modifiers = {})).prop = true;
        name = `.` + name.slice(1).replace(modifierRE, "");
      } else if (modifiers) {
        /*
          # 属性中的修饰符去掉，得到一个干净的属性名
        */
        name = name.replace(modifierRE, "");
      }
      if (bindRE.test(name)) {
        // v-bind
        /*
          # 处理 v-bind 指令属性，最后得到 el.attrs
          # 或者 el.dynamicAttrs = [{ name, value, start, end, dynamic }, ...]
        */
        name = name.replace(bindRE, "");
        value = parseFilters(value);
        isDynamic = dynamicArgRE.test(name);
        if (isDynamic) {
          /*
            # 如果是动态属性，则去掉属性两侧的方括号 []
          */
          name = name.slice(1, -1);
        }
        if (
          process.env.NODE_ENV !== "production" &&
          value.trim().length === 0
        ) {
          warn(
            `The value for a v-bind expression cannot be empty. Found in "v-bind:${name}"`
          );
        }

        /*
          # 存在修饰符
        */
        if (modifiers) {
          if (modifiers.prop && !isDynamic) {
            name = camelize(name);
            if (name === "innerHtml") name = "innerHTML";
          }
          if (modifiers.camel && !isDynamic) {
            name = camelize(name);
          }

          /*
            # 处理 sync 修饰符
          */
          if (modifiers.sync) {
            syncGen = genAssignmentCode(value, `$event`);
            if (!isDynamic) {
              addHandler(
                el,
                `update:${camelize(name)}`,
                syncGen,
                null,
                false,
                warn,
                list[i]
              );
              if (hyphenate(name) !== camelize(name)) {
                addHandler(
                  el,
                  `update:${hyphenate(name)}`,
                  syncGen,
                  null,
                  false,
                  warn,
                  list[i]
                );
              }
            } else {
              // handler w/ dynamic event name
              addHandler(
                el,
                `"update:"+(${name})`,
                syncGen,
                null,
                false,
                warn,
                list[i],
                true // dynamic
              );
            }
          }
        }
        if (
          (modifiers && modifiers.prop) ||
          (!el.component && platformMustUseProp(el.tag, el.attrsMap.type, name))
        ) {
          /*
            # 将属性对象添加到 el.props 数组中，表示这些属性必须通过 props 设置
            # el.props = [{ name, value, start, end, dynamic }, ...]
          */
          addProp(el, name, value, list[i], isDynamic);
        } else {
          /*
            # 将属性添加到 el.attrs 数组或者 el.dynamicAttrs 数组
          */
          addAttr(el, name, value, list[i], isDynamic);
        }
      } else if (onRE.test(name)) {
        // v-on
        name = name.replace(onRE, "");
        isDynamic = dynamicArgRE.test(name);
        if (isDynamic) {
          name = name.slice(1, -1);
        }

        /*
          # 处理事件属性，将属性的信息添加到 el.events 或者 el.nativeEvents 对象上，格式：
          # el.events = [{ value, start, end, modifiers, dynamic }, ...]
        */
        addHandler(el, name, value, modifiers, false, warn, list[i], isDynamic);
      } else {
        // normal directives
        /*
          # 其它的普通指令
        */
        name = name.replace(dirRE, "");
        // parse arg
        const argMatch = name.match(argRE);
        let arg = argMatch && argMatch[1];
        isDynamic = false;
        if (arg) {
          name = name.slice(0, -(arg.length + 1));
          if (dynamicArgRE.test(arg)) {
            arg = arg.slice(1, -1);
            isDynamic = true;
          }
        }
        addDirective(
          el,
          name,
          rawName,
          value,
          arg,
          isDynamic,
          modifiers,
          list[i]
        );
        if (process.env.NODE_ENV !== "production" && name === "model") {
          checkForAliasModel(el, value);
        }
      }
    } else {
      // literal attribute
      /*
        # 当前属性不是指令
      */
      if (process.env.NODE_ENV !== "production") {
        const res = parseText(value, delimiters);
        if (res) {
          warn(
            `${name}="${value}": ` +
              "Interpolation inside attributes has been removed. " +
              "Use v-bind or the colon shorthand instead. For example, " +
              'instead of <div id="{{ val }}">, use <div :id="val">.',
            list[i]
          );
        }
      }
      addAttr(el, name, JSON.stringify(value), list[i]);
      // #6887 firefox doesn't update muted state if set via attribute
      // even immediately after element creation
      if (
        !el.component &&
        name === "muted" &&
        platformMustUseProp(el.tag, el.attrsMap.type, name)
      ) {
        addProp(el, name, "true", list[i]);
      }
    }
  }
}

function checkInFor(el: ASTElement): boolean {
  let parent = el;
  while (parent) {
    if (parent.for !== undefined) {
      return true;
    }
    parent = parent.parent;
  }
  return false;
}

function parseModifiers(name: string): Object | void {
  const match = name.match(modifierRE);
  if (match) {
    const ret = {};
    match.forEach((m) => {
      ret[m.slice(1)] = true;
    });
    return ret;
  }
}

function makeAttrsMap(attrs: Array<Object>): Object {
  const map = {};
  for (let i = 0, l = attrs.length; i < l; i++) {
    if (
      process.env.NODE_ENV !== "production" &&
      map[attrs[i].name] &&
      !isIE &&
      !isEdge
    ) {
      warn("duplicate attribute: " + attrs[i].name, attrs[i]);
    }
    map[attrs[i].name] = attrs[i].value;
  }
  return map;
}

// for script (e.g. type="x/template") or style, do not decode content
function isTextTag(el): boolean {
  return el.tag === "script" || el.tag === "style";
}

function isForbiddenTag(el): boolean {
  return (
    el.tag === "style" ||
    (el.tag === "script" &&
      (!el.attrsMap.type || el.attrsMap.type === "text/javascript"))
  );
}

const ieNSBug = /^xmlns:NS\d+/;
const ieNSPrefix = /^NS\d+:/;

/* istanbul ignore next */
function guardIESVGBug(attrs) {
  const res = [];
  for (let i = 0; i < attrs.length; i++) {
    const attr = attrs[i];
    if (!ieNSBug.test(attr.name)) {
      attr.name = attr.name.replace(ieNSPrefix, "");
      res.push(attr);
    }
  }
  return res;
}

function checkForAliasModel(el, value) {
  let _el = el;
  while (_el) {
    if (_el.for && _el.alias === value) {
      warn(
        `<${el.tag} v-model="${value}">: ` +
          `You are binding v-model directly to a v-for iteration alias. ` +
          `This will not be able to modify the v-for source array because ` +
          `writing to the alias is like modifying a function local variable. ` +
          `Consider using an array of objects and use v-model on an object property instead.`,
        el.rawAttrsMap["v-model"]
      );
    }
    _el = _el.parent;
  }
}
