import { z } from 'zod';

export const duplicateExplanationSchema = z.object({
  summary: z
    .string()
    .describe('1-2 sentences using only the totals given in the facts.'),
  groups: z
    .array(
      z.object({
        explanation: z
          .string()
          .describe('One sentence about this possible duplicate group.'),
        checklist: z
          .array(z.string())
          .describe('2-3 things the owner can verify.'),
      }),
    )
    .describe('Exactly one entry per group in the facts, same order.'),
  limitations: z.array(z.string()),
});

export type DuplicateExplanationOutput = z.infer<
  typeof duplicateExplanationSchema
>;
