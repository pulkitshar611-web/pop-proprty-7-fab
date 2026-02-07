const emailProvider = require('../providers/EmailProvider');
const smsProvider = require('../providers/SMSProvider');
const prisma = require('../config/prisma');

/**
 * Notification Service
 * Handles delivery of system alerts and communications.
 */
class NotificationService {
    async notifyTenant(tenantId, subject, message, channels = ['EMAIL']) {
        const tenant = await prisma.user.findUnique({ where: { id: tenantId } });
        if (!tenant) return;

        const results = [];

        if (channels.includes('EMAIL') && tenant.email) {
            results.push(await emailProvider.sendEmail(tenant.email, subject, message));
        }

        if (channels.includes('SMS') && tenant.phone) {
            results.push(await smsProvider.sendSMS(tenant.phone, message));
        }

        // Log to database
        await prisma.communication.create({
            data: {
                recipient: tenant.name,
                subject,
                message,
                type: channels.join(','),
                status: 'Sent'
            }
        });

        return results;
    }

    async broadcast(recipientGroup, subject, message) {
        console.log(`[STUB] NotificationService: Broadcasting to ${recipientGroup}`);
        return await prisma.communication.create({
            data: {
                recipient: recipientGroup,
                subject,
                message,
                type: 'BROADCAST',
                status: 'Sent'
            }
        });
    }
}

module.exports = new NotificationService();
