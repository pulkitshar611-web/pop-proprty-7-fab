const prisma = require('../config/prisma');

/**
 * Accounting Service
 * Manages the financial ledger and ensures data integrity.
 */
class AccountingService {
    /**
     * Record a transaction in the ledger.
     * Should usually be called within a prisma.$transaction.
     */
    async recordTransaction(txData, txClient = prisma) {
        const {
            date,
            description,
            type,
            amount,
            invoiceId,
            propertyId,
            ownerId,
            idempotencyKey
        } = txData;

        // Fetch last balance to calculate new balance
        // Note: In high-concurrency, this needs a row-level lock or a different balance approach
        const lastTx = await txClient.transaction.findFirst({
            orderBy: { id: 'desc' }
        });
        const prevBalance = lastTx ? parseFloat(lastTx.balance) : 0;
        const newBalance = prevBalance + parseFloat(amount);

        return await txClient.transaction.create({
            data: {
                date: date || new Date(),
                description,
                type,
                amount: parseFloat(amount),
                balance: newBalance,
                status: 'Completed',
                invoiceId,
                propertyId,
                ownerId,
                idempotencyKey
            }
        });
    }

    /**
     * Reconcile an invoice payment.
     * Marks invoice as paid and creates a ledger entry atomically.
     */
    async processInvoicePayment(invoiceId, paymentData) {
        return await prisma.$transaction(async (tx) => {
            const invoice = await tx.invoice.findUnique({
                where: { id: invoiceId },
                include: { unit: { include: { property: true } } }
            });

            if (!invoice) throw new Error('Invoice not found');
            if (invoice.status === 'paid') return invoice;

            const amountPaid = paymentData.amountPaid || invoice.amount;

            // Update Invoice
            const updatedInvoice = await tx.invoice.update({
                where: { id: invoiceId },
                data: {
                    status: 'paid',
                    paidAt: new Date(),
                    paymentMethod: paymentData.method,
                    totalPaid: parseFloat(amountPaid)
                }
            });

            // Record Rent Income for Owner
            await this.recordTransaction({
                description: `Rent Payment for Invoice ${invoice.invoiceNo}`,
                type: 'Income',
                amount: paymentData.rentCovered || invoice.rent,
                invoiceId: invoice.id,
                propertyId: invoice.unit.propertyId,
                ownerId: invoice.unit.property.ownerId,
                idempotencyKey: `${paymentData.idempotencyKey}-RENT`
            }, tx);

            // Record Service Fee Income for Admin
            if (paymentData.serviceFee > 0) {
                await this.recordTransaction({
                    description: `Service Fee for Invoice ${invoice.invoiceNo}`,
                    type: 'Income',
                    amount: paymentData.serviceFee,
                    invoiceId: invoice.id,
                    propertyId: invoice.unit.propertyId,
                    ownerId: null, // Admin / Platform
                    idempotencyKey: `${paymentData.idempotencyKey}-FEE`
                }, tx);
            }

            return updatedInvoice;
        });
    }
}

module.exports = new AccountingService();
