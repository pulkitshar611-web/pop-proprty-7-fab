/**
 * Stripe Payment Provider
 * Handles integration with Stripe Connect.
 * Inactive until STRIPE_SECRET_KEY is provided.
 */
class StripeProvider {
    constructor() {
        this.apiKey = process.env.STRIPE_SECRET_KEY;
        this.isActive = !!this.apiKey;
    }

    async charge(amount, currency = 'USD', description = 'Rent Payment') {
        if (!this.isActive) {
            throw new Error('Stripe Provider is not configured (API Key missing)');
        }

        console.log(`[STRIPE] Attempting to charge ${currency} ${amount}`);
        
        // This is where real Stripe logic (using stripe node library) would go.
        // const charge = await stripe.charges.create({ ... });
        
        // For now, we simulate success if isActive is true (though it shouldn't be reached yet)
        return {
            success: true,
            transactionId: `STRIPE-CH-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
            provider: 'STRIPE'
        };
    }

    /**
     * Splits payment between Landlord and Platform
     * @param {number} totalAmount - Total paid by tenant ($1514.99)
     * @param {number} landlordAmount - Amount routed to landlord ($1500)
     * @param {number} platformFee - Amount routed to platform ($14.99)
     * @param {string} destinationAccount - Landlord's connected account ID
     */
    async transfer(totalAmount, landlordAmount, platformFee, destinationAccount) {
        if (!this.isActive) {
            throw new Error('Stripe Provider is not configured (API Key missing)');
        }

        console.log(`[STRIPE] Transferring ${landlordAmount} to ${destinationAccount} and ${platformFee} to Platform`);
        
        // Stripe Connect Transfer logic:
        // const transfer = await stripe.transfers.create({ ... });

        return {
            success: true,
            transferId: `STRIPE-TR-${Math.random().toString(36).substr(2, 9).toUpperCase()}`
        };
    }
}

module.exports = new StripeProvider();
