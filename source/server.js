require('dotenv').config()

const path = require('path')
const express = require('express')
const bcrypt = require('bcrypt')
const crypto = require('crypto')
const Database = require('better-sqlite3')
const rateLimit = require('express-rate-limit')
const session = require('express-session')
const sqlitestore = require('better-sqlite3-session-store')(session)

if (!process.env.SESSION_SECRET) {
    console.error('SESSION_SECRET is missing. Add it to your .env file.')
    process.exit(1)
}

const app = express()
const defaultDatabase = new Database('database.db')
const sessionDatabase = new Database('sessions.db')

const bcryptRounds = 10
const maxPasswordBytes = 72
const dummyHash = bcrypt.hashSync('dummy-password-for-timing', bcryptRounds)

// ——————————————————— //
//       Helpers       //
// ——————————————————— //

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isValidEmail(email) {
    return email.length > 0 && email.length <= 254 && emailPattern.test(email)
}

function isPositiveInteger(value) {
    return Number.isSafeInteger(value) && value > 0
}

function parseId(value) {
    if (typeof value !== 'string' || !/^\d+$/.test(value)) {
        return null
    }

    const id = Number(value)
    return isPositiveInteger(id) ? id : null
}

function roundMoney(value) {
    return Math.round(value * 100) / 100
}

function parseShippingInfo(raw) {
    if (!raw) {
        return null
    }

    try {
        const parsed = JSON.parse(raw)
        return {
            email: parsed.email ?? null,
            address: parsed.address ?? null
        }
    } catch {
        return { email: null, address: String(raw) }
    }
}

function paymentStatusFor(orderStatus) {
    if (orderStatus === 'delivered') return 'paid'
    if (orderStatus === 'cancelled') return 'cancelled'
    return 'pending'
}

function normalizeText(value) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

defaultDatabase.function('normalize_text', { deterministic: true }, (value) =>
    typeof value === 'string' ? normalizeText(value) : value
)

function uniqueIgnoringCase(values) {
    const seen = new Map()

    for (const value of values) {
        const key = normalizeText(value)

        if (!seen.has(key)) {
            seen.set(key, value)
        }
    }

    return [...seen.values()]
}

function escapeLike(value) {
    return value.replace(/[\\%_]/g, '\\$&')
}

function parseQueryList(value, maxItems = 20) {
    if (value === undefined) {
        return []
    }

    const rawItems = Array.isArray(value) ? value : [value]

    if (!rawItems.every(item => typeof item === 'string')) {
        return null
    }

    const list = rawItems
        .flatMap(item => item.split(','))
        .map(item => item.trim())
        .filter(Boolean)

    return list.length <= maxItems ? list : null
}

function parsePriceParam(value) {
    if (value === undefined || value === '') {
        return undefined
    }

    if (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value.trim())) {
        return null
    }

    const price = Number(value.trim())
    return Number.isFinite(price) && price <= 1e9 ? price : null
}

function parsePositiveIntParam(value, fallback) {
    if (value === undefined || value === '') {
        return fallback
    }

    if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) {
        return null
    }

    const number = Number(value.trim())
    return isPositiveInteger(number) ? number : null
}

function formatProduct(row) {
    return {
        productId: row.product_id,
        name: row.name,
        manufacturer: row.manufacturer,
        color: row.color,
        price: row.price,
        onStock: row.onstock,
        inStock: row.onstock > 0
    }
}

const productSortOptions = {
    newest: 'product_id DESC',
    name_asc: 'normalize_text(name) ASC, product_id ASC',
    name_desc: 'normalize_text(name) DESC, product_id ASC',
    price_asc: 'price ASC, product_id ASC',
    price_desc: 'price DESC, product_id ASC'
}

const maxProductsPerPage = 100

// ——————————————————— //
//     Middleware      //
// ——————————————————— //

app.set('trust proxy', 1)

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

function createLimiter(options = {}) {
    return rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 10,
        message: {
            error: 'Too many attempts, please try again later'
        },
        ...options
    })
}

const registerLimiter = createLimiter()
const loginLimiter = createLimiter({ skipSuccessfulRequests: true })
const changePasswordLimiter = createLimiter()

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

app.post('/api/register', registerLimiter, async (req, res) => {
    const { email, password } = req.body ?? {}

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

    if (!isValidEmail(normalizedEmail)) {
        return res.status(400).json({
            error: 'Please provide a valid email address'
        })
    }

    if (password.length < 8) {
        return res.status(400).json({
            error: 'Password must be at least 8 characters'
        })
    }

    if (Buffer.byteLength(password) > maxPasswordBytes) {
        return res.status(400).json({
            error: 'Password too long'
        })
    }

    try {
        const passwordHash = await bcrypt.hash(password, bcryptRounds)
        const userId = crypto.randomUUID()

        defaultDatabase
            .prepare(`insert into users (email, password, id) values (?, ?, ?)`)
            .run(normalizedEmail, passwordHash, userId)

        res.status(201).json({
            message: 'User registered successfully'
        })

    } catch (registrationError) {
        if (registrationError.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({
                error: 'That email address is already registered'
            })
        }

        console.error('Register failed:', registrationError.message)

        res.status(500).json({
            error: 'Could not register user'
        })
    }
})

// Login

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'static/login.html'))
})

app.post('/api/login', loginLimiter, async (req, res) => {
    const { email, password } = req.body ?? {}

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

    try {
        const user = defaultDatabase
            .prepare(`select id, password from users where email = ?`)
            .get(normalizedEmail)

        const passwordMatch = await bcrypt.compare(
            password,
            user ? user.password : dummyHash
        )

        if (!user || !passwordMatch) {
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

    } catch (loginError) {
        console.error('Login failed:', loginError.message)

        res.status(500).json({
            error: 'Could not log in'
        })
    }
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

app.post('/api/change-password', requireLogin, changePasswordLimiter, async (req, res) => {
    const { currentPassword, newPassword } = req.body ?? {}

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

    if (Buffer.byteLength(newPassword) > maxPasswordBytes) {
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
        const user = defaultDatabase
            .prepare(`select id, password from users where id = ?`)
            .get(req.session.userId)

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

        const newHash = await bcrypt.hash(newPassword, bcryptRounds)

        defaultDatabase
            .prepare(`update users set password = ? where id = ?`)
            .run(newHash, req.session.userId)

        sessionDatabase
            .prepare(`delete from sessions where sid != ? and json_extract(sess, '$.userId') = ?`)
            .run(req.sessionID, req.session.userId)

        res.json({
            message: 'Password changed successfully'
        })

    } catch (changePasswordError) {
        console.error('Change password failed:', changePasswordError.message)

        res.status(500).json({
            error: 'Could not change password'
        })
    }
})

// Load User Profile

app.get('/api/profile', requireLogin, (req, res) => {
    try {
        const user = defaultDatabase
            .prepare(`select id, email, shipping_info from users where id = ?`)
            .get(req.session.userId)

        if (!user) {
            return res.status(401).json({
                error: 'Not logged in'
            })
        }

        res.json({
            id: user.id,
            email: user.email,
            shippingInfo: parseShippingInfo(user.shipping_info)
        })

    } catch (error) {
        console.error('Load profile failed:', error.message)

        res.status(500).json({
            error: 'Could not load profile'
        })
    }
})

// Modify Profile

// —————————————— //
//    Products    //
// —————————————— //

// Product List / Search / Filter

app.get('/api/products', (req, res) => {
    const { search, sort = 'newest', inStock } = req.query

    if (search !== undefined && (typeof search !== 'string' || search.length > 100)) {
        return res.status(400).json({
            error: 'Invalid search text'
        })
    }

    const colors = parseQueryList(req.query.color)
    const manufacturers = parseQueryList(req.query.manufacturer)

    if (colors === null || manufacturers === null) {
        return res.status(400).json({
            error: 'Invalid color or manufacturer filter'
        })
    }

    const minPrice = parsePriceParam(req.query.minPrice)
    const maxPrice = parsePriceParam(req.query.maxPrice)

    if (minPrice === null || maxPrice === null) {
        return res.status(400).json({
            error: 'Prices must be positive numbers'
        })
    }

    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
        return res.status(400).json({
            error: 'minPrice cannot be higher than maxPrice'
        })
    }

    if (inStock !== undefined && inStock !== 'true' && inStock !== 'false') {
        return res.status(400).json({
            error: 'inStock must be true or false'
        })
    }

    if (
        typeof sort !== 'string' ||
        !Object.prototype.hasOwnProperty.call(productSortOptions, sort)
    ) {
        return res.status(400).json({
            error: `sort must be one of: ${Object.keys(productSortOptions).join(', ')}`
        })
    }

    const page = parsePositiveIntParam(req.query.page, 1)
    const limit = parsePositiveIntParam(req.query.limit, 20)

    if (page === null || limit === null || limit > maxProductsPerPage) {
        return res.status(400).json({
            error: `page and limit must be positive whole numbers (limit max ${maxProductsPerPage})`
        })
    }

    const offset = (page - 1) * limit

    if (!Number.isSafeInteger(offset)) {
        return res.status(400).json({
            error: 'Page number too large'
        })
    }

    const conditions = []
    const params = []

    const searchWords = normalizeText(search ?? '')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 5)

    for (const word of searchWords) {
        const pattern = `%${escapeLike(word)}%`

        conditions.push(`(
            normalize_text(name) LIKE ? ESCAPE '\\'
            OR normalize_text(manufacturer) LIKE ? ESCAPE '\\'
            OR normalize_text(color) LIKE ? ESCAPE '\\'
        )`)
        params.push(pattern, pattern, pattern)
    }

    if (colors.length > 0) {
        conditions.push(`normalize_text(color) IN (${colors.map(() => '?').join(', ')})`)
        params.push(...colors.map(normalizeText))
    }

    if (manufacturers.length > 0) {
        conditions.push(`normalize_text(manufacturer) IN (${manufacturers.map(() => '?').join(', ')})`)
        params.push(...manufacturers.map(normalizeText))
    }

    if (minPrice !== undefined) {
        conditions.push('price >= ?')
        params.push(minPrice)
    }

    if (maxPrice !== undefined) {
        conditions.push('price <= ?')
        params.push(maxPrice)
    }

    if (inStock === 'true') {
        conditions.push('onstock > 0')
    }

    const whereClause = conditions.length > 0
        ? `WHERE ${conditions.join(' AND ')}`
        : ''

    try {
        const { total } = defaultDatabase.prepare(`
            SELECT COUNT(*) AS total
            FROM products
            ${whereClause}
        `).get(...params)

        const rows = defaultDatabase.prepare(`
            SELECT product_id, name, manufacturer, color, price, onstock
            FROM products
            ${whereClause}
            ORDER BY ${productSortOptions[sort]}
            LIMIT ? OFFSET ?
        `).all(...params, limit, offset)

        return res.status(200).json({
            products: rows.map(formatProduct),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        })

    } catch (error) {
        console.error('Load products failed:', error.message)

        return res.status(500).json({
            error: 'Could not load products'
        })
    }
})

// Product filters

app.get('/api/products/filters', (req, res) => {
    try {
        const colors = uniqueIgnoringCase(
            defaultDatabase.prepare(`
                SELECT DISTINCT color
                FROM products
                ORDER BY normalize_text(color)
            `).all().map(row => row.color)
        )

        const manufacturers = uniqueIgnoringCase(
            defaultDatabase.prepare(`
                SELECT DISTINCT manufacturer
                FROM products
                ORDER BY normalize_text(manufacturer)
            `).all().map(row => row.manufacturer)
        )

        const prices = defaultDatabase.prepare(`
            SELECT MIN(price) AS min, MAX(price) AS max
            FROM products
        `).get()

        return res.status(200).json({
            colors,
            manufacturers,
            price: {
                min: prices.min,
                max: prices.max
            }
        })

    } catch (error) {
        console.error('Load product filters failed:', error.message)

        return res.status(500).json({
            error: 'Could not load product filters'
        })
    }
})

// Product details

app.get('/api/products/:productId', (req, res) => {
    const productId = parseId(req.params.productId)

    if (productId === null) {
        return res.status(400).json({
            error: 'Invalid product ID'
        })
    }

    try {
        const product = defaultDatabase.prepare(`
            SELECT product_id, name, manufacturer, color, price, onstock
            FROM products
            WHERE product_id = ?
        `).get(productId)

        if (!product) {
            return res.status(404).json({
                error: 'Product not found'
            })
        }

        return res.status(200).json({
            product: formatProduct(product)
        })

    } catch (error) {
        console.error('Load product details failed:', error.message)

        return res.status(500).json({
            error: 'Could not load product'
        })
    }
})

// Cart + Add to Cart

app.post('/api/cart', requireLogin, (req, res) => {
    const { productId, quantity = 1 } = req.body ?? {}

    if (!isPositiveInteger(productId) || !isPositiveInteger(quantity)) {
        return res.status(400).json({
            error: 'Invalid product ID or quantity'
        })
    }

    try {
        const addToCart = defaultDatabase.transaction(() => {
            const product = defaultDatabase.prepare(`
                SELECT product_id, name, price, onstock
                FROM products
                WHERE product_id = ?
            `).get(productId)

            if (!product) {
                return {
                    httpStatus: 404,
                    error: 'Product not found'
                }
            }

            const existingItems = defaultDatabase.prepare(`
                SELECT rowid, quantity
                FROM cart
                WHERE user_id = ? AND product_id = ?
            `).all(req.session.userId, productId)

            const currentQuantity = existingItems.reduce(
                (sum, item) => sum + item.quantity,
                0
            )

            const newQuantity = currentQuantity + quantity

            if (newQuantity > product.onstock) {
                return {
                    httpStatus: 409,
                    error: 'Not enough stock available',
                    availableStock: product.onstock
                }
            }

            const totalPrice = roundMoney(product.price * newQuantity)

            if (!Number.isFinite(totalPrice)) {
                throw new Error('Invalid product price')
            }

            if (existingItems.length > 0) {
                const firstItem = existingItems[0]

                defaultDatabase.prepare(`
                    UPDATE cart
                    SET quantity = ?, total_price = ?
                    WHERE rowid = ?
                `).run(newQuantity, totalPrice, firstItem.rowid)

                if (existingItems.length > 1) {
                    defaultDatabase.prepare(`
                        DELETE FROM cart
                        WHERE user_id = ?
                          AND product_id = ?
                          AND rowid != ?
                    `).run(req.session.userId, productId, firstItem.rowid)
                }
            } else {
                defaultDatabase.prepare(`
                    INSERT INTO cart (user_id, product_id, quantity, total_price)
                    VALUES (?, ?, ?, ?)
                `).run(req.session.userId, productId, newQuantity, totalPrice)
            }

            return {
                productId: product.product_id,
                name: product.name,
                quantity: newQuantity,
                unitPrice: product.price,
                totalPrice
            }
        })

        const result = addToCart()

        if (result.httpStatus) {
            const { httpStatus, ...body } = result
            return res.status(httpStatus).json(body)
        }

        res.status(200).json({
            message: 'Product added to cart',
            item: result
        })

    } catch (error) {
        console.error('Add to cart failed:', error.message)

        res.status(500).json({
            error: 'Could not add product to cart'
        })
    }
})

// Remove from Cart

app.delete('/api/cart', requireLogin, (req, res) => {
    const { productId, quantity } = req.body ?? {}

    if (
        !isPositiveInteger(productId) ||
        (quantity !== undefined && !isPositiveInteger(quantity))
    ) {
        return res.status(400).json({
            error: 'Invalid product ID or quantity'
        })
    }

    try {
        const removeFromCart = defaultDatabase.transaction(() => {
            const cartItems = defaultDatabase.prepare(`
                SELECT rowid, quantity
                FROM cart
                WHERE user_id = ? AND product_id = ?
            `).all(req.session.userId, productId)

            if (cartItems.length === 0) {
                return {
                    httpStatus: 404,
                    error: 'Product not found in cart'
                }
            }

            const currentQuantity = cartItems.reduce(
                (sum, item) => sum + item.quantity,
                0
            )

            if (quantity === undefined || quantity >= currentQuantity) {
                defaultDatabase.prepare(`
                    DELETE FROM cart
                    WHERE user_id = ? AND product_id = ?
                `).run(req.session.userId, productId)

                return {
                    action: 'removed',
                    productId
                }
            }

            const newQuantity = currentQuantity - quantity

            const product = defaultDatabase.prepare(`
                SELECT price
                FROM products
                WHERE product_id = ?
            `).get(productId)

            if (!product) {
                return {
                    httpStatus: 404,
                    error: 'Product not found'
                }
            }

            const totalPrice = roundMoney(product.price * newQuantity)

            if (!Number.isFinite(totalPrice)) {
                throw new Error('Invalid product price')
            }

            const firstItem = cartItems[0]

            defaultDatabase.prepare(`
                UPDATE cart
                SET quantity = ?, total_price = ?
                WHERE rowid = ?
            `).run(newQuantity, totalPrice, firstItem.rowid)

            if (cartItems.length > 1) {
                defaultDatabase.prepare(`
                    DELETE FROM cart
                    WHERE user_id = ?
                      AND product_id = ?
                      AND rowid != ?
                `).run(req.session.userId, productId, firstItem.rowid)
            }

            return {
                action: 'quantity_updated',
                productId,
                quantity: newQuantity,
                totalPrice
            }
        })

        const result = removeFromCart()

        if (result.httpStatus) {
            return res.status(result.httpStatus).json({
                error: result.error
            })
        }

        return res.status(200).json({
            message: result.action === 'removed'
                ? 'Product removed from cart'
                : 'Cart quantity updated',
            item: result
        })

    } catch (error) {
        console.error('Remove from cart failed:', error.message)

        return res.status(500).json({
            error: 'Could not remove product from cart'
        })
    }
})

// Change Cart Quantity

app.patch('/api/cart', requireLogin, (req, res) => {
    const { productId, quantity } = req.body ?? {}

    if (!isPositiveInteger(productId) || !isPositiveInteger(quantity)) {
        return res.status(400).json({
            error: 'Invalid product ID or quantity'
        })
    }

    try {
        const changeCartQuantity = defaultDatabase.transaction(() => {
            const product = defaultDatabase.prepare(`
                SELECT product_id, name, price, onstock
                FROM products
                WHERE product_id = ?
            `).get(productId)

            if (!product) {
                return {
                    httpStatus: 404,
                    error: 'Product not found'
                }
            }

            const cartItems = defaultDatabase.prepare(`
                SELECT rowid, quantity
                FROM cart
                WHERE user_id = ? AND product_id = ?
            `).all(req.session.userId, productId)

            if (cartItems.length === 0) {
                return {
                    httpStatus: 404,
                    error: 'Product not found in cart'
                }
            }

            if (quantity > product.onstock) {
                return {
                    httpStatus: 409,
                    error: 'Not enough stock available',
                    availableStock: product.onstock
                }
            }

            const totalPrice = roundMoney(product.price * quantity)

            if (!Number.isFinite(totalPrice)) {
                throw new Error('Invalid product price')
            }

            const firstItem = cartItems[0]

            defaultDatabase.prepare(`
                UPDATE cart
                SET quantity = ?, total_price = ?
                WHERE rowid = ?
            `).run(quantity, totalPrice, firstItem.rowid)

            if (cartItems.length > 1) {
                defaultDatabase.prepare(`
                    DELETE FROM cart
                    WHERE user_id = ?
                      AND product_id = ?
                      AND rowid != ?
                `).run(req.session.userId, productId, firstItem.rowid)
            }

            return {
                productId: product.product_id,
                name: product.name,
                quantity,
                unitPrice: product.price,
                totalPrice
            }
        })

        const result = changeCartQuantity()

        if (result.httpStatus) {
            return res.status(result.httpStatus).json({
                error: result.error,
                ...(result.availableStock !== undefined && {
                    availableStock: result.availableStock
                })
            })
        }

        return res.status(200).json({
            message: 'Cart quantity updated',
            item: result
        })

    } catch (error) {
        console.error('Change cart quantity failed:', error.message)

        return res.status(500).json({
            error: 'Could not update cart quantity'
        })
    }
})

// Place orders

app.post('/api/orders', requireLogin, (req, res) => {
    try {
        const placeOrder = defaultDatabase.transaction(() => {
            const cartItems = defaultDatabase.prepare(`
                SELECT
                    c.product_id,
                    SUM(c.quantity) AS quantity,
                    p.name,
                    p.price,
                    p.onstock
                FROM cart c
                LEFT JOIN products p
                    ON p.product_id = c.product_id
                WHERE c.user_id = ?
                GROUP BY c.product_id
            `).all(req.session.userId)

            if (cartItems.length === 0) {
                return {
                    httpStatus: 400,
                    error: 'Your cart is empty'
                }
            }

            let totalPrice = 0

            for (const item of cartItems) {
                if (
                    item.name == null ||
                    item.price == null ||
                    item.onstock == null
                ) {
                    return {
                        httpStatus: 409,
                        error: 'A product in your cart is unavailable',
                        productId: item.product_id
                    }
                }

                if (
                    !isPositiveInteger(item.quantity) ||
                    !Number.isFinite(item.price) ||
                    item.price < 0
                ) {
                    throw new Error('Invalid cart or product data')
                }

                if (item.quantity > item.onstock) {
                    return {
                        httpStatus: 409,
                        error: 'Not enough stock available',
                        productId: item.product_id,
                        availableStock: item.onstock
                    }
                }

                item.totalPrice = roundMoney(item.price * item.quantity)

                if (!Number.isFinite(item.totalPrice)) {
                    throw new Error('Invalid item total')
                }

                totalPrice += item.totalPrice
            }

            totalPrice = roundMoney(totalPrice)

            if (!Number.isFinite(totalPrice)) {
                throw new Error('Invalid order total')
            }

            const orderResult = defaultDatabase.prepare(`
                INSERT INTO orders (user_id, status)
                VALUES (?, 'pending')
            `).run(req.session.userId)

            const orderId = Number(orderResult.lastInsertRowid)

            const insertOrderItem = defaultDatabase.prepare(`
                INSERT INTO order_items (
                    order_id,
                    product_id,
                    product_name,
                    unit_price,
                    quantity,
                    total_price
                )
                VALUES (?, ?, ?, ?, ?, ?)
            `)

            const updateStock = defaultDatabase.prepare(`
                UPDATE products
                SET onstock = onstock - ?
                WHERE product_id = ?
                  AND onstock >= ?
            `)

            for (const item of cartItems) {
                const stockResult = updateStock.run(
                    item.quantity,
                    item.product_id,
                    item.quantity
                )

                if (stockResult.changes !== 1) {
                    const error = new Error('Insufficient stock')
                    error.code = 'INSUFFICIENT_STOCK'
                    error.productId = item.product_id
                    throw error
                }

                insertOrderItem.run(
                    orderId,
                    item.product_id,
                    item.name,
                    item.price,
                    item.quantity,
                    item.totalPrice
                )
            }

            defaultDatabase.prepare(`
                DELETE FROM cart
                WHERE user_id = ?
            `).run(req.session.userId)

            return {
                orderId,
                totalPrice,
                status: 'pending',
                paymentMethod: 'cash_on_delivery',
                paymentStatus: paymentStatusFor('pending'),
                items: cartItems.map(item => ({
                    productId: item.product_id,
                    name: item.name,
                    unitPrice: item.price,
                    quantity: item.quantity,
                    totalPrice: item.totalPrice
                }))
            }
        })

        const result = placeOrder()

        if (result.httpStatus) {
            const { httpStatus, ...body } = result
            return res.status(httpStatus).json(body)
        }

        return res.status(201).json({
            message: 'Order placed successfully. Pay upon delivery.',
            order: result
        })

    } catch (error) {
        if (error.code === 'INSUFFICIENT_STOCK') {
            return res.status(409).json({
                error: 'Stock changed during checkout. Please review your cart.',
                productId: error.productId
            })
        }

        console.error('Place order failed:', error.message)

        return res.status(500).json({
            error: 'Could not place order'
        })
    }
})

// Cancel orders

app.patch('/api/orders/:orderId/cancel', requireLogin, (req, res) => {
    const orderId = parseId(req.params.orderId)
    const userId = req.session.userId

    if (orderId === null) {
        return res.status(400).json({
            error: 'Invalid order ID'
        })
    }

    try {
        const cancelOrder = defaultDatabase.transaction(() => {
            const order = defaultDatabase.prepare(`
                SELECT id, status
                FROM orders
                WHERE id = ? AND user_id = ?
            `).get(orderId, userId)

            if (!order) {
                return {
                    httpStatus: 404,
                    error: 'Order not found'
                }
            }

            if (order.status === 'cancelled') {
                return {
                    httpStatus: 409,
                    error: 'This order has already been cancelled'
                }
            }

            if (order.status === 'delivered') {
                return {
                    httpStatus: 409,
                    error: 'Delivered orders cannot be cancelled'
                }
            }

            if (order.status !== 'pending') {
                return {
                    httpStatus: 409,
                    error: 'Only pending orders can be cancelled'
                }
            }

            const items = defaultDatabase.prepare(`
                SELECT product_id, quantity
                FROM order_items
                WHERE order_id = ?
            `).all(orderId)

            if (items.length === 0) {
                throw new Error('Order has no items')
            }

            const restoreStock = defaultDatabase.prepare(`
                UPDATE products
                SET onstock = onstock + ?
                WHERE product_id = ?
            `)

            for (const item of items) {
                const result = restoreStock.run(item.quantity, item.product_id)

                if (result.changes !== 1) {
                    throw new Error(
                        `Could not restore stock for product ${item.product_id}`
                    )
                }
            }

            defaultDatabase.prepare(`
                UPDATE orders
                SET status = 'cancelled'
                WHERE id = ? AND user_id = ?
            `).run(orderId, userId)

            return {
                message: 'Order cancelled successfully',
                orderId,
                orderStatus: 'cancelled'
            }
        })

        const result = cancelOrder()

        if (result.httpStatus) {
            return res.status(result.httpStatus).json({
                error: result.error
            })
        }

        return res.status(200).json(result)

    } catch (error) {
        console.error('Cancel order error:', error.message)

        return res.status(500).json({
            error: 'Failed to cancel order'
        })
    }
})

// Order details

app.get('/api/orders/:orderId', requireLogin, (req, res) => {
    const orderId = parseId(req.params.orderId)
    const userId = req.session.userId

    if (orderId === null) {
        return res.status(400).json({
            error: 'Invalid order ID'
        })
    }

    try {
        const order = defaultDatabase.prepare(`
            SELECT
                id,
                status,
                shipping_info,
                creation_date
            FROM orders
            WHERE id = ? AND user_id = ?
        `).get(orderId, userId)

        if (!order) {
            return res.status(404).json({
                error: 'Order not found'
            })
        }

        const items = defaultDatabase.prepare(`
            SELECT
                product_id,
                product_name,
                unit_price,
                quantity,
                total_price
            FROM order_items
            WHERE order_id = ?
        `).all(orderId)

        const totalPrice = roundMoney(
            items.reduce((sum, item) => sum + item.total_price, 0)
        )

        return res.status(200).json({
            message: 'Order details retrieved successfully',
            order: {
                orderId: order.id,
                status: order.status,
                paymentMethod: 'cash_on_delivery',
                paymentStatus: paymentStatusFor(order.status),
                totalPrice,
                createdAt: order.creation_date,
                shippingInfo: parseShippingInfo(order.shipping_info),
                items: items.map(item => ({
                    productId: item.product_id,
                    productName: item.product_name,
                    quantity: item.quantity,
                    pricePerItem: item.unit_price,
                    itemTotal: item.total_price
                }))
            }
        })

    } catch (error) {
        console.error('Get order details error:', error.message)

        return res.status(500).json({
            error: 'Failed to retrieve order details'
        })
    }
})

// Modify shipping information

app.patch('/api/orders/:orderId/shipping', requireLogin, (req, res) => {
    const orderId = parseId(req.params.orderId)
    const userId = req.session.userId

    const { email, shippingAddress, saveToProfile = false } = req.body ?? {}

    if (orderId === null) {
        return res.status(400).json({
            error: 'Invalid order ID'
        })
    }

    if (
        typeof email !== 'string' ||
        typeof shippingAddress !== 'string' ||
        typeof saveToProfile !== 'boolean'
    ) {
        return res.status(400).json({
            error: 'Email, shipping address, and saveToProfile are required'
        })
    }

    const normalizedEmail = email.trim().toLowerCase()
    const normalizedAddress = shippingAddress.trim()

    if (!isValidEmail(normalizedEmail)) {
        return res.status(400).json({
            error: 'Please provide a valid email address'
        })
    }

    if (normalizedAddress.length === 0 || normalizedAddress.length > 1000) {
        return res.status(400).json({
            error: 'Shipping address must be between 1 and 1000 characters'
        })
    }

    const shippingInfo = JSON.stringify({
        email: normalizedEmail,
        address: normalizedAddress
    })

    try {
        const updateShipping = defaultDatabase.transaction(() => {
            const order = defaultDatabase.prepare(`
                SELECT id, status
                FROM orders
                WHERE id = ? AND user_id = ?
            `).get(orderId, userId)

            if (!order) {
                return {
                    httpStatus: 404,
                    error: 'Order not found'
                }
            }

            if (['delivered', 'cancelled'].includes(order.status)) {
                return {
                    httpStatus: 409,
                    error: 'Shipping information cannot be changed for this order'
                }
            }

            defaultDatabase.prepare(`
                UPDATE orders
                SET shipping_info = ?
                WHERE id = ? AND user_id = ?
            `).run(shippingInfo, orderId, userId)

            if (saveToProfile) {
                defaultDatabase.prepare(`
                    UPDATE users
                    SET shipping_info = ?
                    WHERE id = ?
                `).run(shippingInfo, userId)
            }

            return {
                message: 'Shipping information updated successfully',
                orderId,
                shippingEmail: normalizedEmail,
                shippingAddress: normalizedAddress,
                savedToProfile: saveToProfile
            }
        })

        const result = updateShipping()

        if (result.httpStatus) {
            return res.status(result.httpStatus).json({
                error: result.error
            })
        }

        return res.status(200).json(result)

    } catch (error) {
        console.error('Update shipping information error:', error.message)

        return res.status(500).json({
            error: 'Failed to update shipping information'
        })
    }
})

// ———————————————— //
//  Error handling  //
// ———————————————— //

app.use((error, req, res, next) => {
    if (res.headersSent) {
        return next(error)
    }

    if (error.type === 'entity.parse.failed') {
        return res.status(400).json({
            error: 'Invalid JSON'
        })
    }

    if (error.type === 'entity.too.large') {
        return res.status(413).json({
            error: 'Request body too large'
        })
    }

    console.error('Unhandled error:', error)

    res.status(500).json({
        error: 'Something went wrong'
    })
})

app.listen(1000, () => {
    console.log('Server running on http://localhost:1000')
})