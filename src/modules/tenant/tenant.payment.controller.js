const paymentService = require('../../services/PaymentService');
const prisma = require('../../config/prisma');

/**
 * Tenant Payment Controller
 * Production Implementation: Strictly validates against DB, uses Services.
 */
exports.processPayment = async (req, res) => {
    try {
        const userId = req.user.id;
        const { invoiceId, paymentMethod, method } = req.body;

        // Use a unique key for the transaction attempt (frontend should provide this, or we derive from invoice+attempt)
        // For V1, we use invoiceId + month as a base if not provided, but ideally, frontend sends a UUID.
        // Assuming frontend might not have changed, we'll use a derived key for now:
        const idempotencyKey = req.headers['x-idempotency-key'] || `IDEM-${userId}-${invoiceId}-${Date.now()}`;

        if (!invoiceId) {
            return res.status(400).json({ message: 'Invoice ID is required' });
        }

        // Call PaymentService - It fetches the correct amount from DB
        const result = await paymentService.collectPayment(userId, invoiceId, idempotencyKey, method || paymentMethod);

        res.json({
            success: true,
            message: 'Payment processed successfully',
            receipt: `RCP-${result.transactionId}`,
            transactionId: result.transactionId
        });

    } catch (e) {
        console.error('Payment Error:', e.message);
        res.status(400).json({ message: e.message || 'Payment processing failed' });
    }
};

const paypalProvider = require('../../providers/PaypalProvider');

/**
 * Initiate PayPal Payment
 */
exports.initiatePaypalPayment = async (req, res) => {
    try {
        const userId = req.user.id;
        const { invoiceId } = req.body;

        const invoice = await prisma.invoice.findUnique({
            where: { id: parseInt(invoiceId) }
        });

        if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
        if (invoice.tenantId !== userId) return res.status(403).json({ message: 'Unauthorized' });
        if (invoice.status === 'paid') return res.status(400).json({ message: 'Already paid' });

        const rentAmount = parseFloat(invoice.rent);
        const currentServiceFees = parseFloat(invoice.serviceFees) || 0;

        // Match the frontend's fixed $14.99 fee logic if not already applied
        const feeToAdd = (currentServiceFees === 0) ? 14.99 : 0;
        const totalAmount = rentAmount + currentServiceFees + feeToAdd;

        // Optionally update the invoice in DB to reflect the fee we are about to charge
        if (feeToAdd > 0) {
            await prisma.invoice.update({
                where: { id: invoice.id },
                data: {
                    serviceFees: feeToAdd,
                    amount: rentAmount + feeToAdd
                }
            });
        }

        const order = await paypalProvider.createOrder(totalAmount, 'USD');

        res.json({
            success: true,
            orderId: order.orderId
        });

    } catch (e) {
        console.error('Paypal Init Error:', e.message);
        res.status(500).json({ message: e.message });
    }
};

/**
 * Confirm PayPal Payment
 */
exports.confirmPaypalPayment = async (req, res) => {
    try {
        const userId = req.user.id;
        const { orderId, invoiceId } = req.body;

        const capture = await paypalProvider.captureOrder(orderId);

        if (capture.success) {
            // Update local DB via PaymentService or directly if simpler for now
            // But let's use the core PaymentService logic for consistency if possible
            // However, PaymentService.collectPayment is designed for a single step.
            // Let's call accountingService and prisma update directly here for clarity
            // since the money is already captured.

            const idempotencyKey = `PAYPAL-${orderId}`;
            await paymentService.collectPayment(userId, invoiceId, idempotencyKey, 'paypal');

            res.json({
                success: true,
                message: 'Payment confirmed and recorded',
                transactionId: capture.transactionId
            });
        }

    } catch (e) {
        console.error('Paypal Confirm Error:', e.message);
        res.status(500).json({ message: e.message });
    }
};
