import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsModule } from '@modules/analytics/analytics.module';
import {
  ExpenseTransactionLine,
  SpendCategory,
  Vendor,
} from '@modules/records/entities';
import { AiInsightsController } from './ai-insights.controller';
import { AiController } from './ai.controller';
import { AskOrdaraaController } from './ask-ordaraa.controller';
import {
  AskOrdaraaService,
  AskToolsFactory,
  CostIncreaseExplainerService,
  DataQualityExplainerService,
  DuplicateExplainerService,
  ExpenseSummaryExplainerService,
  ExplanationRunnerService,
  LlmService,
  NameResolverService,
  SubjectNameService,
  TopSupplierIncreasesService,
} from './services';

/**
 * LangChain + Gemini layer over the analytics findings -
 * LANGCHAIN_INTEGRATION_GUIDE.md §3.1-3.4 and §3.6. Additive: it reuses
 * `AnalyticsModule`'s exported services for every number (BI calculates,
 * AI explains) and reads `records`' entities only to resolve names and to
 * run the one ranking query analytics doesn't have; neither module depends
 * back on this one.
 */
@Module({
  imports: [
    AnalyticsModule,
    TypeOrmModule.forFeature([ExpenseTransactionLine, SpendCategory, Vendor]),
  ],
  controllers: [AiController, AiInsightsController, AskOrdaraaController],
  providers: [
    LlmService,
    ExplanationRunnerService,
    SubjectNameService,
    NameResolverService,
    TopSupplierIncreasesService,
    CostIncreaseExplainerService,
    DuplicateExplainerService,
    DataQualityExplainerService,
    ExpenseSummaryExplainerService,
    AskToolsFactory,
    AskOrdaraaService,
  ],
})
export class AiModule {}
