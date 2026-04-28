/**
 * @license MIT
 * @copyright Copyright 2026 Modus Operandi Inc. All Rights Reserved.
 */

import {
  POSITION_MODE_PARAGRAPH,
  toAbsoluteFromStored,
} from './CitationPosition';

describe('CitationPosition', () => {
  it('returns null when paragraphPos is NaN', () => {
    const value = toAbsoluteFromStored({
      paragraphPos: 'x',
      from: '1',
      to: '2',
      positionMode: POSITION_MODE_PARAGRAPH,
    });
    expect(value).toBeNull();
  });

  it('returns null when from is NaN', () => {
    const value = toAbsoluteFromStored({
      paragraphPos: '10',
      from: 'x',
      to: '2',
      positionMode: POSITION_MODE_PARAGRAPH,
    });
    expect(value).toBeNull();
  });

  it('returns null when to is NaN', () => {
    const value = toAbsoluteFromStored({
      paragraphPos: '10',
      from: '1',
      to: 'x',
      positionMode: POSITION_MODE_PARAGRAPH,
    });
    expect(value).toBeNull();
  });

  it('returns absolute range for valid paragraph-relative values', () => {
    const value = toAbsoluteFromStored({
      paragraphPos: '10',
      from: '-2',
      to: '4',
      positionMode: POSITION_MODE_PARAGRAPH,
    });
    expect(value).toStrictEqual({
      from: 8,
      to: 14,
    });
  });
});
