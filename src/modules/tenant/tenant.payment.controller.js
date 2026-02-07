const paymentService = require('../../services/PaymentService');

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
