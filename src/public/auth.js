import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { hashPassword, comparePassword, generateToken, requireUser } from '../utils/auth.js'

const app = new Hono()

// Validation schemas
const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().optional()
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
})

// POST /auth/signup - 회원가입
app.post('/signup', zValidator('json', signupSchema), async (c) => {
  try {
    const { email, password, name } = c.req.valid('json')
    
    // Check if user already exists
    const existingUser = await c.env.DB
      .prepare('SELECT id FROM users WHERE email = ?')
      .bind(email)
      .first()

    if (existingUser) {
      return c.json({ error: 'User already exists' }, 400)
    }

    // Hash password and create user
    const passwordHash = await hashPassword(password)
    
    const result = await c.env.DB
      .prepare('INSERT INTO users (email, password_hash, name, status) VALUES (?, ?, ?, ?)')
      .bind(email, passwordHash, name || null, 'active')
      .run()

    if (!result.success) {
      return c.json({ error: 'Failed to create user' }, 500)
    }

    const token = generateToken({ 
      id: result.meta.last_row_id, 
      email, 
      name: name || null 
    })

    return c.json({
      message: 'User created successfully',
      user: {
        id: result.meta.last_row_id,
        email,
        name: name || null
      },
      token
    }, 201)

  } catch (error) {
    console.error('Signup error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// POST /auth/login - 로그인
app.post('/login', zValidator('json', loginSchema), async (c) => {
  try {
    const { email, password } = c.req.valid('json')
    
    // Find user
    const user = await c.env.DB
      .prepare('SELECT * FROM users WHERE email = ?')
      .bind(email)
      .first()

    if (!user) {
      return c.json({ error: 'Invalid credentials' }, 401)
    }

    // Verify password
    const isValidPassword = await comparePassword(password, user.password_hash)
    if (!isValidPassword) {
      return c.json({ error: 'Invalid credentials' }, 401)
    }

    // Check if user is active
    if (user.status !== 'active') {
      return c.json({ error: 'Account is suspended' }, 401)
    }

    const token = generateToken({
      id: user.id,
      email: user.email,
      name: user.name
    })

    return c.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      },
      token
    })

  } catch (error) {
    console.error('Login error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// GET /auth/me - 현재 사용자 정보
app.use('/me', requireUser)
app.get('/me', async (c) => {
  try {
    const user = c.get('user')
    
    const userData = await c.env.DB
      .prepare('SELECT id, email, name, status, created_at FROM users WHERE id = ?')
      .bind(user.id)
      .first()

    if (!userData) {
      return c.json({ error: 'User not found' }, 404)
    }

    // Get user's sites count
    const sitesCount = await c.env.DB
      .prepare('SELECT COUNT(*) as count FROM sites WHERE owner_user_id = ?')
      .bind(user.id)
      .first()

    return c.json({
      user: {
        ...userData,
        sites_count: sitesCount.count
      }
    })

  } catch (error) {
    console.error('Get user error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export { app as auth }