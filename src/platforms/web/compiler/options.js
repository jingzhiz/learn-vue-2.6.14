/* @flow */

import {
  isPreTag,
  mustUseProp,
  isReservedTag,
  getTagNamespace,
} from "../util/index";

import modules from "./modules/index";
import directives from "./directives/index";
import { genStaticKeys } from "shared/util";
import { isUnaryTag, canBeLeftOpenTag } from "./util";

export const baseOptions: CompilerOptions = {
  expectHTML: true,
  /*
    # 处理 class、style、v-model
  */
  modules,
  directives,
  /*
    # 是否是 pre 标签
  */
  isPreTag,
  /*
    # 是否是自闭合标签
  */
  isUnaryTag,
  mustUseProp,
  /*
    # 可以只写开始标签的标签，结束标签浏览器会自动补全
  */
  canBeLeftOpenTag,
  isReservedTag,
  getTagNamespace,
  staticKeys: genStaticKeys(modules),
};
