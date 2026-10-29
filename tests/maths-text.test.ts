import { it, expect } from 'vitest';
import { englishMathText } from '../src/core/mathsText';
it('selects source English while keeping fractions, symbols, numbered statements and numeric options', () => {
  expect(
    englishMathText(
      'Which statement is correct?\nनिम्न में से कौन सही है?\n(1) [[frac:1/8]] = 12.5%',
    ),
  ).toBe('Which statement is correct?\n(1) [[frac:1/8]] = 12.5%');
  expect(englishMathText('1, 2 and 3 only / केवल 1, 2 और 3')).toBe('1, 2 and 3 only');
  expect(englishMathText('1.72 percent less (1.72 प्रतिशत कम)')).toBe('1.72 percent less');
  expect(englishMathText('₹1,500')).toBe('₹1,500');
  expect(englishMathText('1, 2, 3 and 4 / 1, 2, 3 और 4')).toBe('1, 2, 3 and 4');
});
it('does not rewrite purely English material or discard a Hindi-only source', () => {
  expect(englishMathText('A/B = 25%\nFind x².')).toBe('A/B = 25%\nFind x².');
  expect(englishMathText('प्रश्न का उत्तर चुनें')).toBe('प्रश्न का उत्तर चुनें');
});
