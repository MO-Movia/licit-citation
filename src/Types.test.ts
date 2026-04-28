/**
 * @license MIT
 * @copyright Copyright 2026 Modus Operandi Inc. All Rights Reserved.
 */

import { Citation } from './Types';

describe('Types and Interfaces', () => {
  test('Citation', () => {
    const citation: Citation = {
      overallDocumentCapco: 'Document Title',
      isCitationObject: true,
    };

    expect(citation).toBeDefined();
  });
});
