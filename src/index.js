import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { auth } from './public/auth.js'
import { sites } from './public/sites.js'
import { admin } from './admin/index.js'

const app = new Hono()

app.use('*', cors())
app.use('*', logger())

// Health check
app.get('/', (c) => c.json({ message: 'MyCerti API v1.0' }))

// Public routes (no auth required)
app.route('/auth', auth)

// User routes (JWT required)
app.route('/sites', sites)

// Admin routes (Super Admin JWT required)
app.route('/admin', admin)

export default app