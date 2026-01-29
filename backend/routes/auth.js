const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const User = require('../models/User');

router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    console.log('🔐 Register attempt →', email);

    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const user = await User.create({ name, email, password });

    res.status(201).json({
      message: 'Registered',
      user: { id: user._id, email: user.email }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('🔑 Login attempt →', email);

    const user = await User.findOne({ email });
    if (!user) {
      console.warn('Login failed (no user) →', email);
      return res.status(400).json({ message: 'Invalid email' });
    }

    const ok = await user.comparePassword(password);
    if (!ok) {
      console.warn('Login failed (wrong password) →', email);
      return res.status(400).json({ message: 'Wrong password' });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET || 'devsecret',
      { expiresIn: '2h' }
    );

    res.json({
      token,
      user: { id: user._id, email: user.email, name: user.name }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});
module.exports = router;
