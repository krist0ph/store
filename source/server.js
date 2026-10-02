const express = require('express')
const bcrypt = require('bcrypt')
const dotenv = require('dotenv')
const crypto = require('crypto')
const Database = require('better-sqlite3')
const rateLimit = require('express-rate-limit')

const app = express()
const db = new Database('database.db')

const passwordSalt = 10

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    message: {
        error: 'Too many attempts, please try again later'
    }
})

dotenv.config()

app.use(express.static('static/pages'))
app.use(express.json({ limit: '10kb' }))

// —————————————— //
// Authentication //
// —————————————— //

// Register

app.post('/api/register', authLimiter, async (req, res) => {
    const { email, password } = req.body

    if (typeof email !== 'string' || typeof password !== 'string') {
        return res.status(400).json({
            error: 'Invalid registration data'
        })
    }

    const normalizedEmail = email.trim().toLowerCase()

    if (!normalizedEmail || !password) {
        return res.status(400).json({
            error: 'All fields are required for registration'
        })
    }

    if (password.length < 8) {
        return res.status(400).json({
            error: 'Password must be at least 8 characters'
        })
    }

    try {
        const passwordHash = await bcrypt.hash(password, passwordSalt)
        const statement = db.prepare(`insert into users (email, password, userid) values (?, ?, ?)`)
        const userId = crypto.randomUUID()
        
        statement.run(normalizedEmail, passwordHash, userId)

        res.status(201).json({
            message: 'User registered successfully'
        })
        
    } catch (registrationError) {
        res.status(500).json({
            error: 'Could not register user'
        })
    }
})

// Login

app.post('/api/login', authLimiter, async (req, res) => {
    const { email, password } = req.body

    if (typeof email !== 'string' || typeof password !== 'string') {
        return res.status(400).json({
            error: 'Invalid credentials'
        })
    }

    const normalizedEmail = email.trim().toLowerCase()

    if (!normalizedEmail || !password) {
        return res.status(400).json({
            error: 'Email and password required'
        })
    }

    const statement = db.prepare(`select * from users where email = ?`)
    const user = statement.get(normalizedEmail)

    if (!user) {
        return res.status(401).json({
            error: 'Invalid credentials'
        })
    }

    const passwordMatch = await bcrypt.compare(password, user.password)

    if (!passwordMatch) {
        return res.status(401).json({
            error: 'Invalid credentials'
        })
    }

    res.json({
        message: 'Login succesful'
    })
})


// Logout

// Change Password

// Current User Profile

// Modify Profile

// Product List / Search / Filter

// Product Details

// Cart

// Add to Cart

// Remove from Cart

// Change quantity

// Track orders

// Place orders

// Cancel orders

// Order details

// Modify shipping information

app.listen(1000, () => {
    console.log('Server running on https://localhost:1000')
})