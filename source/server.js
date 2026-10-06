require('dotenv').config()

const path = require('path')
const express = require('express')
const bcrypt = require('bcrypt')
const crypto = require('crypto')
const Database = require('better-sqlite3')
const rateLimit = require('express-rate-limit')
const session = require('express-session')
const sqlitestore = require('better-sqlite3-session-store')(session)

const app = express()
const defaultDatabase = new Database('database.db')
const sessionDatabase = new Database('sessions.db')

const passwordSalt = 10

app.use(express.static('static'))
app.use(express.json({ limit: '10kb' }))

app.use(session({
    name: 'sid',
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: new sqlitestore({ client: sessionDatabase }),
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV == 'production',
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24 * 7
    }
}))

app.set('trust proxy', 1)

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    message: {
        error: 'Too many attempts, please try again later'
    }
})

function requireLogin(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({
            error: 'Not logged in'
        })
    }
    next()
}

// —————————————— //
// Authentication //
// —————————————— //

// Register

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'static/register.html'))
})

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
        const statement = defaultDatabase.prepare(`insert into users (email, password, id) values (?, ?, ?)`)
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

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'static/login.html'))
})

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

    const statement = defaultDatabase.prepare(`select * from users where email = ?`)
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

    req.session.regenerate((sessionError) => {
        if (sessionError) {
            return res.status(500).json({ 
                error: 'Could not log in' 
            })
        }
        
        req.session.userId = user.id

        req.session.save((sessionSaveError) => {
            if (sessionSaveError) {
                return res.status(500).json({
                    error: 'Could not log in'
                })
            }

            res.json({
                message: 'Login successful'
            })
        })
    })
})

// Logout

app.post('/api/logout', (req, res) => {
    req.session.destroy((sessionError) => {
        if (sessionError) {
            return res.status(500).json({
                error: 'Could not log out'
            })
        }

        res.clearCookie('sid')

        res.json({
            message: 'Logged out'
        })
    })
})

// Change Password

app.post('/api/change-password', requireLogin, authLimiter, async (req, res) => {
    const { currentPassword, newPassword } = req.body

    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
        return res.status(400).json({
            error: 'Invalid data'
        })
    }

    if (newPassword.length < 8) {
        return res.status(400).json({
            error: 'Password too short'
        })
    }

    if (Buffer.byteLength(newPassword) > 72) {
        return res.status(400).json({
            error: 'Password too long'
        })
    }

    if (newPassword === currentPassword) {
        return res.status(400).json({
            error: 'Password must be different'
        })
    }

    try {
        const statement = defaultDatabase.prepare(`select id, password from users where id = ?`)
        const user = statement.get(req.session.userId)

        if (!user) {
            return res.status(401).json({
                error: 'Not logged in'
            })
        }

        const passwordMatch = await bcrypt.compare(currentPassword, user.password)

        if (!passwordMatch) {
            return res.status(403).json({
                error: 'Incorrect password'
            })
        }

        const newHash = await bcrypt.hash(newPassword, passwordSalt)

        defaultDatabase
            .prepare(`update users set password where id = ?`)
            .run(newHash, req.session.userId)

        sessionDatabase
            .prepare(`delete from session where sid != ? and json_extract(sess, '$.userId') = ?`)
            .run(req.sessionID, req.session.userId)

        res.json({
            message: 'Password changed successfully'
        })
        
    } catch (changePasswordError) {
        res.status(500).json({
            error: 'Could not change password'
        })
    }
})

// Load User Profile

app.get('/api/profile', requireLogin, (req, res) => {
    const statement = defaultDatabase.prepare(`select id, email from users where id = ?`)
    const user = statement.get(req.session.userId)

    if (!user) {
        return res.status(401).json({
            error: 'Not logged in'
        })
    }

    res.json({
        id: user.id,
        email: user.email
    })
})

// Modify Profile

// —————————————— //
//    Products    //
// —————————————— //

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
    console.log('Server running on http://localhost:1000')
})