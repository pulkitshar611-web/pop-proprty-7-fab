/**
 * Stub Email Provider
 * Simulates an external service like SendGrid or AWS SES.
 */
class EmailProvider {
    async sendEmail(to, subject, body) {
        console.log(`[STUB] EmailProvider: Sending email to ${to}`);
        console.log(`[STUB] Subject: ${subject}`);
        console.log(`[STUB] Body: ${body.substring(0, 100)}...`);

        // Simulate relay delay
        await new Promise(resolve => setTimeout(resolve, 500));

        return { success: true, messageId: `STUB-EMAIL-${Date.now()}` };
    }
}

module.exports = new EmailProvider();
