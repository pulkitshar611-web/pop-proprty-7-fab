/**
 * Stub SMS Provider
 * Simulates an external service like Twilio or MessageBird.
 */
class SMSProvider {
    async sendSMS(phoneNumber, message) {
        console.log(`[STUB] SMSProvider: Sending SMS to ${phoneNumber}`);
        console.log(`[STUB] Message: ${message}`);

        // Simulate carrier delay
        await new Promise(resolve => setTimeout(resolve, 300));

        return { success: true, sid: `STUB-SMS-${Date.now()}` };
    }
}

module.exports = new SMSProvider();
