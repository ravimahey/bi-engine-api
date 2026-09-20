import { z } from 'zod';
import { SUGGESTED_OPTIONS } from '../constants';

/**
 * What Gemini must return. `disclaimer` is deliberately absent — code adds
 * it, so the model can't water it down.
 */
export const costIncreaseExplanationSchema = z.object({
  headline: z
    .string()
    .describe('One sentence: what changed, with the exact spend figures.'),
  whatHappened: z
    .string()
    .describe('What the price/volume driver means for this change.'),
  whyItMatters: z
    .string()
    .describe('Why the owner should or should not care, without hype.'),
  limitations: z
    .array(z.string())
    .describe('What is unknown or not supported by the data.'),
  suggestedOptions: z.array(
    z.object({
      option: z.enum(SUGGESTED_OPTIONS),
      pros: z.array(z.string()),
      cons: z.array(z.string()),
    }),
  ),
});

export type CostIncreaseExplanationOutput = z.infer<
  typeof costIncreaseExplanationSchema
>;
