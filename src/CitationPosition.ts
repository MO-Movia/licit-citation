/**
 * @license MIT
 * @copyright Copyright 2026 Modus Operandi Inc. All Rights Reserved.
 */

import { Attrs,  } from 'prosemirror-model';

export const POSITION_MODE_PARAGRAPH = 'paragraph';
export const POSITION_MODE_GLOBAL = 'global'; 

export function toAbsoluteFromStored(attrs: Attrs) {
  const paragraphPos = Number(attrs.paragraphPos);
  const from = Number(attrs.from);
  const to = Number(attrs.to);

  if (Number.isNaN(paragraphPos) || Number.isNaN(from) || Number.isNaN(to)) {
    return null;
  }

  return {
    from: paragraphPos + from,
    to: paragraphPos + to,
  };
}
