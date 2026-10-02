const express = require('express')
const bcrypt = require('bcrypt')
const dotenv = require('dotenv')
const crypto = require('crypto')
const Database = require('better-sqlite3')

const app = express()
const db = new Database('database.db')

const passwordSalt = 10

dotenv.config()

app.use(express.static('static/pages'))
app.use(express.json())

// —————————————— //
// Authentication //
// —————————————— //

// Register

app.post('/api/register', async (req, res) => {
    const { email, password } = req.body

    if (!email || !password) {
        return res.status(400).json({
            error: 'All fields are required to register'
        })
    }

    const passwordHash = await bcrypt.hash(password, passwordSalt)

    const userId = crypto.randomUUID()

    try {
        const statement = db.prepare(`insert into users (email, password, userid) values (?, ?, ?)`)
        const result = statement.run(email, passwordHash, userId)

        res.status(201).json({
            message: 'User registered sucessfully'
        })
    } catch (registrationError) {
        res.status(500).json({
            error: 'Could not register user'
        })
    }
})

// Login

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body

    if (!email || !password) {
        return res.status(400).json({
            error: 'Email and password required'
        })
    }

    const statement = db.prepare(`select * from users where email = ?`)
    const user = statement.get(email)

    if (!user) {
        return res.status(401).json({
            error: 'User does not exist in database'
        })
    }

    const passwordMatch = await bcrypt.compare(password, user.password)

    if (!passwordMatch) {
        return res.status(401).json({
            error: 'Invalid email or password'
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
