import { z } from 'zod';

export const dataQualityExplanationSchema = z.object({
  headline: z.string().describe('One sentence stating the issue count.'),
  whyItMatters: z
    .string()
    .describe('What these gaps prevent or distort in the analysis.'),
  howToFix: z.array(z.string()).describe('2-4 short practical steps.'),
  limitations: z.array(z.string()),
});

export type DataQualityExplanationOutput = z.infer<
  typeof dataQualityExplanationSchema
>;
