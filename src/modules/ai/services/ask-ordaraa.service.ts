import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type AIMessageChunk,
  type BaseMessage,
} from '@langchain/core/messages';
import type { AuthenticatedUser } from '@common/decorators';
import { ASK_ORDARAA_SYSTEM_PROMPT, SUBMIT_ANSWER_TOOL } from '../constants';
import type { AskAnswerDto, AskFactDto, AskQuestionDto } from '../dto';
import { askAnswerSchema, type AskAnswerOutput } from '../schemas';
import {
  assertCanAccessOrganization,
  containsUnsupportedSavingClaim,
  findUngroundedNumbers,
} from '../utils';
import { AskToolsFactory } from './ask-tools.factory';
import { LlmService } from './llm.service';

const WITHHELD_ANSWER =
  'I could not produce a verified answer to that. The figures I retrieved are listed under facts.';
const WITHHELD_LIMITATION =
  'The generated answer cited figures that could not be matched to your data, so it was withheld.';
const UNANSWERED =
  'I do not have enough information in your Ordaraa data to answer that reliably.';

const textOf = (message: AIMessageChunk): string =>
  typeof message.content === 'string'
    ? message.content
    : message.content
        .map((part) => (part.type === 'text' ? part.text : ''))
        .join('');

/**
 * Ask Ordaraa - Pattern B from LANGCHAIN_INTEGRATION_GUIDE.md §3.6. The model
 * never touches the database: it asks for approved, tenant-scoped tools
 * (`AskToolsFactory`), we run them, feed the structured results back, and it
 * finishes by calling `submit_answer`. The answer is then checked against
 * the recorded tool results before it is returned.
 *
 *   authorize -> build per-request tools -> [model -> run tools]* ->
 *   submit_answer -> number/claim check -> answer + raw facts
 */
@Injectable()
export class AskOrdaraaService {
  private readonly logger = new Logger(AskOrdaraaService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly toolsFactory: AskToolsFactory,
  ) {}

  async ask(
    dto: AskQuestionDto,
    currentUser: AuthenticatedUser,
  ): Promise<AskAnswerDto> {
    // Cross-tenant requests stop here, before any tool exists or the model runs.
    assertCanAccessOrganization(currentUser, dto.organizationId);

    if (!this.llm.isAvailable) {
      throw new ServiceUnavailableException(
        'Ask Ordaraa is currently unavailable',
      );
    }

    const startedAt = Date.now();
    const today = new Date().toISOString().slice(0, 10);
    const { tools, facts } = this.toolsFactory.create(
      dto.organizationId,
      currentUser,
    );

    let output: AskAnswerOutput | undefined;
    try {
      output = await this.converse(dto.question, today, tools, facts);
    } catch (error) {
      this.logger.warn(
        `Ask Ordaraa failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new ServiceUnavailableException(
        'Ask Ordaraa could not answer right now, please try again',
      );
    }

    const answer = this.finalize(output, facts, dto.question, today);
    this.audit(dto, currentUser, answer, facts, Date.now() - startedAt);
    return answer;
  }

  /** The bounded model <-> tools loop. Returns the submitted (or plain-text) answer. */
  private async converse(
    question: string,
    today: string,
    tools: Awaited<ReturnType<AskToolsFactory['create']>>['tools'],
    facts: AskFactDto[],
  ): Promise<AskAnswerOutput | undefined> {
    const byName = new Map(tools.map((t) => [t.name, t]));
    const signal = this.llm.createDeadline();
    const messages: BaseMessage[] = [
      new SystemMessage(ASK_ORDARAA_SYSTEM_PROMPT),
      new HumanMessage(`Today's date: ${today}\nQuestion: ${question}`),
    ];

    for (let round = 0; round < this.llm.maxToolRounds; round++) {
      const reply = await this.llm.invokeWithTools(tools, messages, signal);
      messages.push(reply);

      const calls = reply.tool_calls ?? [];
      if (calls.length === 0) {
        // Prompt says never plain text; tolerate it rather than fail.
        return this.plainTextAnswer(textOf(reply), facts);
      }

      const submitted = calls.find((c) => c.name === SUBMIT_ANSWER_TOOL);
      if (submitted) {
        const parsed = askAnswerSchema.safeParse(submitted.args);
        return parsed.success ? parsed.data : undefined;
      }

      for (const call of calls) {
        messages.push(
          new ToolMessage({
            tool_call_id: call.id ?? call.name,
            content: await this.runTool(byName.get(call.name), call.args),
          }),
        );
      }
    }
    return undefined; // Out of rounds without a final answer.
  }

  private async runTool(
    tool: { invoke: (args: unknown) => Promise<unknown> } | undefined,
    args: unknown,
  ): Promise<string> {
    if (!tool) return JSON.stringify({ error: 'Unknown tool' });
    try {
      return String(await tool.invoke(args));
    } catch {
      // Schema-invalid arguments (bad date etc.) - tell the model, don't crash.
      return JSON.stringify({ error: 'Invalid tool arguments' });
    }
  }

  private plainTextAnswer(text: string, facts: AskFactDto[]): AskAnswerOutput {
    return {
      answer: text.trim() || UNANSWERED,
      answerType: facts.length > 0 ? 'calculated' : 'insufficient_evidence',
      limitations: [],
      outOfScope: false,
    };
  }

  /** Enforces the guardrails in code, whatever the model claimed. */
  private finalize(
    output: AskAnswerOutput | undefined,
    facts: AskFactDto[],
    question: string,
    today: string,
  ): AskAnswerDto {
    const base = { facts, model: this.llm.modelName };
    const generatedAt = new Date().toISOString();

    if (!output) {
      return {
        ...base,
        answer: UNANSWERED,
        answerType: 'insufficient_evidence',
        limitations: [],
        outOfScope: false,
        verified: true,
        generatedAt,
      };
    }

    const texts = [output.answer, ...output.limitations];
    const grounded =
      findUngroundedNumbers(texts, { question, today, facts }).length === 0 &&
      !containsUnsupportedSavingClaim(texts);

    if (!grounded) {
      return {
        ...base,
        answer: WITHHELD_ANSWER,
        answerType: 'insufficient_evidence',
        limitations: [WITHHELD_LIMITATION],
        outOfScope: false,
        verified: false,
        generatedAt,
      };
    }

    return {
      ...base,
      answer: output.answer,
      // No tool evidence => it can never be presented as fact/calculated.
      answerType:
        facts.length === 0 || output.outOfScope
          ? 'insufficient_evidence'
          : output.answerType,
      limitations: output.limitations,
      outOfScope: output.outOfScope,
      verified: true,
      generatedAt,
    };
  }

  /** Auditable trail (user, question, tools used, outcome, time) - see guide §5. */
  private audit(
    dto: AskQuestionDto,
    user: AuthenticatedUser,
    answer: AskAnswerDto,
    facts: AskFactDto[],
    elapsedMs: number,
  ): void {
    this.logger.log(
      JSON.stringify({
        event: 'ask_ordaraa',
        userId: user.id,
        role: user.role,
        organizationId: dto.organizationId,
        question: dto.question,
        tools: facts.map((f) => f.tool),
        answerType: answer.answerType,
        outOfScope: answer.outOfScope,
        verified: answer.verified,
        elapsedMs,
      }),
    );
  }
}
