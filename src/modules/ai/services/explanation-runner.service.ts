import { Injectable, Logger } from '@nestjs/common';
import type { z } from 'zod';
import { findUngroundedNumbers } from '../utils';
import { LlmService } from './llm.service';

export interface GroundedRunOptions<T> {
  /** Log label, e.g. 'duplicates'. */
  label: string;
  schema: z.ZodType<T>;
  systemPrompt: string;
  /** Exactly what the model sees; every figure it may quote must be in here. */
  facts: unknown;
  /** Every free-text field of the output, for the number and claim checks. */
  collectTexts: (output: T) => string[];
  hasUnsupportedClaim: (texts: string[]) => boolean;
  /** Optional structural check, e.g. "one entry per group". */
  isStructurallyValid?: (output: T) => boolean;
}

/**
 * The shared "BI first, AI second" step for every explain endpoint: one
 * Gemini call over already-computed facts, then the guardrail checks. Returns
 * `null` (never throws) when AI is off, fails or times out, or the text cites
 * a figure or claim the facts don't support - the caller then returns its
 * deterministic data with `explanation: null`.
 */
@Injectable()
export class ExplanationRunnerService {
  private readonly logger = new Logger(ExplanationRunnerService.name);

  constructor(private readonly llm: LlmService) {}

  get isAvailable(): boolean {
    return this.llm.isAvailable;
  }

  get modelName(): string {
    return this.llm.modelName;
  }

  async run<T extends Record<string, unknown>>(
    options: GroundedRunOptions<T>,
  ): Promise<T | null> {
    if (!this.llm.isAvailable) return null;

    let output: T;
    try {
      output = await this.llm.generateStructured(
        options.schema,
        options.systemPrompt,
        `FACTS:\n${JSON.stringify(options.facts)}`,
      );
    } catch (error) {
      this.logger.warn(
        `[${options.label}] Gemini failed, returning data only: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }

    if (options.isStructurallyValid && !options.isStructurallyValid(output)) {
      this.logger.warn(
        `[${options.label}] Explanation rejected: bad structure`,
      );
      return null;
    }

    const texts = options.collectTexts(output);
    const ungrounded = findUngroundedNumbers(texts, options.facts);
    if (ungrounded.length > 0) {
      this.logger.warn(
        `[${options.label}] Explanation rejected: figures not in the facts (${ungrounded.join(', ')})`,
      );
      return null;
    }

    if (options.hasUnsupportedClaim(texts)) {
      this.logger.warn(
        `[${options.label}] Explanation rejected: unsupported cause/saving claim`,
      );
      return null;
    }

    return output;
  }
}
