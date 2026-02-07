const prisma = require('../../config/prisma');
const bcrypt = require('bcrypt'); // Added bcrypt

exports.getDashboardStats = async (req, res) => {
    try {
        // 1. Total Properties
        const totalProperties = await prisma.property.count();

        // 2. Total Units
        const totalUnits = await prisma.unit.count();

        // 3. Total Tenants
        const totalTenants = await prisma.user.count({ where: { role: 'TENANT' } });

        // 4. Total Landlords
        const totalLandlords = await prisma.user.count({ where: { role: 'OWNER' } });

        // 5. Occupancy (Occupied vs Vacant)
        const occupiedUnits = await prisma.unit.count({
            where: { status: 'Occupied' },
        });
        const vacantUnits = totalUnits - occupiedUnits;

        // 6. Rent Collected (Month) - Sum of 'paid' invoices for current month
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const rentCollectedAgg = await prisma.invoice.aggregate({
            where: {
                status: 'paid',
                paidAt: { gte: startOfMonth }
            },
            _sum: {
                rent: true,
            },
        });
        const rentCollected = rentCollectedAgg._sum.rent || 0;

        // 7. Service Fees (Month)
        const serviceFeesAgg = await prisma.invoice.aggregate({
            where: {
                status: 'paid',
                paidAt: { gte: startOfMonth }
            },
            _sum: {
                serviceFees: true,
            },
        });
        const serviceFees = serviceFeesAgg._sum.serviceFees || 0;

        // 8. Pending Rents (RENT ONLY for visibility)
        const pendingRentsAgg = await prisma.invoice.aggregate({
            where: {
                status: { in: ['draft', 'sent'] }
            },
            _sum: {
                rent: true,
            },
        });
        const pendingRents = pendingRentsAgg._sum.rent || 0;

        // 9. Failed / Pending (Count of unsent/overdue)
        const failedPendingCount = await prisma.invoice.count({
            where: { status: 'draft' }
        });

        // 10. Monthly Revenue (Admin Earnings = Service Fees)
        const monthlyRevenue = parseFloat(serviceFees);

        // 11. Insurance Alerts
        const today = new Date();
        const expiredInsurance = await prisma.insurance.count({
            where: { endDate: { lt: today } }
        });
        const soonDate = new Date();
        soonDate.setDate(today.getDate() + 30);
        const expiringSoon = await prisma.insurance.count({
            where: {
                endDate: { gt: today, lte: soonDate }
            }
        });

        // 12. Recent Activity - Replicating frontend structure
        const recentInvoices = await prisma.invoice.findMany({
            take: 3,
            orderBy: { updatedAt: 'desc' },
            include: { tenant: true, unit: true }
        });

        const recentActivity = recentInvoices.map(inv => ({
            type: inv.status === 'paid' ? 'success' : 'warning',
            title: inv.status === 'paid' ? 'Tenant rent payment received' : 'Rent invoice processed',
            description: `Unit ${inv.unit.name} ${inv.status === 'paid' ? 'paid' : 'billed'} ₹${inv.status === 'paid' ? inv.rent : inv.amount} for ${inv.month}`
        }));

        res.json({
            totalProperties,
            totalUnits,
            totalTenants,
            totalLandlords,
            occupancy: {
                occupied: occupiedUnits,
                vacant: vacantUnits,
            },
            rentCollected: parseFloat(rentCollected),
            serviceFeesMonth: parseFloat(serviceFees),
            pendingRents: parseFloat(pendingRents),
            failedPending: failedPendingCount,
            monthlyRevenue,
            insuranceAlerts: {
                expired: expiredInsurance,
                expiringSoon: expiringSoon
            },
            recentActivity,
            revenueData: await getRevenueHistory(), // Helper function for chart data
        });
    } catch (error) {
        console.error('Dashboard Stats Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Helper to get 6-month revenue history
async function getRevenueHistory() {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1); // Start of that month

    const invoices = await prisma.invoice.findMany({
        where: {
            status: 'paid',
            paidAt: { gte: sixMonthsAgo }
        }
    });

    // Initialize map for last 6 months
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const historyMap = {};

    // Create placeholders
    for (let i = 0; i < 6; i++) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const key = monthNames[d.getMonth()];
        historyMap[key] = 0;
    }

    // Aggregate
    invoices.forEach(inv => {
        if (inv.paidAt) {
            const m = monthNames[inv.paidAt.getMonth()];
            // Only count if it's in our map (re-confirming logic)
            if (historyMap[m] !== undefined) {
                historyMap[m] += parseFloat(inv.serviceFees || 0);
            }
        }
    });

    // Format for Recharts
    // We want chronological order
    const result = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const key = monthNames[d.getMonth()];
        result.push({
            month: key,
            revenue: historyMap[key] || 0
        });
    }

    return result;
}

exports.getProperties = async (req, res) => {
    try {
        const properties = await prisma.property.findMany({
            include: {
                units: true,
                owner: true
            }
        });

        const formatted = properties.map(p => {
            const totalUnits = p.units.length;
            const activeUnits = p.units.filter(u => u.status === 'Occupied').length;

            const occupancyRate = totalUnits > 0 ? Math.round((activeUnits / totalUnits) * 100) : 0;

            return {
                id: p.id,
                name: p.name,
                address: p.address || 'No address provided', // Frontend expects address
                units: totalUnits,
                occupancy: `${occupancyRate}%`, // Frontend expects "92%" string format
                status: p.status,
            };
        });

        res.json(formatted);
    } catch (error) {
        console.error('Get Properties Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.getPropertyDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const propertyId = parseInt(id);

        const property = await prisma.property.findUnique({
            where: { id: propertyId },
            include: {
                units: {
                    include: {
                        leases: {
                            where: { status: 'Active' },
                            include: { tenant: true }
                        },
                        invoices: {
                            where: { status: 'paid' }
                        }
                    }
                }
            }
        });

        if (!property) return res.status(404).json({ message: 'Property not found' });

        const totalUnits = property.units.length;
        const occupiedCount = property.units.filter(u => u.status !== 'Vacant').length;
        const occupancyRate = totalUnits > 0 ? Math.round((occupiedCount / totalUnits) * 100) : 0;

        // Revenue YTD (Simple sum of all paid invoices for now as "YTD" logic can be complex without timezone)
        const totalRevenue = property.units.reduce((sum, unit) => {
            return sum + unit.invoices.reduce((isum, inv) => isum + parseFloat(inv.amount), 0);
        }, 0);

        const formattedUnits = property.units.map(u => {
            const activeLease = u.leases[0];
            return {
                id: u.id,
                name: u.name,
                type: u.bedrooms + 'BHK',
                mode: u.rentalMode, // Returns FULL_UNIT or BEDROOM_WISE
                status: u.status,
                tenant: activeLease ? activeLease.tenant.name : '-'
            };
        });

        res.json({
            name: property.name,
            totalUnits,
            occupancyRate,
            revenue: totalRevenue,
            units: formattedUnits
        });

    } catch (error) {
        console.error('Get Property Details Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.createProperty = async (req, res) => {
    try {
        const { name, units, status, ownerId, address } = req.body;

        // Create property with auto-generated units to match the count
        const property = await prisma.property.create({
            data: {
                name,
                status,
                address: address || "Not Provided",
                ownerId: ownerId ? parseInt(ownerId) : null,
                units: {
                    create: Array.from({ length: parseInt(units) || 0 }).map((_, i) => ({
                        name: `Unit ${i + 1}`,
                        status: 'Vacant'
                    }))
                }
            },
            include: { units: true, owner: true }
        });

        res.json({
            id: property.id,
            name: property.name,
            units: property.units.length,
            status: property.status,
            ownerName: property.owner?.name
        });
    } catch (error) {
        console.error('Create Property Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.updateProperty = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, units, status } = req.body;

        // First, get the current property to check unit count
        const currentProperty = await prisma.property.findUnique({
            where: { id: parseInt(id) },
            include: { units: true }
        });

        if (!currentProperty) {
            return res.status(404).json({ message: 'Property not found' });
        }

        // Update property name and status
        await prisma.property.update({
            where: { id: parseInt(id) },
            data: {
                name,
                status
            }
        });

        // Handle unit count changes
        const currentCount = currentProperty.units.length;
        const targetCount = parseInt(units);

        if (targetCount > currentCount) {
            // Add new units
            const unitsToAdd = targetCount - currentCount;
            await prisma.unit.createMany({
                data: Array.from({ length: unitsToAdd }).map((_, i) => ({
                    name: `Unit ${currentCount + i + 1}`,
                    propertyId: parseInt(id),
                    status: 'Vacant'
                }))
            });
        } else if (targetCount < currentCount) {
            // Remove excess vacant units (only remove vacant units to avoid data loss)
            const unitsToRemove = currentCount - targetCount;
            const vacantUnits = currentProperty.units
                .filter(u => u.status === 'Vacant')
                .slice(0, unitsToRemove);

            if (vacantUnits.length > 0) {
                await prisma.unit.deleteMany({
                    where: {
                        id: { in: vacantUnits.map(u => u.id) }
                    }
                });
            }
        }

        // Refetch to get updated property with current unit count
        const updatedProperty = await prisma.property.findUnique({
            where: { id: parseInt(id) },
            include: { units: true }
        });

        res.json({
            id: updatedProperty.id,
            name: updatedProperty.name,
            units: updatedProperty.units.length,
            status: updatedProperty.status
        });

    } catch (error) {
        console.error('Update Property Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.deleteProperty = async (req, res) => {
    try {
        const { id } = req.params;

        // Need to delete related units first (Prisma doesn't auto-cascade unless configured in schema)
        // Also other relations... for now trying deletion of units then property.
        await prisma.unit.deleteMany({
            where: { propertyId: parseInt(id) }
        });

        await prisma.property.delete({
            where: { id: parseInt(id) }
        });

        res.json({ message: 'Property deleted successfully' });
    } catch (error) {
        console.error('Delete Property Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.getOwners = async (req, res) => {
    try {
        const owners = await prisma.user.findMany({
            where: { role: 'OWNER' },
            include: {
                properties: {
                    include: { units: true }
                }
            }
        });

        const formatted = owners.map(o => {
            const totalUnits = o.properties.reduce((acc, p) => acc + p.units.length, 0);
            const propertyNames = o.properties.map(p => p.name);
            const propertyIds = o.properties.map(p => p.id);
            return {
                id: o.id,
                name: o.name,
                email: o.email,
                phone: o.phone,
                properties: propertyNames,
                propertyIds: propertyIds,
                totalUnits,
                status: 'Active'
            };
        });

        res.json(formatted);
    } catch (error) {
        console.error('Get Owners Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.createOwner = async (req, res) => {
    try {
        const { name, email, phone, password, propertyIds } = req.body;

        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) return res.status(400).json({ message: 'Email already exists' });

        const hashedPassword = await bcrypt.hash(password, 10);

        const newOwner = await prisma.user.create({
            data: {
                name,
                email,
                phone,
                password: hashedPassword,
                role: 'OWNER',
                properties: {
                    connect: propertyIds?.map(id => ({ id })) || []
                }
            }
        });

        res.status(201).json(newOwner);
    } catch (error) {
        console.error('Create Owner Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.updateOwner = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, phone, propertyIds } = req.body;

        const updateData = {
            name,
            email,
            phone,
            properties: {
                set: propertyIds?.map(pid => ({ id: pid })) || []
            }
        };

        const updated = await prisma.user.update({
            where: { id: parseInt(id) },
            data: updateData
        });

        res.json(updated);
    } catch (error) {
        console.error('Update Owner Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.deleteOwner = async (req, res) => {
    try {
        const { id } = req.params;

        // Disconnect properties first
        await prisma.property.updateMany({
            where: { ownerId: parseInt(id) },
            data: { ownerId: null }
        });

        await prisma.user.delete({
            where: { id: parseInt(id) }
        });

        res.json({ message: 'Owner deleted' });
    } catch (error) {
        console.error('Delete Owner Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
