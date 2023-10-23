/* @flow */

import { parseText } from "compiler/parser/text-parser";
import { parseStyleText } from "web/util/style";
import { getAndRemoveAttr, getBindingAttr, baseWarn } from "compiler/helpers";

/*
  # 从 el 上解析出静态的 style 属性和动态绑定的 style 属性，分别赋值给：
  # el.staticStyle 和 el.styleBinding
*/
function transformNode(el: ASTElement, options: CompilerOptions) {
  const warn = options.warn || baseWarn;
  const staticStyle = getAndRemoveAttr(el, "style");
  if (staticStyle) {
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== "production") {
      const res = parseText(staticStyle, options.delimiters);
      if (res) {
        warn(
          `style="${staticStyle}": ` +
            "Interpolation inside attributes has been removed. " +
            "Use v-bind or the colon shorthand instead. For example, " +
            'instead of <div style="{{ val }}">, use <div :style="val">.',
          el.rawAttrsMap["style"]
        );
      }
    }
    /*
      # 将静态的 style 样式赋值给 el.staticStyle
    */
    el.staticStyle = JSON.stringify(parseStyleText(staticStyle));
  }

  /*
    # 获取动态绑定的 style 属性
  */
  const styleBinding = getBindingAttr(el, "style", false /* getStatic */);
  if (styleBinding) {
    el.styleBinding = styleBinding;
  }
}

function genData(el: ASTElement): string {
  let data = "";
  if (el.staticStyle) {
    data += `staticStyle:${el.staticStyle},`;
  }
  if (el.styleBinding) {
    data += `style:(${el.styleBinding}),`;
  }
  return data;
}

export default {
  staticKeys: ["staticStyle"],
  transformNode,
  genData,
};
