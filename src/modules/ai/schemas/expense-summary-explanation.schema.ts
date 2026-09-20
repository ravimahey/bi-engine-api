import { z } from 'zod';

export const expenseSummaryExplanationSchema = z.object({
  headline: z.string().describe('One sentence with the total spend.'),
  summary: z.string().describe('1-3 sentences on where the money went.'),
  drivers: z
    .array(z.string())
    .describe(
      'One sentence per category increase; empty without a comparison.',
    ),
  limitations: z.array(z.string()),
});

export type ExpenseSummaryExplanationOutput = z.infer<
  typeof expenseSummaryExplanationSchema
>;
