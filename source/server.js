const express = require('express')
const bcrypt = require('bcrypt')
const dotenv = require('dotenv')
const sql = require('better-sqlite3')
const app = express()

app.use(express.static('static/pages'))
app.use(express.json())


// Register

// Login

// Cart

// Checkout

// Profile

app.listen(1000, () => {
    console.log('Server running on https://localhost:1000')
})