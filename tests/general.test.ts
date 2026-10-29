import { it, expect } from 'vitest';
import { validateGeneral } from '../server/general';
const input = {
  area: 'grammar' as const,
  pages: [
    {
      number: 1,
      text: 'Use the present perfect for an action connected to the present. The form is have or has plus the past participle.',
    },
  ],
};
const output = {
  study: [{ title: 'Present perfect', text: input.pages[0].text, hindi: '', page: 1 }],
  questions: [
    {
      stem: 'Which form makes the present perfect?',
      passage: '',
      options: ['have/has + past participle', 'will + verb', 'was + verb-ing', 'did + verb'],
      correctIndex: 0,
      page: 1,
      evidence: 'The form is have or has plus the past participle.',
      generated: true,
      explanation: 'This is the form stated in the source.',
    },
  ],
};
it('accepts source-grounded generated quizzes and rejects invented evidence, invalid keys and foreign pages', () => {
  expect(validateGeneral(output, input).questions[0].generated).toBe(true);
  for (const patch of [
    { evidence: 'A rule that is not in this PDF.' },
    { correctIndex: 9 },
    { page: 2 },
    { options: ['Same', 'Same'] },
  ])
    expect(() =>
      validateGeneral({ ...output, questions: [{ ...output.questions[0], ...patch }] }, input),
    ).toThrow();
});
