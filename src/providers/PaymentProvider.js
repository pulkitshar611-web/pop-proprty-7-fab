const stripeProvider = require('./StripeProvider');

/**
 * Mock Payment Provider
 * Simulates a gateway when real keys are missing.
 */
class MockProvider {
    async charge(amount, currency = 'USD') {
        console.log(`[MOCK] PaymentProvider: Attempting to charge ${currency} ${amount}`);
        await new Promise(resolve => setTimeout(resolve, 1500));
        const transactionId = `MOCK-TX-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
        return {
            success: true,
            transactionId: transactionId,
            provider: 'MOCK_GATEWAY'
        };
    }

    async transfer(totalAmount, landlordAmount, platformFee, destinationAccount) {
        console.log(`[MOCK] routing funds: $${landlordAmount} to landlord, $${platformFee} to platform.`);
        return { success: true, transferId: `MOCK-TR-${Date.now()}` };
    }

    async refund(transactionId, amount) {
        console.log(`[MOCK] Refunding ${amount} for TXID: ${transactionId}`);
        await new Promise(resolve => setTimeout(resolve, 800));
        return { success: true, refundId: `MOCK-REF-${Date.now()}` };
    }
}

/**
 * Payment Provider Facade
 */
class PaymentProvider {
    constructor() {
        this.mock = new MockProvider();
    }

    getProvider() {
        if (stripeProvider.isActive) {
            return stripeProvider;
        }
        return this.mock;
    }

    async charge(amount, currency = 'USD') {
        return this.getProvider().charge(amount, currency);
    }

    async transfer(totalAmount, landlordAmount, platformFee, destinationAccount) {
        return this.getProvider().transfer(totalAmount, landlordAmount, platformFee, destinationAccount);
    }

    async refund(transactionId, amount) {
        return this.getProvider().refund(transactionId, amount);
    }
}

module.exports = new PaymentProvider();
