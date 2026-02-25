const checkoutNodeJssdk = require('@paypal/checkout-server-sdk');

/**
 * PayPal Provider
 * Uses PayPal Checkout Node.js SDK (v2 Orders API)
 */
class PaypalProvider {
    constructor() {
        const clientId = process.env.PAYPAL_CLIENT_ID;
        const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
        const mode = process.env.PAYPAL_MODE || 'sandbox';

        if (mode === 'live') {
            this.environment = new checkoutNodeJssdk.core.LiveEnvironment(clientId, clientSecret);
        } else {
            this.environment = new checkoutNodeJssdk.core.SandboxEnvironment(clientId, clientSecret);
        }

        this.client = new checkoutNodeJssdk.core.PayPalHttpClient(this.environment);
    }

    /**
     * Create a PayPal Order
     */
    async createOrder(amount, currency = 'USD') {
        const request = new checkoutNodeJssdk.orders.OrdersCreateRequest();
        request.prefer("return=representation");
        request.requestBody({
            intent: 'CAPTURE',
            purchase_units: [{
                amount: {
                    currency_code: currency,
                    value: amount.toString()
                }
            }]
        });

        try {
            const response = await this.client.execute(request);
            return {
                success: true,
                orderId: response.result.id,
                status: response.result.status
            };
        } catch (err) {
            console.error('PayPal Create Order Error:', err.statusCode, err.message);
            if (err.message) {
                try {
                    const parsedErr = JSON.parse(err.message);
                    console.error('PayPal Error Details:', JSON.stringify(parsedErr, null, 2));
                } catch (pe) {
                    console.error('Raw PayPal Error:', err.message);
                }
            }
            throw new Error('Failed to create PayPal order: ' + err.message);
        }
    }

    /**
     * Capture a PayPal Order
     */
    async captureOrder(orderId) {
        const request = new checkoutNodeJssdk.orders.OrdersCaptureRequest(orderId);
        request.requestBody({});

        try {
            const response = await this.client.execute(request);
            return {
                success: true,
                transactionId: response.result.purchase_units[0].payments.captures[0].id,
                status: response.result.status
            };
        } catch (err) {
            console.error('PayPal Capture Order Error:', err.message);
            throw new Error('Failed to capture PayPal payment');
        }
    }
}

module.exports = new PaypalProvider();
