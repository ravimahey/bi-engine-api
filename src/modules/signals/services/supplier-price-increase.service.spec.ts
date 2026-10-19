import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { AuthenticatedUser } from '@common/decorators';
import {
  ExpenseTransaction,
  ExpenseTransactionLine,
  Item,
  Vendor,
} from '@modules/records/entities';
import { UserRole } from '@modules/users/entities';
import { Signal, SignalSeverity, SignalSourceType, SignalType } from '../entities';
import { SignalsService } from './signals.service';
import { SupplierPriceIncreaseService } from './supplier-price-increase.service';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';

const USER_A: AuthenticatedUser = {
  id: 'user-a-1',
  email: 'buyer@restaurant.com',
  role: UserRole.OWNER,
  organizationId: ORG_A,
};

const USER_B: AuthenticatedUser = {
  id: 'user-b-1',
  email: 'other@company.com',
  role: UserRole.OWNER,
  organizationId: ORG_B,
};

describe('SupplierPriceIncreaseService', () => {
  let service: SupplierPriceIncreaseService;
  let signalsService: { createSignal: jest.Mock };
  let signalRepo: { findOne: jest.Mock; save: jest.Mock };
  let lineRepo: { createQueryBuilder: jest.Mock };
  let transactionRepo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let itemRepo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let vendorRepo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };

  beforeEach(async () => {
    signalsService = {
      createSignal: jest.fn(),
    };
    signalRepo = {
      findOne: jest.fn(),
      save: jest.fn((entity) => Promise.resolve({ ...entity })),
    };
    lineRepo = {
      createQueryBuilder: jest.fn(),
    };
    transactionRepo = {
      findOne: jest.fn(),
      create: jest.fn((e) => ({ ...e, id: 'tx-1' })),
      save: jest.fn((e) => Promise.resolve({ ...e, id: 'tx-1' })),
    };
    itemRepo = {
      findOne: jest.fn(),
      create: jest.fn((e) => ({ ...e, id: 'item-1' })),
      save: jest.fn((e) => Promise.resolve({ ...e, id: 'item-1' })),
    };
    vendorRepo = {
      findOne: jest.fn(),
      create: jest.fn((e) => ({ ...e, id: 'vendor-1' })),
      save: jest.fn((e) => Promise.resolve({ ...e, id: 'vendor-1' })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupplierPriceIncreaseService,
        { provide: SignalsService, useValue: signalsService },
        { provide: getRepositoryToken(Signal), useValue: signalRepo },
        { provide: getRepositoryToken(ExpenseTransactionLine), useValue: lineRepo },
        { provide: getRepositoryToken(ExpenseTransaction), useValue: transactionRepo },
        { provide: getRepositoryToken(Item), useValue: itemRepo },
        { provide: getRepositoryToken(Vendor), useValue: vendorRepo },
      ],
    }).compile();

    service = module.get(SupplierPriceIncreaseService);
  });

  describe('Scenario 1: Detecting Prawns Supplier Price Increase ($14 to $16 for 200 kg = $400)', () => {
    it('detects prawns price increase and calculates exactly $400 potential additional cost', async () => {
      // Mock line: 200 kg at $16.00/kg
      const mockLine = {
        id: 'line-prawns-1',
        transactionId: 'tx-inv-1002',
        organizationId: ORG_A,
        vendorId: 'vendor-seafood-1',
        itemId: 'item-prawns-1',
        description: 'Tiger Prawns (kg)',
        quantity: '200.0000',
        unitPrice: '16.0000',
        amount: '3200.00',
        currency: 'USD',
        transactionDate: '2026-10-15',
        item: {
          id: 'item-prawns-1',
          name: 'Tiger Prawns',
          unitPrice: '14.0000', // Agreed list price is $14.00/kg
        },
        vendor: {
          id: 'vendor-seafood-1',
          displayName: 'Ocean Catch Seafoods',
        },
        transaction: {
          id: 'tx-inv-1002',
          sourceExternalId: 'INV-1002',
          transactionDate: '2026-10-15',
          currency: 'USD',
        },
      };

      const qb: any = {
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockLine]),
      };
      lineRepo.createQueryBuilder.mockReturnValue(qb);

      signalsService.createSignal.mockImplementation((input) =>
        Promise.resolve({
          id: 'signal-1',
          ...input,
          severity: SignalSeverity.WARNING,
          sourceType: SignalSourceType.INVOICE,
          status: 'unread',
        }),
      );

      const signals = await service.detectPriceIncreases(ORG_A);

      expect(signals).toHaveLength(1);
      expect(signalsService.createSignal).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: ORG_A,
          type: SignalType.COST_INCREASE,
          sourceId: 'tx-inv-1002',
          title: 'Supplier price increase: Tiger Prawns',
          message: expect.stringContaining(
            'Ocean Catch Seafoods increased Tiger Prawns from $14.00/kg to $16.00/kg',
          ),
          metadata: expect.objectContaining({
            agreedPrice: 14,
            invoicePrice: 16,
            quantity: 200,
            priceDifference: 2,
            potentialAdditionalCost: 400, // Exact $400 calculation
            totalInvoiceAmount: 3200,
            historicalAgreedTotal: 2800,
            recommendedActions: expect.arrayContaining([
              expect.stringContaining('Request price clarification'),
              expect.stringContaining('Negotiate'),
            ]),
            negotiation: expect.objectContaining({
              status: 'detected',
            }),
          }),
        }),
      );

      // Verify calculation
      const createdMetadata = signalsService.createSignal.mock.calls[0][0].metadata;
      expect(createdMetadata.potentialAdditionalCost).toBe(400);
      expect(createdMetadata.priceDifference).toBe(2);
    });

    it('ignores lines where invoice price is equal to or less than agreed price', async () => {
      const mockLine = {
        id: 'line-normal-1',
        transactionId: 'tx-1',
        organizationId: ORG_A,
        quantity: '200.0000',
        unitPrice: '14.0000',
        item: { name: 'Tiger Prawns', unitPrice: '14.0000' },
        vendor: { displayName: 'Ocean Catch Seafoods' },
        transaction: { sourceExternalId: 'INV-1001' },
      };

      const qb: any = {
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockLine]),
      };
      lineRepo.createQueryBuilder.mockReturnValue(qb);

      const signals = await service.detectPriceIncreases(ORG_A);
      expect(signals).toHaveLength(0);
      expect(signalsService.createSignal).not.toHaveBeenCalled();
    });
  });

  describe('Step 1: Buyer-Seller Price Clarification', () => {
    it('records clarification request and updates timeline', async () => {
      const mockSignal: any = {
        id: 'signal-1',
        organizationId: ORG_A,
        type: SignalType.COST_INCREASE,
        metadata: {
          itemName: 'Tiger Prawns',
          agreedPrice: 14,
          invoicePrice: 16,
          quantity: 200,
          potentialAdditionalCost: 400,
          negotiation: {
            status: 'detected',
            timeline: [{ step: 'Detected', actor: 'system', timestamp: '2026-10-15T10:00:00Z', message: 'Detected' }],
          },
        },
      };

      signalRepo.findOne.mockResolvedValue(mockSignal);

      const result = await service.requestClarification(USER_A, 'signal-1', {
        message: 'Invoice reflects $16/kg instead of contracted $14/kg. Please clarify this increase.',
      });

      expect(result.metadata!.negotiation.status).toBe('clarification_requested');
      expect(result.metadata!.negotiation.clarificationMessage).toBe(
        'Invoice reflects $16/kg instead of contracted $14/kg. Please clarify this increase.',
      );
      expect(result.metadata!.negotiation.timeline).toHaveLength(2);
      expect(result.metadata!.negotiation.timeline[1].step).toBe('Clarification Requested');
      expect(result.metadata!.negotiation.timeline[1].actor).toBe('buyer');
    });
  });

  describe('Step 2: Negotiation & Counter-Offer', () => {
    it('records supplier counter-proposal and proposed rate', async () => {
      const mockSignal: any = {
        id: 'signal-1',
        organizationId: ORG_A,
        metadata: {
          itemName: 'Tiger Prawns',
          negotiation: {
            status: 'clarification_requested',
            timeline: [],
          },
        },
      };

      signalRepo.findOne.mockResolvedValue(mockSignal);

      const result = await service.recordNegotiation(USER_A, 'signal-1', {
        sellerResponse: 'Cold storage costs increased, but we can offer $14.50/kg for this delivery.',
        proposedPrice: 14.5,
      });

      expect(result.metadata!.negotiation.status).toBe('negotiating');
      expect(result.metadata!.negotiation.sellerProposedPrice).toBe(14.5);
      expect(result.metadata!.negotiation.sellerResponse).toContain('offer $14.50/kg');
    });
  });

  describe('Step 3: Revised Agreement & $300 Savings Calculation', () => {
    it('calculates exactly $300 saving against original $16/kg invoice when seller agrees to $14.50/kg', async () => {
      const mockSignal: any = {
        id: 'signal-1',
        organizationId: ORG_A,
        metadata: {
          itemName: 'Tiger Prawns',
          agreedPrice: 14,
          invoicePrice: 16, // Original invoice price = $16/kg
          quantity: 200,    // Quantity = 200 kg
          potentialAdditionalCost: 400,
          negotiation: {
            status: 'negotiating',
            timeline: [],
          },
        },
      };

      signalRepo.findOne.mockResolvedValue(mockSignal);

      const result = await service.recordRevisedAgreement(USER_A, 'signal-1', {
        agreedPrice: 14.5, // Seller agrees to $14.50/kg
        notes: 'Agreed compromise rate for invoice #INV-1002.',
      });

      // Saving = 200 kg * ($16 - $14.50) = 200 * $1.50 = $300.00
      expect(result.metadata!.negotiation.status).toBe('revised_agreement');
      expect(result.metadata!.negotiation.agreedRevisedPrice).toBe(14.5);
      expect(result.metadata!.negotiation.calculatedSavings).toBe(300); // Exact $300 calculation!
      expect(result.metadata!.negotiation.timeline).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            step: 'Revised Agreement Reached',
            price: 14.5,
            savings: 300,
          }),
        ]),
      );
    });

    it('rejects revised agreed price that exceeds original invoice price', async () => {
      const mockSignal: any = {
        id: 'signal-1',
        organizationId: ORG_A,
        metadata: {
          invoicePrice: 16,
          quantity: 200,
          negotiation: { status: 'negotiating', timeline: [] },
        },
      };

      signalRepo.findOne.mockResolvedValue(mockSignal);

      await expect(
        service.recordRevisedAgreement(USER_A, 'signal-1', { agreedPrice: 17.5 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Step 4: Final Invoice Verification', () => {
    it('verifies corrected invoice and confirms $300 savings', async () => {
      const mockSignal: any = {
        id: 'signal-1',
        organizationId: ORG_A,
        metadata: {
          itemName: 'Tiger Prawns',
          invoicePrice: 16,
          quantity: 200,
          negotiation: {
            status: 'revised_agreement',
            agreedRevisedPrice: 14.5,
            calculatedSavings: 300,
            timeline: [],
          },
        },
      };

      signalRepo.findOne.mockResolvedValue(mockSignal);

      const result = await service.verifyInvoice(USER_A, 'signal-1', {
        revisedInvoiceNumber: 'INV-1002-REV',
        verifiedPrice: 14.5,
        notes: 'Credit note #CN-1002 applied for $300.00 difference.',
      });

      expect(result.metadata!.negotiation.status).toBe('verified');
      expect(result.metadata!.negotiation.revisedInvoiceNumber).toBe('INV-1002-REV');
      expect(result.metadata!.negotiation.timeline).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            step: 'Final Invoice Verified',
            price: 14.5,
            savings: 300,
          }),
        ]),
      );
      expect(result.readAt).toBeDefined();
    });
  });

  describe('Multi-Tenant Isolation & Security', () => {
    it('blocks user from Organization B accessing signal belonging to Organization A', async () => {
      const mockSignal: any = {
        id: 'signal-1',
        organizationId: ORG_A, // Belongs to Organization A
        metadata: {},
      };

      signalRepo.findOne.mockResolvedValue(mockSignal);

      await expect(
        service.requestClarification(USER_B, 'signal-1', { message: 'Inquiry' }),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.recordRevisedAgreement(USER_B, 'signal-1', { agreedPrice: 14.5 }),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.verifyInvoice(USER_B, 'signal-1', { revisedInvoiceNumber: 'REV' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when signal does not exist', async () => {
      signalRepo.findOne.mockResolvedValue(null);

      await expect(
        service.requestClarification(USER_A, 'non-existent', { message: 'Inquiry' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
