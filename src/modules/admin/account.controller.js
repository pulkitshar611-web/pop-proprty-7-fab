const prisma = require('../../config/prisma');

// GET /api/admin/accounts
exports.getAccounts = async (req, res) => {
    try {
        const accounts = await prisma.account.findMany({
            orderBy: { createdAt: 'desc' }
        });

        // Map DB fields to frontend expected fields
        const formatted = accounts.map(acc => ({
            id: acc.id,
            name: acc.accountName,
            type: acc.assetType,
            balance: acc.openingBalance.toString(), // Convert Decimal to string
            createdAt: acc.createdAt
        }));

        res.json(formatted);
    } catch (e) {
        console.error('Error fetching accounts:', e);
        res.status(500).json({ message: 'Error fetching accounts', error: e.message });
    }
};

// POST /api/admin/accounts
exports.createAccount = async (req, res) => {
    try {
        // Frontend uses name, type, balance
        const { name, type, balance } = req.body;

        const newAccount = await prisma.account.create({
            data: {
                accountName: name,
                assetType: type || 'Asset',
                openingBalance: parseFloat(balance) || 0
            }
        });

        res.status(201).json(newAccount);
    } catch (e) {
        console.error('Error creating account:', e);
        res.status(500).json({ message: 'Error creating account', error: e.message });
    }
};

// PATCH /api/admin/accounts/:id
exports.updateAccount = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, type, balance } = req.body;

        const updatedAccount = await prisma.account.update({
            where: { id: parseInt(id) },
            data: {
                accountName: name,
                assetType: type,
                openingBalance: balance !== undefined ? parseFloat(balance) : undefined
            }
        });

        res.json(updatedAccount);
    } catch (e) {
        console.error('Error updating account:', e);
        res.status(500).json({ message: 'Error updating account', error: e.message });
    }
};

// DELETE /api/admin/accounts/:id
exports.deleteAccount = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.account.delete({
            where: { id: parseInt(id) }
        });
        res.json({ message: 'Account deleted successfully' });
    } catch (e) {
        console.error('Error deleting account:', e);
        res.status(500).json({ message: 'Error deleting account' });
    }
};
