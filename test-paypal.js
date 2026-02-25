require('dotenv').config();
const checkoutNodeJssdk = require('@paypal/checkout-server-sdk');

const clientId = process.env.PAYPAL_CLIENT_ID;
const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
const mode = process.env.PAYPAL_MODE || 'sandbox';

console.log('Using Client ID:', clientId);
console.log('Using Client Secret:', clientSecret);
console.log('Mode:', mode);

let environment;
if (mode === 'live') {
    environment = new checkoutNodeJssdk.core.LiveEnvironment(clientId, clientSecret);
} else {
    environment = new checkoutNodeJssdk.core.SandboxEnvironment(clientId, clientSecret);
}

const client = new checkoutNodeJssdk.core.PayPalHttpClient(environment);

async function test() {
    const request = new checkoutNodeJssdk.orders.OrdersCreateRequest();
    request.prefer("return=representation");
    request.requestBody({
        intent: 'CAPTURE',
        purchase_units: [{
            amount: {
                currency_code: 'USD',
                value: '1.00'
            }
        }]
    });

    try {
        console.log('Sending request to PayPal...');
        const response = await client.execute(request);
        console.log('SUCCESS!');
        console.log('Order ID:', response.result.id);
    } catch (err) {
        console.error('FAILURE!');
        console.error('Status Code:', err.statusCode);
        console.error('Message:', err.message);
    }
}

test();
