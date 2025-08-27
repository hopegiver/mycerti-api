import { Hono } from 'hono'
import { adminAuth } from './auth.js'
import { adminDashboard } from './dashboard.js'
import { adminUsers } from './users.js'
import { adminSites } from './sites.js'

const app = new Hono()

// Auth routes (no middleware, handles auth internally)
app.route('/', adminAuth)

// Protected routes (require admin auth)
app.route('/', adminDashboard)
app.route('/', adminUsers)
app.route('/', adminSites)

export { app as admin }