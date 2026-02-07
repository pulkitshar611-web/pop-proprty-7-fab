const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');

router.post('/login', authController.validateLogin, authController.login);
router.post('/register', authController.validateRegister, authController.register);
router.post('/refresh', authController.refreshToken);
router.post('/logout', authController.logout);

module.exports = router;
