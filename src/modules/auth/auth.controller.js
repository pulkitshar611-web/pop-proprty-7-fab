const { body, validationResult } = require('express-validator');
const bcrypt = require('bcrypt');
const prisma = require('../../config/prisma');
const { generateTokens } = require('../../utils/token');

const authService = require('../../services/AuthService');

// Login Controller
exports.login = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { email, password } = req.body;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return res.status(401).json({ message: 'Invalid credentials' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

        const { accessToken, refreshToken } = generateTokens(user);

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        await prisma.refreshToken.create({
            data: {
                token: refreshToken,
                userId: user.id,
                expiresAt,
            },
        });

        res.json({
            message: 'Login successful',
            accessToken,
            refreshToken,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
        });
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.refreshToken = async (req, res) => {
    try {
        const { refreshToken } = req.body;
        const tokens = await authService.refreshToken(refreshToken);
        res.json(tokens);
    } catch (e) {
        res.status(401).json({ message: e.message });
    }
};

exports.logout = async (req, res) => {
    try {
        const { refreshToken } = req.body;
        await authService.logout(refreshToken);
        res.json({ message: 'Logged out' });
    } catch (e) {
        res.status(500).json({ message: 'Logout failed' });
    }
};

// Validation Rules
exports.validateLogin = [
    body('email').isEmail().withMessage('Please provide a valid email'),
    body('password').exists().withMessage('Password is required'),
];

exports.validateRegister = [
    body('email').isEmail().withMessage('Please provide a valid email'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('name').notEmpty().withMessage('Name is required'),
    body('role').isIn(['TENANT', 'OWNER']).withMessage('Invalid role'),
];

// Register Controller
exports.register = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { email, password, name, role } = req.body;

        // Strict Role Check - Security
        if (role === 'ADMIN') {
            return res.status(403).json({ message: 'Admin registration is restricted.' });
        }

        // Check availability
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Hash Password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create User
        const user = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                role, // TENANT or OWNER
                type: role === 'OWNER' ? 'Individual' : undefined
            }
        });

        // Auto-login (Generate Tokens)
        const { accessToken, refreshToken } = generateTokens(user);

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        await prisma.refreshToken.create({
            data: {
                token: refreshToken,
                userId: user.id,
                expiresAt,
            },
        });

        res.status(201).json({
            message: 'Registration successful',
            accessToken,
            refreshToken,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
        });

    } catch (error) {
        console.error('Register Error:', error);
        res.status(500).json({ message: 'Server error during registration' });
    }
};
