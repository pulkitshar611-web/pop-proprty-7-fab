const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');
const { generateTokens } = require('../utils/token');

/**
 * Auth Service
 * Manages token lifecycle and session security.
 */
class AuthService {
    async refreshToken(token) {
        if (!token) throw new Error('Refresh token required');

        // 1. Verify token in DB
        const storedToken = await prisma.refreshToken.findUnique({
            where: { token },
            include: { user: true }
        });

        if (!storedToken || storedToken.expiresAt < new Date()) {
            throw new Error('Invalid or expired refresh token');
        }

        // 2. Generate new pair
        const tokens = generateTokens(storedToken.user);

        // 3. Update DB (Rotate refresh token)
        await prisma.refreshToken.delete({ where: { id: storedToken.id } });

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        await prisma.refreshToken.create({
            data: {
                token: tokens.refreshToken,
                userId: storedToken.userId,
                expiresAt
            }
        });

        return tokens;
    }

    async logout(token) {
        if (!token) return;
        await prisma.refreshToken.deleteMany({
            where: { token }
        });
    }
}

module.exports = new AuthService();
