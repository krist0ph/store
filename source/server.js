const express = require('express')
const bcrypt = require('bcrypt')
const dotenv = require('dotenv')
const sql = require('better-sqlite3')
const app = express()

app.use(express.static('static/pages'))
app.use(express.json())

// Register

// Login

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
