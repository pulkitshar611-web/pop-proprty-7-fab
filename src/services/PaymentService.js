const prisma = require('../config/prisma');
const paymentProvider = require('../providers/PaymentProvider');
const accountingService = require('./AccountingService');
const reminderService = require('./PaymentReminderService');

/**
 * Payment Service
 * Handles payment orchestration, validation, and idempotency.
 */
class PaymentService {
    async collectPayment(userId, invoiceId, idempotencyKey, method = 'card') {
        // 1. Fetch Invoice from DB
        const invoice = await prisma.invoice.findUnique({
            where: { id: parseInt(invoiceId) },
            include: {
                tenant: true,
                unit: {
                    include: {
                        property: true
                    }
                }
            }
        });

        if (!invoice) throw new Error('Invoice not found');
        if (invoice.tenantId !== userId) throw new Error('Unauthorized');
        if (invoice.status === 'paid') throw new Error('Invoice already paid');

        // 2. Check Idempotency
        const existingTx = await prisma.transaction.findUnique({
            where: { idempotencyKey }
        });
        if (existingTx) return { success: true, message: 'Duplicate request handled', transactionId: existingTx.id };

        // 3. Calculate Fees
        const rentAmount = parseFloat(invoice.rent);
        const serviceFees = parseFloat(invoice.serviceFees) || 0;
        const totalAmount = rentAmount + serviceFees;
        const platformFee = serviceFees;

        let paymentResult;

        if (method === 'wallet') {
            // WALLET PAYMENT LOGIC
            const wallet = await prisma.wallet.findUnique({ where: { userId } });
            if (!wallet) throw new Error('Wallet not found');

            if (parseFloat(wallet.balance) < totalAmount) {
                throw new Error('Insufficient wallet balance');
            }

            // Atomic decrement
            await prisma.wallet.update({
                where: { id: wallet.id },
                data: {
                    balance: { decrement: totalAmount },
                    transactions: {
                        create: {
                            type: 'RENT_PAYMENT',
                            amount: totalAmount,
                            method: 'WALLET',
                            status: 'SUCCESS'
                        }
                    }
                }
            });

            paymentResult = {
                success: true,
                transactionId: `WAL-${Date.now()}`,
                provider: 'WALLET'
            };

        } else {
            // EXTERNAL PROVIDER
            paymentResult = await paymentProvider.charge(totalAmount, 'USD');
            if (!paymentResult.success) {
                throw new Error('Payment gateway rejected transaction');
            }
        }

        // 5. Transfer funds (Stripe Connect logic) - skipped for Wallet if we assume money is already in system
        // But conceptually we still need to "move" it to owner. 
        // For now, we just proceed to Accounting which likely records the income for owner.

        const landlordAccountId = invoice.unit?.property?.ownerId ? `OWNER-${invoice.unit.property.ownerId}` : 'PLATFORM_RESERVE';

        // If it was external, we transferred. If wallet, we effectively moved internal credits.
        // We'll assume paymentProvider.transfer is for external stripes mostly.
        // If implementing real wallet-to-owner payout, we'd need more logic, but for "Pay Rent" flow V1:
        if (method !== 'wallet') {
            await paymentProvider.transfer(totalAmount, rentAmount, platformFee, landlordAccountId);
        }

        // 6. Record in Ledger and Update Invoice (Atomic)
        const result = await accountingService.processInvoicePayment(invoice.id, {
            method: paymentResult.provider,
            idempotencyKey: idempotencyKey,
            gatewayTxId: paymentResult.transactionId,
            amountPaid: totalAmount,
            rentCovered: rentAmount,
            serviceFee: serviceFees,
            feeTaken: 0
        });

        // 7. Notify Landlord (Async)
        reminderService.notifyLandlordPayment(invoice.id, totalAmount, invoice.tenant?.name || 'Tenant');

        return {
            success: true,
            invoiceId: result.id,
            transactionId: paymentResult.transactionId,
            receiptData: {
                rent: rentAmount,
                serviceFees: serviceFees,
                platformFee: platformFee,
                total: totalAmount
            }
        };
    }
}

module.exports = new PaymentService();
