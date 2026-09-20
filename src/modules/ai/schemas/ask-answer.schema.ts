import { z } from 'zod';

export const ASK_ANSWER_TYPES = [
  'fact',
  'calculated',
  'recommendation',
  'insufficient_evidence',
] as const;

export type AskAnswerType = (typeof ASK_ANSWER_TYPES)[number];

/** Arguments of the `submit_answer` tool — how the model delivers its final answer. */
export const askAnswerSchema = z.object({
  answer: z
    .string()
    .describe(
      'The answer for the owner, using only figures from tool results.',
    ),
  answerType: z.enum(ASK_ANSWER_TYPES),
  limitations: z
    .array(z.string())
    .describe('What is unknown or not supported by the data.'),
  outOfScope: z
    .boolean()
    .describe('True when the question is not about the owner’s spend data.'),
});

export type AskAnswerOutput = z.infer<typeof askAnswerSchema>;
