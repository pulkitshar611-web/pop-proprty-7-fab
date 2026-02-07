const prisma = require('../../config/prisma');

// GET /api/admin/leases
exports.getLeaseHistory = async (req, res) => {
    try {
        const leases = await prisma.lease.findMany({
            where: {
                startDate: { not: null },
                endDate: { not: null }
            },
            include: {
                tenant: true,
                unit: true
            },
            orderBy: { startDate: 'desc' }
        });

        const formatted = leases.map(l => ({
            id: l.id,
            unit: l.bedroom ? `${l.unit.name} (${l.bedroom})` : l.unit.name,
            unitNumber: l.unit.name,
            bedroom: l.bedroom,
            type: l.unit.rentalMode, // Uses FULL_UNIT or BEDROOM_WISE
            scope: l.unit.rentalMode === 'BEDROOM_WISE' ? 'Per Bedroom' : 'Monthly',
            tenant: l.tenant.name,
            term: l.startDate && l.endDate
                ? `${l.startDate.toISOString().substring(0, 10)} - ${l.endDate.toISOString().substring(0, 10)}`
                : 'Date Pending (DRAFT)',
            status: l.status.toLowerCase(),
            startDate: l.startDate,
            endDate: l.endDate,
            monthlyRent: l.monthlyRent || 0,
            securityDeposit: l.securityDeposit || 0
        }));

        res.json(formatted);
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Server error' });
    }
};

// DELETE /api/admin/leases/:id
exports.deleteLease = async (req, res) => {
    try {
        const leaseId = parseInt(req.params.id);

        // Find lease first to know which unit it belongs to
        const lease = await prisma.lease.findUnique({ where: { id: leaseId } });
        if (!lease) return res.status(404).json({ message: 'Lease not found' });

        await prisma.lease.delete({ where: { id: leaseId } });

        // Check if any other active leases exist for this unit
        const otherLeases = await prisma.lease.findFirst({
            where: { unitId: lease.unitId, status: 'Active' }
        });

        if (!otherLeases) {
            // If no more active leases, mark unit as Vacant
            await prisma.unit.update({
                where: { id: lease.unitId },
                data: { status: 'Vacant' }
            });
        }

        res.json({ message: 'Deleted' });
    } catch (e) {
        console.error('Delete Lease Error:', e);
        res.status(500).json({ message: 'Error deleting lease' });
    }
};

// PUT /api/admin/leases/:id
exports.updateLease = async (req, res) => {
    try {
        const { id } = req.params;
        const { startDate, endDate, monthlyRent, serviceFees, securityDeposit, status } = req.body;

        const updated = await prisma.lease.update({
            where: { id: parseInt(id) },
            data: {
                startDate: startDate ? new Date(startDate) : undefined,
                endDate: endDate ? new Date(endDate) : undefined,
                monthlyRent: monthlyRent ? (parseFloat(monthlyRent) || undefined) : undefined,
                serviceFees: serviceFees !== undefined ? parseFloat(serviceFees) : undefined,
                securityDeposit: securityDeposit ? (parseFloat(securityDeposit) || undefined) : undefined,
                status: status || undefined
            }
        });

        res.json(updated);
    } catch (e) {
        console.error('Update Lease Error:', e);
        res.status(500).json({ message: 'Error updating lease' });
    }
};

// GET /api/admin/leases/active/:unitId
exports.getActiveLease = async (req, res) => {
    try {
        const { unitId } = req.params;
        const activeLease = await prisma.lease.findFirst({
            where: {
                unitId: parseInt(unitId),
                status: { in: ['Active', 'DRAFT'] }
            },
            include: {
                tenant: true
            }
        });

        if (!activeLease) {
            return res.json(null);
        }

        res.json({
            tenantId: activeLease.tenantId,
            tenantName: activeLease.tenant.name
        });
    } catch (error) {
        console.error('Get Active Lease Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// POST /api/admin/leases
exports.createLease = async (req, res) => {
    try {
        const { unitId, tenantName, startDate, endDate, monthlyRent, serviceFees, securityDeposit, bedroom } = req.body;

        if (!unitId || !tenantName) {
            return res.status(400).json({ message: 'Unit and Tenant Name are required' });
        }

        const uId = parseInt(unitId);
        const fees = parseFloat(serviceFees) || 0;
        const rent = parseFloat(monthlyRent) || 0;

        // Find or create tenant logic simplified
        // Try to find user by name
        let tenantId;
        const user = await prisma.user.findFirst({
            where: { name: tenantName, role: 'TENANT' }
        });

        if (user) {
            tenantId = user.id;
        } else {
            // New Tenant Creation (Basic)
            const newUser = await prisma.user.create({
                data: {
                    name: tenantName,
                    email: `tenant_${Date.now()}@example.com`, // Placeholder email
                    password: 'password123', // Placeholder password
                    role: 'TENANT'
                }
            });
            tenantId = newUser.id;
        }

        // 3. LEASE ID CONSISTENCY: Reuse DRAFT lease if exists
        // Only reuse if it's the SAME unit and NO bedroom or same bedroom
        const draftLease = await prisma.lease.findFirst({
            where: {
                unitId: uId,
                tenantId: tenantId,
                status: 'DRAFT',
                bedroom: bedroom || null
            }
        });

        const leaseData = {
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            monthlyRent: rent,
            serviceFees: fees,
            securityDeposit: parseFloat(securityDeposit) || 0,
            status: 'Active',
            bedroom: bedroom || null
        };

        let lease;
        if (draftLease) {
            lease = await prisma.lease.update({
                where: { id: draftLease.id },
                data: leaseData,
                include: { unit: true, tenant: true }
            });
        } else {
            lease = await prisma.lease.create({
                data: {
                    unitId: uId,
                    tenantId: tenantId,
                    ...leaseData
                },
                include: { unit: true, tenant: true }
            });
        }


        // Update unit status if it's a Full Unit lease or the first lease for this unit
        // For Bedroom-wise, we might want to keep it as 'Available' if more rooms exist,
        // but for now, simple logic: Mark occupied if it was vacant.
        const unit = await prisma.unit.findUnique({ where: { id: uId } });
        if (unit && unit.status === 'Vacant') {
            await prisma.unit.update({
                where: { id: uId },
                data: { status: 'Occupied' }
            });
        }

        // NEW: Auto-create Invoice for the first month if Lease is Active
        if (lease.status === 'Active') {
            const monthStr = new Date(startDate).toLocaleString('default', { month: 'long', year: 'numeric' });

            const existingInvoice = await prisma.invoice.findFirst({
                where: {
                    tenantId: tenantId,
                    unitId: uId,
                    month: monthStr
                }
            });

            if (!existingInvoice) {
                const invoiceNo = `INV-${Date.now()}`;

                // Ensure values are from the source of truth (the lease calculation above)
                // rent, fees are already parsed floats
                const totalAmount = rent + fees;

                await prisma.invoice.create({
                    data: {
                        invoiceNo,
                        tenantId: tenantId,
                        unitId: uId,
                        month: monthStr,
                        rent: rent,
                        serviceFees: fees,
                        amount: totalAmount,
                        status: 'Unpaid'
                    }
                });
            }
        }


        res.status(201).json(lease);
    } catch (error) {
        console.error('Create Lease Error:', error);
        res.status(500).json({ message: 'Error creating lease' });
    }
};

// GET /api/admin/leases/units-with-tenants
exports.getUnitsWithTenants = async (req, res) => {
    try {
        const { propertyId, rentalMode } = req.query;

        if (!propertyId || !rentalMode) {
            return res.status(400).json({ message: 'propertyId and rentalMode are required' });
        }

        // Find units with assigned tenants (units that have DRAFT or Active leases)
        const units = await prisma.unit.findMany({
            where: {
                propertyId: parseInt(propertyId),
                rentalMode: rentalMode,
                leases: {
                    some: {
                        status: { in: ['DRAFT', 'Active'] }
                    }
                }
            },
            include: {
                leases: {
                    where: {
                        status: { in: ['DRAFT', 'Active'] }
                    },
                    include: {
                        tenant: true
                    },
                    take: 1
                }
            }
        });

        // Format response to match expected structure
        const formatted = units.map(u => {
            const activeLease = u.leases[0];
            return {
                id: u.id,
                unitNumber: u.name,
                tenantId: activeLease?.tenantId,
                tenantName: activeLease?.tenant?.name
            };
        });

        res.json({ data: formatted });
    } catch (error) {
        console.error('Get Units With Tenants Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
