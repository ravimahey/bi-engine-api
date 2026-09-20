import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  HumanMessage,
  SystemMessage,
  type AIMessageChunk,
  type BaseMessage,
} from '@langchain/core/messages';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import type { z } from 'zod';
import { AI_CONFIG_KEY, type AiConfig } from '@config';
import { AI_MAX_RETRIES } from '../constants';

/**
 * The one place a Gemini client is built. Every AI feature goes through
 * `generateStructured`, so the model, temperature, timeout and kill switch
 * are configured once (`AI_*` / `GEMINI_MODEL` env vars).
 */
@Injectable()
export class LlmService {
  private client: ChatGoogleGenerativeAI | undefined;
  private readonly config: AiConfig;

  constructor(configService: ConfigService) {
    this.config = configService.getOrThrow<AiConfig>(AI_CONFIG_KEY);
  }

  /** False when the kill switch is off or no API key is set. */
  get isAvailable(): boolean {
    return this.config.enabled && this.config.googleApiKey.length > 0;
  }

  get modelName(): string {
    return this.config.model;
  }

  async generateStructured<T extends Record<string, unknown>>(
    schema: z.ZodType<T>,
    systemPrompt: string,
    userPrompt: string,
  ): Promise<T> {
    const structured = this.getClient().withStructuredOutput<T>(schema);

    return structured.invoke(
      [new SystemMessage(systemPrompt), new HumanMessage(userPrompt)],
      { signal: AbortSignal.timeout(this.config.timeoutMs) },
    );
  }

  /** Model round-trip cap for one tool-calling conversation (`AI_MAX_TOOL_ROUNDS`). */
  get maxToolRounds(): number {
    return this.config.maxToolRounds;
  }

  /** One deadline for a whole multi-round conversation, not per model call. */
  createDeadline(): AbortSignal {
    return AbortSignal.timeout(this.config.timeoutMs);
  }

  /**
   * One model turn with tools bound. The caller owns the loop (execute the
   * returned `tool_calls`, append the results, call again) so it can cap
   * rounds and enforce per-request authorization on every tool run.
   */
  async invokeWithTools(
    tools: StructuredToolInterface[],
    messages: BaseMessage[],
    signal: AbortSignal,
  ): Promise<AIMessageChunk> {
    return this.getClient().bindTools(tools).invoke(messages, { signal });
  }

  private getClient(): ChatGoogleGenerativeAI {
    this.client ??= new ChatGoogleGenerativeAI({
      apiKey: this.config.googleApiKey,
      model: this.config.model,
      temperature: this.config.temperature,
      maxRetries: AI_MAX_RETRIES,
    });
    return this.client;
  }
}
