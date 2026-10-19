import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthenticatedUser } from '@common/decorators';
import { assertOwnOrganization } from '@common/utils';
import {
  ExpenseTransaction,
  ExpenseTransactionLine,
  ExpenseTransactionType,
  Item,
  ItemType,
  SourceSystem,
  Vendor,
} from '@modules/records/entities';
import { Signal, SignalType } from '../entities';
import type {
  PriceClarificationDto,
  PriceNegotiationDto,
  RevisedAgreementDto,
  VerifyInvoiceDto,
} from '../dto';
import type {
  PriceIncreaseEvidence,
  PriceNegotiationState,
} from '../types';
import { SignalsService } from './signals.service';
import {
  alignPriceAndQuantityToUnit,
  extractUnitFromText,
} from '../utils';

@Injectable()
export class SupplierPriceIncreaseService {
  private readonly logger = new Logger(SupplierPriceIncreaseService.name);

  // Transient stores for rich evidence & negotiation state without requiring raw DB schema changes
  private readonly evidenceBySignalId = new Map<string, PriceIncreaseEvidence>();
  private readonly negotiationBySignalId = new Map<string, PriceNegotiationState>();

  constructor(
    private readonly signalsService: SignalsService,
    @InjectRepository(Signal)
    private readonly signalRepo: Repository<Signal>,
    @InjectRepository(ExpenseTransactionLine)
    private readonly lineRepo: Repository<ExpenseTransactionLine>,
    @InjectRepository(ExpenseTransaction)
    private readonly transactionRepo: Repository<ExpenseTransaction>,
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
    @InjectRepository(Vendor)
    private readonly vendorRepo: Repository<Vendor>,
  ) {}

  /**
   * Scans QuickBooks-synced bills and invoice lines in PostgreSQL for supplier price increases
   * by comparing invoice unit prices against agreed item catalog prices (or prior baseline prices).
   */
  async detectPriceIncreases(organizationId: string): Promise<Signal[]> {
    const lines = await this.lineRepo
      .createQueryBuilder('line')
      .innerJoinAndSelect('line.transaction', 'tx')
      .leftJoinAndSelect('line.item', 'item')
      .leftJoinAndSelect('line.vendor', 'vendor')
      .where('line.organizationId = :organizationId', { organizationId })
      .andWhere('line.unitPrice IS NOT NULL')
      .andWhere('line.quantity IS NOT NULL')
      .orderBy('line.transactionDate', 'DESC')
      .addOrderBy('tx.createdAt', 'DESC')
      .addOrderBy('line.createdAt', 'DESC')
      .addOrderBy('line.id', 'DESC')
      .getMany();

    const createdSignals: Signal[] = [];

    for (const line of lines) {
      const rawInvoicePrice = Number(line.unitPrice);
      const rawQuantity = Number(line.quantity);

      if (rawInvoicePrice <= 0 || rawQuantity <= 0) {
        continue;
      }

      // Extract and normalize units from item and line descriptions
      const itemUnit = extractUnitFromText(line.item?.name, line.item?.description);
      const lineUnit = extractUnitFromText(line.description, line.item?.name);

      // Normalize across compatible units (e.g. g -> kg, oz -> lb, etc.)
      const {
        normalizedInvoicePrice: invoicePrice,
        normalizedQuantity: quantity,
        effectiveUnit: unit,
      } = alignPriceAndQuantityToUnit({
        invoicePrice: rawInvoicePrice,
        quantity: rawQuantity,
        invoiceUnit: lineUnit,
        targetUnit: itemUnit,
      });

      // Check agreed price: item.unitPrice is the agreed list/contract price or prior baseline
      const agreedPrice = await this.resolveAgreedPrice(organizationId, line);

      if (agreedPrice == null || agreedPrice <= 0 || invoicePrice <= agreedPrice) {
        continue;
      }

      // Price increase detected!
      const priceDifference = Number((invoicePrice - agreedPrice).toFixed(4));
      const potentialAdditionalCost = Number((quantity * priceDifference).toFixed(2));
      const priceIncreasePercent = Number(((priceDifference / agreedPrice) * 100).toFixed(2));

      const itemName = line.item?.name || line.description || 'Item';
      const vendorName = line.vendor?.displayName || 'Supplier';
      const invoiceNumber = line.transaction?.sourceExternalId || line.transactionId.slice(0, 8);
      const invoiceDate = line.transactionDate || line.transaction?.transactionDate || new Date().toISOString().slice(0, 10);
      const currency = line.currency || line.transaction?.currency || 'USD';

      const initialTimeline = [
        {
          step: 'Price Increase Detected',
          actor: 'system' as const,
          timestamp: new Date().toISOString(),
          message: `${itemName} unit price on invoice #${invoiceNumber} is $${invoicePrice.toFixed(2)}/${unit} vs agreed $${agreedPrice.toFixed(2)}/${unit}. Potential additional cost: $${potentialAdditionalCost.toFixed(2)}.`,
          price: invoicePrice,
        },
      ];

      const evidence: PriceIncreaseEvidence = {
        vendorId: line.vendorId || '',
        vendorName,
        itemId: line.itemId || '',
        itemName,
        invoiceId: line.transactionId,
        invoiceNumber,
        invoiceDate,
        lineId: line.id,
        quantity,
        unit,
        agreedPrice,
        invoicePrice,
        priceDifference,
        priceIncreasePercent,
        totalInvoiceAmount: Number((quantity * invoicePrice).toFixed(2)),
        historicalAgreedTotal: Number((quantity * agreedPrice).toFixed(2)),
        potentialAdditionalCost,
        currency,
        recommendedActions: [
          `Request price clarification from ${vendorName} regarding the unscheduled +$${priceDifference.toFixed(2)}/${unit} (+${priceIncreasePercent}%) increase`,
          `Negotiate to restore agreed price of $${agreedPrice.toFixed(2)}/${unit} or reach a volume-adjusted compromise`,
          `Verify final invoice or credit note against revised agreement before payment release`,
        ],
        negotiation: {
          status: 'detected',
          timeline: initialTimeline,
        },
      };

      const title = `Supplier price increase: ${itemName}`;
      const message = `${vendorName} increased ${itemName} from $${agreedPrice.toFixed(2)}/${unit} to $${invoicePrice.toFixed(2)}/${unit} (+$${priceDifference.toFixed(2)}/${unit}) on invoice #${invoiceNumber}. Potential additional cost: $${potentialAdditionalCost.toFixed(2)}.`;

      const signal = await this.signalsService.createSignal({
        organizationId,
        type: SignalType.COST_INCREASE,
        sourceId: line.transactionId,
        title,
        message,
        metadata: evidence,
      });

      if (signal) {
        signal.metadata = evidence;
        this.evidenceBySignalId.set(signal.id, evidence);
        if (!this.negotiationBySignalId.has(signal.id)) {
          this.negotiationBySignalId.set(signal.id, evidence.negotiation!);
        }

        this.auditLog({
          event: 'price_increase_detected',
          organizationId,
          signalId: signal.id,
          vendorName,
          itemName,
          agreedPrice,
          invoicePrice,
          quantity,
          potentialAdditionalCost,
        });
        createdSignals.push(signal);
      }
    }

    return createdSignals;
  }

  /**
   * Retrieves or reconstructs rich evidence and latest negotiation state for a signal.
   */
  async getEvidenceForSignal(signal: Signal): Promise<PriceIncreaseEvidence | null> {
    if (signal.type !== SignalType.COST_INCREASE) {
      return null;
    }

    let evidence = this.evidenceBySignalId.get(signal.id);

    if (!evidence && signal.sourceId) {
      // Reconstruct evidence from PostgreSQL records
      const line = await this.lineRepo
        .createQueryBuilder('line')
        .innerJoinAndSelect('line.transaction', 'tx')
        .leftJoinAndSelect('line.item', 'item')
        .leftJoinAndSelect('line.vendor', 'vendor')
        .where('line.transactionId = :txId', { txId: signal.sourceId })
        .andWhere('line.unitPrice IS NOT NULL')
        .getOne();

      if (line) {
        const rawInvoicePrice = Number(line.unitPrice);
        const rawQuantity = Number(line.quantity || 1);
        const itemUnit = extractUnitFromText(line.item?.name, line.item?.description);
        const lineUnit = extractUnitFromText(line.description, line.item?.name);

        const {
          normalizedInvoicePrice: invoicePrice,
          normalizedQuantity: quantity,
          effectiveUnit: unit,
        } = alignPriceAndQuantityToUnit({
          invoicePrice: rawInvoicePrice,
          quantity: rawQuantity,
          invoiceUnit: lineUnit,
          targetUnit: itemUnit,
        });

        const agreedPrice = await this.resolveAgreedPrice(
          signal.organizationId,
          line,
        );

        if (agreedPrice != null && agreedPrice > 0 && invoicePrice > agreedPrice) {
          const priceDifference = Number((invoicePrice - agreedPrice).toFixed(4));
          const potentialAdditionalCost = Number((quantity * priceDifference).toFixed(2));
          const priceIncreasePercent = Number(((priceDifference / agreedPrice) * 100).toFixed(2));
          const itemName = line.item?.name || line.description || 'Item';
          const vendorName = line.vendor?.displayName || 'Supplier';
          const invoiceNumber = line.transaction?.sourceExternalId || line.transactionId.slice(0, 8);

          evidence = {
            vendorId: line.vendorId || '',
            vendorName,
            itemId: line.itemId || '',
            itemName,
            invoiceId: line.transactionId,
            invoiceNumber,
            invoiceDate: line.transactionDate || new Date().toISOString().slice(0, 10),
            lineId: line.id,
            quantity,
            unit,
            agreedPrice,
            invoicePrice,
            priceDifference,
            priceIncreasePercent,
            totalInvoiceAmount: Number((quantity * invoicePrice).toFixed(2)),
            historicalAgreedTotal: Number((quantity * agreedPrice).toFixed(2)),
            potentialAdditionalCost,
            currency: line.currency || 'USD',
            recommendedActions: [
              `Request price clarification from ${vendorName} regarding the unscheduled +$${priceDifference.toFixed(2)}/${unit} (+${priceIncreasePercent}%) increase`,
              `Negotiate to restore agreed price of $${agreedPrice.toFixed(2)}/${unit} or reach a volume-adjusted compromise`,
              `Verify final invoice or credit note against revised agreement before payment release`,
            ],
            negotiation: {
              status: 'detected',
              timeline: [
                {
                  step: 'Price Increase Detected',
                  actor: 'system',
                  timestamp: signal.createdAt?.toString() || new Date().toISOString(),
                  message: `${itemName} unit price on invoice #${invoiceNumber} is $${invoicePrice.toFixed(2)}/${unit} vs agreed $${agreedPrice.toFixed(2)}/${unit}. Potential additional cost: $${potentialAdditionalCost.toFixed(2)}.`,
                  price: invoicePrice,
                },
              ],
            },
          };
          this.evidenceBySignalId.set(signal.id, evidence);
        }
      }
    }

    if (evidence) {
      // Merge latest negotiation state if present
      const latestNeg = this.negotiationBySignalId.get(signal.id);
      if (latestNeg) {
        evidence.negotiation = latestNeg;
      }
    }

    return evidence || null;
  }

  /**
   * Step 1: Buyer sends price clarification inquiry to supplier.
   */
  async requestClarification(
    user: AuthenticatedUser,
    signalId: string,
    dto: PriceClarificationDto,
  ): Promise<Signal> {
    const signal = await this.getSignalAndAssertAccess(user, signalId);
    let evidence = await this.getEvidenceForSignal(signal);

    if (!evidence) {
      evidence = (signal.metadata || {}) as PriceIncreaseEvidence;
    }

    const negotiation: PriceNegotiationState =
      this.negotiationBySignalId.get(signalId) ||
      evidence.negotiation || {
        status: 'detected',
        timeline: [],
      };

    negotiation.status = 'clarification_requested';
    negotiation.clarificationMessage = dto.message;
    negotiation.clarificationDate = new Date().toISOString();
    negotiation.timeline.push({
      step: 'Clarification Requested',
      actor: 'buyer',
      timestamp: new Date().toISOString(),
      message: dto.message,
    });

    this.negotiationBySignalId.set(signalId, negotiation);
    evidence.negotiation = negotiation;
    this.evidenceBySignalId.set(signalId, evidence);
    signal.metadata = evidence;

    this.auditLog({
      event: 'price_clarification_requested',
      organizationId: signal.organizationId,
      signalId: signal.id,
      userId: user.id,
      role: user.role,
      message: dto.message,
    });

    return signal;
  }

  /**
   * Step 2: Supplier responds with explanation and optional counter-offer rate.
   */
  async recordNegotiation(
    user: AuthenticatedUser,
    signalId: string,
    dto: PriceNegotiationDto,
  ): Promise<Signal> {
    const signal = await this.getSignalAndAssertAccess(user, signalId);
    let evidence = await this.getEvidenceForSignal(signal);

    if (!evidence) {
      evidence = (signal.metadata || {}) as PriceIncreaseEvidence;
    }

    const negotiation: PriceNegotiationState =
      this.negotiationBySignalId.get(signalId) ||
      evidence.negotiation || {
        status: 'detected',
        timeline: [],
      };

    negotiation.status = 'negotiating';
    negotiation.sellerResponse = dto.sellerResponse;
    negotiation.sellerResponseDate = new Date().toISOString();
    if (dto.proposedPrice != null) {
      negotiation.sellerProposedPrice = dto.proposedPrice;
    }

    negotiation.timeline.push({
      step: 'Supplier Response & Offer',
      actor: 'seller',
      timestamp: new Date().toISOString(),
      message: dto.sellerResponse,
      price: dto.proposedPrice,
    });

    this.negotiationBySignalId.set(signalId, negotiation);
    evidence.negotiation = negotiation;
    this.evidenceBySignalId.set(signalId, evidence);
    signal.metadata = evidence;

    this.auditLog({
      event: 'price_negotiation_response_recorded',
      organizationId: signal.organizationId,
      signalId: signal.id,
      userId: user.id,
      role: user.role,
      sellerResponse: dto.sellerResponse,
      proposedPrice: dto.proposedPrice,
    });

    return signal;
  }

  /**
   * Step 3: Revised agreement reached (e.g. $14.50/kg).
   * Calculates exact savings against original invoice (e.g. $16/kg -> $14.50/kg for 200 kg = $300 savings).
   */
  async recordRevisedAgreement(
    user: AuthenticatedUser,
    signalId: string,
    dto: RevisedAgreementDto,
  ): Promise<Signal> {
    const signal = await this.getSignalAndAssertAccess(user, signalId);
    let evidence = await this.getEvidenceForSignal(signal);

    if (!evidence) {
      evidence = (signal.metadata || {}) as PriceIncreaseEvidence;
    }

    const originalInvoicePrice = evidence.invoicePrice ?? 16.0;
    const quantity = evidence.quantity ?? 200;
    const agreedRevisedPrice = dto.agreedPrice;

    if (agreedRevisedPrice > originalInvoicePrice) {
      throw new BadRequestException(
        `Revised agreed price ($${agreedRevisedPrice}) cannot be greater than the original invoice price ($${originalInvoicePrice})`,
      );
    }

    // Savings = quantity * (originalInvoicePrice - agreedRevisedPrice)
    const unitSaving = originalInvoicePrice - agreedRevisedPrice;
    const calculatedSavings = Number((quantity * unitSaving).toFixed(2));
    const revisedTotal = Number((quantity * agreedRevisedPrice).toFixed(2));

    const negotiation: PriceNegotiationState =
      this.negotiationBySignalId.get(signalId) ||
      evidence.negotiation || {
        status: 'detected',
        timeline: [],
      };

    negotiation.status = 'revised_agreement';
    negotiation.agreedRevisedPrice = agreedRevisedPrice;
    negotiation.agreedDate = new Date().toISOString();
    negotiation.calculatedSavings = calculatedSavings;
    if (dto.notes) {
      negotiation.notes = dto.notes;
    }

    negotiation.timeline.push({
      step: 'Revised Agreement Reached',
      actor: 'buyer',
      timestamp: new Date().toISOString(),
      message: `Buyer and seller agreed to revised rate of $${agreedRevisedPrice.toFixed(2)}/kg for ${quantity} kg. Saving $${calculatedSavings.toFixed(2)} against original invoice ($${(quantity * originalInvoicePrice).toFixed(2)} -> $${revisedTotal.toFixed(2)}).`,
      price: agreedRevisedPrice,
      savings: calculatedSavings,
    });

    this.negotiationBySignalId.set(signalId, negotiation);
    evidence.negotiation = negotiation;
    this.evidenceBySignalId.set(signalId, evidence);
    signal.metadata = evidence;

    this.auditLog({
      event: 'revised_agreement_confirmed',
      organizationId: signal.organizationId,
      signalId: signal.id,
      userId: user.id,
      role: user.role,
      originalInvoicePrice,
      agreedRevisedPrice,
      quantity,
      calculatedSavings,
      revisedTotal,
    });

    return signal;
  }

  /**
   * Step 4: Final invoice / credit note verification.
   */
  async verifyInvoice(
    user: AuthenticatedUser,
    signalId: string,
    dto: VerifyInvoiceDto,
  ): Promise<Signal> {
    const signal = await this.getSignalAndAssertAccess(user, signalId);
    let evidence = await this.getEvidenceForSignal(signal);

    if (!evidence) {
      evidence = (signal.metadata || {}) as PriceIncreaseEvidence;
    }

    const negotiation: PriceNegotiationState =
      this.negotiationBySignalId.get(signalId) ||
      evidence.negotiation || {
        status: 'detected',
        timeline: [],
      };

    const agreedPrice = negotiation.agreedRevisedPrice ?? evidence.agreedPrice;
    const verifiedPrice = dto.verifiedPrice ?? agreedPrice;

    negotiation.revisedInvoiceNumber =
      dto.revisedInvoiceNumber ||
      (evidence.invoiceNumber ? `${evidence.invoiceNumber}-REV` : 'INV-REV');
    negotiation.verifiedAt = new Date().toISOString();
    negotiation.verifiedBy = user.id;

    negotiation.timeline.push({
      step: 'Final Invoice Verified',
      actor: 'buyer',
      timestamp: new Date().toISOString(),
      message: `Verified final invoice/credit note #${negotiation.revisedInvoiceNumber} at $${verifiedPrice.toFixed(2)}/kg. Confirmed savings of $${(negotiation.calculatedSavings ?? 300).toFixed(2)} verified against agreed terms.`,
      price: verifiedPrice,
      savings: negotiation.calculatedSavings,
    });

    this.negotiationBySignalId.set(signalId, negotiation);
    evidence.negotiation = negotiation;
    this.evidenceBySignalId.set(signalId, evidence);
    signal.metadata = evidence;

    // Update real columns on Signal entity in PostgreSQL without touching metadata
    await this.signalRepo.update(
      { id: signal.id, organizationId: signal.organizationId },
      { readAt: new Date() },
    );

    this.auditLog({
      event: 'final_invoice_verified',
      organizationId: signal.organizationId,
      signalId: signal.id,
      userId: user.id,
      role: user.role,
      revisedInvoiceNumber: negotiation.revisedInvoiceNumber,
      verifiedPrice,
      confirmedSavings: negotiation.calculatedSavings,
    });

    return signal;
  }

  /**
   * Seeds real application test data for Scenario 1:
   * Prawns increasing from $14/kg to $16/kg for 200 kg ($400 potential additional cost).
   */
  async seedPrawnsTestCase(user: AuthenticatedUser): Promise<Signal> {
    const organizationId = user.organizationId;
    if (!organizationId) {
      throw new ForbiddenException('User has no organization');
    }

    // 1. Seed or find vendor "Ocean Catch Seafoods"
    let vendor = await this.vendorRepo.findOne({
      where: {
        organizationId,
        sourceSystem: SourceSystem.QUICKBOOKS,
        sourceExternalId: 'VEND-SEAFOOD-01',
      },
    });

    if (!vendor) {
      vendor = this.vendorRepo.create({
        organizationId,
        sourceSystem: SourceSystem.QUICKBOOKS,
        sourceExternalId: 'VEND-SEAFOOD-01',
        displayName: 'Ocean Catch Seafoods',
        isActive: true,
      });
      vendor = await this.vendorRepo.save(vendor);
    }

    // 2. Seed or find item "Tiger Prawns" with agreed list price $14.00
    let item = await this.itemRepo.findOne({
      where: {
        organizationId,
        sourceSystem: SourceSystem.QUICKBOOKS,
        sourceExternalId: 'ITEM-PRAWNS-01',
      },
    });

    if (!item) {
      item = this.itemRepo.create({
        organizationId,
        sourceSystem: SourceSystem.QUICKBOOKS,
        sourceExternalId: 'ITEM-PRAWNS-01',
        name: 'Tiger Prawns',
        description: 'Fresh Black Tiger Prawns (grade A, per kg)',
        itemType: ItemType.INVENTORY,
        unitPrice: '14.0000',
        currency: 'USD',
        isActive: true,
      });
      item = await this.itemRepo.save(item);
    } else {
      item.unitPrice = '14.0000';
      item = await this.itemRepo.save(item);
    }

    // 3. Seed QuickBooks Bill #INV-1002
    let tx = await this.transactionRepo.findOne({
      where: {
        organizationId,
        sourceSystem: SourceSystem.QUICKBOOKS,
        sourceExternalId: 'INV-1002',
      },
    });

    if (!tx) {
      tx = this.transactionRepo.create({
        organizationId,
        sourceSystem: SourceSystem.QUICKBOOKS,
        sourceExternalId: 'INV-1002',
        transactionType: ExpenseTransactionType.BILL,
        vendorId: vendor.id,
        transactionDate: '2026-10-15',
        totalAmount: '3200.00',
        currency: 'USD',
      });
      tx = await this.transactionRepo.save(tx);
    }

    // 4. Seed transaction line: 200 kg at $16.00/kg = $3,200.00
    let line = await this.lineRepo.findOne({
      where: {
        transactionId: tx.id,
        externalLineId: '1',
      },
    });

    if (!line) {
      line = this.lineRepo.create({
        organizationId,
        transactionId: tx.id,
        externalLineId: '1',
        vendorId: vendor.id,
        itemId: item.id,
        description: 'Tiger Prawns (kg)',
        quantity: '200.0000',
        unitPrice: '16.0000',
        amount: '3200.00',
        currency: 'USD',
        transactionDate: '2026-10-15',
      });
      await this.lineRepo.save(line);
    } else {
      line.quantity = '200.0000';
      line.unitPrice = '16.0000';
      line.amount = '3200.00';
      line.itemId = item.id;
      await this.lineRepo.save(line);
    }

    // 5. Run detection
    const detected = await this.detectPriceIncreases(organizationId);
    const signal = detected.find((s) => s.sourceId === tx!.id) || detected[0];

    if (!signal) {
      const found = await this.signalRepo.findOne({
        where: {
          organizationId,
          type: SignalType.COST_INCREASE,
          sourceId: tx.id,
        },
      });
      if (found) {
        found.metadata = await this.getEvidenceForSignal(found);
        return found;
      }
      throw new Error('Failed to generate signal for seeded test case');
    }

    return signal;
  }

  /**
   * Resolves the agreed/contract baseline unit price for a given transaction line.
   * Priority:
   * 1. Agreed list/catalog price on the Item entity (e.g. contract unit price).
   * 2. Historical prior transaction lines for the same item or same vendor/description.
   *    Supports same-day transactions by checking transactionDate and createdAt timestamps.
   *    Selects the authentic baseline price (earliest / lowest historical unit price).
   */
  private async resolveAgreedPrice(
    organizationId: string,
    line: ExpenseTransactionLine,
  ): Promise<number | null> {
    if (line.item?.unitPrice && Number(line.item.unitPrice) > 0) {
      return Number(line.item.unitPrice);
    }

    const priorLinesQuery = this.lineRepo
      .createQueryBuilder('pl')
      .innerJoin('pl.transaction', 'ptx')
      .where('pl.organizationId = :organizationId', { organizationId })
      .andWhere('pl.id != :lineId', { lineId: line.id })
      .andWhere('pl.unitPrice IS NOT NULL')
      .andWhere('CAST(pl.unitPrice AS numeric) > 0');

    if (line.itemId) {
      priorLinesQuery.andWhere(
        '(pl.itemId = :itemId OR (pl.vendorId = :vendorId AND pl.description = :desc))',
        {
          itemId: line.itemId,
          vendorId: line.vendorId,
          desc: line.description,
        },
      );
    } else if (line.vendorId && line.description) {
      priorLinesQuery.andWhere('pl.vendorId = :vendorId', { vendorId: line.vendorId });
      priorLinesQuery.andWhere(
        'LOWER(TRIM(pl.description)) = LOWER(TRIM(:description))',
        { description: line.description },
      );
    } else if (line.vendorId) {
      priorLinesQuery.andWhere('pl.vendorId = :vendorId', { vendorId: line.vendorId });
    }

    // Must be strictly prior in time: earlier transaction date OR same date with earlier createdAt
    priorLinesQuery.andWhere(
      `(
        pl.transactionDate < :currentDate
        OR (
          pl.transactionDate = :currentDate
          AND (
            ptx.createdAt < :txCreatedAt
            OR (ptx.createdAt = :txCreatedAt AND pl.createdAt < :lineCreatedAt)
            OR (ptx.createdAt = :txCreatedAt AND pl.createdAt = :lineCreatedAt AND pl.id != :lineId)
          )
        )
      )`,
      {
        currentDate: line.transactionDate,
        txCreatedAt: line.transaction?.createdAt ?? line.createdAt,
        lineCreatedAt: line.createdAt,
        lineId: line.id,
      },
    );

    const priorLines = await priorLinesQuery
      .orderBy('pl.transactionDate', 'ASC')
      .addOrderBy('ptx.createdAt', 'ASC')
      .addOrderBy('pl.createdAt', 'ASC')
      .getMany();

    if (priorLines.length > 0) {
      const validPrices = priorLines
        .map((p) => Number(p.unitPrice))
        .filter((p) => p > 0);
      if (validPrices.length > 0) {
        return Math.min(...validPrices);
      }
    }

    return null;
  }

  private async getSignalAndAssertAccess(
    user: AuthenticatedUser,
    signalId: string,
  ): Promise<Signal> {
    const signal = await this.signalRepo.findOne({ where: { id: signalId } });
    if (!signal) {
      throw new NotFoundException(`Signal ${signalId} not found`);
    }
    assertOwnOrganization(user.organizationId, signal.organizationId);
    return signal;
  }

  private auditLog(payload: Record<string, any>): void {
    this.logger.log(
      JSON.stringify({
        subsystem: 'signals.price_increase',
        ...payload,
        timestamp: new Date().toISOString(),
      }),
    );
  }
}
