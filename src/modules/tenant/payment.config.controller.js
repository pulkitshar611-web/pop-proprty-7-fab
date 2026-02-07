const prisma = require('../../config/prisma');

/**
 * Payment Config Controller
 * Serves configurable payment settings to the frontend.
 */
exports.getPaymentConfig = async (req, res) => {
    try {
        // In a full implementation, these would be fetched from the SystemSetting model.
        // For now, we provide the requested defaults while keeping them configurable here.

        // Fetch from DB if exists, otherwise use defaults
        const settings = await prisma.systemSetting.findMany({
            where: {
                key: {
                    in: ['platform_fee', 'currency']
                }
            }
        });

        const config = {
            platformFee: 14.99,
            currency: 'USD',
            rentExample: 1500.00 // Illustration purpose
        };

        settings.forEach(s => {
            if (s.key === 'platform_fee') config.platformFee = parseFloat(s.value);
            if (s.key === 'currency') config.currency = s.value;
        });

        res.json(config);
    } catch (e) {
        console.error('Config Error:', e);
        res.status(500).json({ message: 'Failed to fetch payment configuration' });
    }
};
