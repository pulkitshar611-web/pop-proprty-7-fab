const prisma = require('../../config/prisma');

// GET /api/admin/accounts
exports.getAccounts = async (req, res) => {
    try {
        console.log('[accounts] GET /api/admin/accounts called');

        // ✅ FIX: Prisma model is named "accounts" (plural) in schema.prisma
        //    Using prisma.account (singular) causes a runtime TypeError → 500 error
        const accounts = await prisma.accounts.findMany({
            orderBy: { createdAt: 'desc' }
        });

        console.log(`[accounts] Fetched ${accounts.length} records`);

        // Map DB fields to frontend expected fields
        const formatted = accounts.map(acc => ({
            id: acc.id,
            name: acc.accountName,
            type: acc.assetType,
            // ✅ FIX: Safe null-guard before calling .toString() on Decimal
            balance: acc.openingBalance != null ? acc.openingBalance.toString() : '0',
            createdAt: acc.createdAt
        }));

        res.json(formatted);
    } catch (e) {
        console.error('[accounts] Error fetching accounts:', e.message);
        console.error('[accounts] Full error:', e);
        res.status(500).json({ message: 'Error fetching accounts', error: e.message });
    }
};

// POST /api/admin/accounts
exports.createAccount = async (req, res) => {
    try {
        const { name, type, balance } = req.body;
        console.log('[accounts] POST /api/admin/accounts — body:', { name, type, balance });

        if (!name) {
            return res.status(400).json({ message: 'Account name is required' });
        }

        // ✅ FIX: Use prisma.accounts (plural) to match schema model name
        const newAccount = await prisma.accounts.create({
            data: {
                accountName: name,
                assetType: type || 'Asset',
                openingBalance: parseFloat(balance) || 0
            }
        });

        console.log('[accounts] Created account id:', newAccount.id);
        res.status(201).json(newAccount);
    } catch (e) {
        console.error('[accounts] Error creating account:', e.message);
        console.error('[accounts] Full error:', e);
        res.status(500).json({ message: 'Error creating account', error: e.message });
    }
};

// PATCH /api/admin/accounts/:id
exports.updateAccount = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, type, balance } = req.body;
        console.log(`[accounts] PATCH /api/admin/accounts/${id} — body:`, { name, type, balance });

        // ✅ FIX: Use prisma.accounts (plural)
        const updatedAccount = await prisma.accounts.update({
            where: { id: parseInt(id) },
            data: {
                accountName: name,
                assetType: type,
                openingBalance: balance !== undefined ? parseFloat(balance) : undefined
            }
        });

        res.json(updatedAccount);
    } catch (e) {
        console.error('[accounts] Error updating account:', e.message);
        console.error('[accounts] Full error:', e);
        res.status(500).json({ message: 'Error updating account', error: e.message });
    }
};

// DELETE /api/admin/accounts/:id
exports.deleteAccount = async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`[accounts] DELETE /api/admin/accounts/${id}`);

        // ✅ FIX: Use prisma.accounts (plural)
        await prisma.accounts.delete({
            where: { id: parseInt(id) }
        });

        res.json({ message: 'Account deleted successfully' });
    } catch (e) {
        console.error('[accounts] Error deleting account:', e.message);
        console.error('[accounts] Full error:', e);
        res.status(500).json({ message: 'Error deleting account', error: e.message });
    }
};
