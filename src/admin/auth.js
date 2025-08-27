import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { generateToken } from '../utils/auth.js'

const app = new Hono()

// Validation schemas
const adminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string()
})

// POST /admin/login - 관리자 로그인
app.post('/login', zValidator('json', adminLoginSchema), async (c) => {
  try {
    const { email, password } = c.req.valid('json')
    
    // For demo purposes, hardcoded admin credentials
    // In production, store admin users in separate table
    if (email === 'admin@mycerti.com' && password === 'admin123') {
      const token = generateToken({
        id: 1,
        email: 'admin@mycerti.com',
        name: 'Super Admin',
        role: 'super_admin'
      }, 'admin')

      return c.json({
        message: 'Admin login successful',
        admin: {
          id: 1,
          email: 'admin@mycerti.com',
          name: 'Super Admin',
          role: 'super_admin'
        },
        token
      })
    }

    return c.json({ error: 'Invalid admin credentials' }, 401)

  } catch (error) {
    console.error('Admin login error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export { app as adminAuth }