import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { requireAdmin, hashPassword } from '../utils/auth.js'

const app = new Hono()

// All routes require admin authentication
app.use('*', requireAdmin)

// Validation schemas
const updateUserSchema = z.object({
  name: z.string().optional(),
  status: z.enum(['active', 'suspended']).optional(),
  plan_limit: z.object({
    free: z.number().optional(),
    pro: z.number().optional(),
    enterprise: z.number().optional()
  }).optional()
})

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().optional(),
  status: z.enum(['active', 'suspended']).default('active')
})

// GET /users - 사용자 관리 (페이지네이션, 검색, 필터)
app.get('/users', async (c) => {
  try {
    const page = parseInt(c.req.query('page')) || 1
    const limit = parseInt(c.req.query('limit')) || 20
    const search = c.req.query('search') || ''
    const status = c.req.query('status') || ''
    const sortBy = c.req.query('sortBy') || 'created_at'
    const sortOrder = c.req.query('sortOrder') || 'DESC'

    let query = `
      SELECT u.*,
      (SELECT COUNT(*) FROM sites WHERE owner_user_id = u.id) as sites_count,
      (SELECT COUNT(*) FROM sites WHERE owner_user_id = u.id AND plan = 'free') as free_sites,
      (SELECT COUNT(*) FROM sites WHERE owner_user_id = u.id AND plan = 'pro') as pro_sites,
      (SELECT COUNT(*) FROM sites WHERE owner_user_id = u.id AND plan = 'enterprise') as enterprise_sites
      FROM users u
      WHERE 1=1
    `
    const params = []

    if (search) {
      query += ` AND (u.email LIKE ? OR u.name LIKE ?)`
      params.push(`%${search}%`, `%${search}%`)
    }

    if (status) {
      query += ` AND u.status = ?`
      params.push(status)
    }

    // Validate sortBy to prevent SQL injection
    const allowedSortFields = ['created_at', 'email', 'name', 'status']
    const validSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'created_at'
    const validSortOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'

    query += ` ORDER BY u.${validSortBy} ${validSortOrder} LIMIT ? OFFSET ?`
    params.push(limit, (page - 1) * limit)

    const users = await c.env.DB
      .prepare(query)
      .bind(...params)
      .all()

    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM users WHERE 1=1`
    const countParams = []

    if (search) {
      countQuery += ` AND (email LIKE ? OR name LIKE ?)`
      countParams.push(`%${search}%`, `%${search}%`)
    }

    if (status) {
      countQuery += ` AND status = ?`
      countParams.push(status)
    }

    const totalResult = await c.env.DB
      .prepare(countQuery)
      .bind(...countParams)
      .first()

    return c.json({
      users: users.results || [],
      pagination: {
        page,
        limit,
        total: totalResult.total,
        pages: Math.ceil(totalResult.total / limit)
      }
    })

  } catch (error) {
    console.error('Get users error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// GET /users/:id - 특정 사용자 상세 정보
app.get('/users/:id', async (c) => {
  try {
    const userId = c.req.param('id')

    const user = await c.env.DB
      .prepare(`
        SELECT u.*,
        (SELECT COUNT(*) FROM sites WHERE owner_user_id = u.id) as sites_count
        FROM users u
        WHERE u.id = ?
      `)
      .bind(userId)
      .first()

    if (!user) {
      return c.json({ error: 'User not found' }, 404)
    }

    // Get user's sites
    const sites = await c.env.DB
      .prepare(`
        SELECT id, name, subdomain, plan, created_at,
        (SELECT COUNT(*) FROM pages WHERE site_id = sites.id AND status = 'published') as published_pages
        FROM sites 
        WHERE owner_user_id = ? 
        ORDER BY created_at DESC
      `)
      .bind(userId)
      .all()

    return c.json({
      user: {
        ...user,
        sites: sites.results || []
      }
    })

  } catch (error) {
    console.error('Get user error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// POST /users - 새 사용자 생성
app.post('/users', zValidator('json', createUserSchema), async (c) => {
  try {
    const userData = c.req.valid('json')

    // Check if user already exists
    const existingUser = await c.env.DB
      .prepare('SELECT id FROM users WHERE email = ?')
      .bind(userData.email)
      .first()

    if (existingUser) {
      return c.json({ error: 'User already exists' }, 400)
    }

    // Hash password
    const passwordHash = await hashPassword(userData.password)

    const result = await c.env.DB
      .prepare('INSERT INTO users (email, password_hash, name, status) VALUES (?, ?, ?, ?)')
      .bind(userData.email, passwordHash, userData.name || null, userData.status)
      .run()

    if (!result.success) {
      return c.json({ error: 'Failed to create user' }, 500)
    }

    return c.json({
      message: 'User created successfully',
      user: {
        id: result.meta.last_row_id,
        email: userData.email,
        name: userData.name || null,
        status: userData.status
      }
    }, 201)

  } catch (error) {
    console.error('Create user error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// PUT /users/:id - 사용자 정보 수정
app.put('/users/:id', zValidator('json', updateUserSchema), async (c) => {
  try {
    const userId = c.req.param('id')
    const updates = c.req.valid('json')

    const user = await c.env.DB
      .prepare('SELECT * FROM users WHERE id = ?')
      .bind(userId)
      .first()

    if (!user) {
      return c.json({ error: 'User not found' }, 404)
    }

    // Build update query
    const updateFields = []
    const values = []
    
    if (updates.name !== undefined) {
      updateFields.push('name = ?')
      values.push(updates.name)
    }
    
    if (updates.status) {
      updateFields.push('status = ?')
      values.push(updates.status)
    }

    if (updateFields.length === 0) {
      return c.json({ error: 'No fields to update' }, 400)
    }

    values.push(userId)

    await c.env.DB
      .prepare(`UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run()

    return c.json({ message: 'User updated successfully' })

  } catch (error) {
    console.error('Update user error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// DELETE /users/:id - 사용자 삭제 (소프트 삭제)
app.delete('/users/:id', async (c) => {
  try {
    const userId = c.req.param('id')

    const user = await c.env.DB
      .prepare('SELECT * FROM users WHERE id = ?')
      .bind(userId)
      .first()

    if (!user) {
      return c.json({ error: 'User not found' }, 404)
    }

    // Check if user has sites
    const sitesCount = await c.env.DB
      .prepare('SELECT COUNT(*) as count FROM sites WHERE owner_user_id = ?')
      .bind(userId)
      .first()

    if (sitesCount.count > 0) {
      return c.json({ 
        error: 'Cannot delete user with active sites',
        sites_count: sitesCount.count 
      }, 400)
    }

    // Set status to suspended instead of hard delete
    await c.env.DB
      .prepare('UPDATE users SET status = ? WHERE id = ?')
      .bind('suspended', userId)
      .run()

    return c.json({ message: 'User suspended successfully' })

  } catch (error) {
    console.error('Delete user error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// POST /users/:id/reset-password - 비밀번호 재설정
app.post('/users/:id/reset-password', zValidator('json', z.object({
  newPassword: z.string().min(6)
})), async (c) => {
  try {
    const userId = c.req.param('id')
    const { newPassword } = c.req.valid('json')

    const user = await c.env.DB
      .prepare('SELECT * FROM users WHERE id = ?')
      .bind(userId)
      .first()

    if (!user) {
      return c.json({ error: 'User not found' }, 404)
    }

    const passwordHash = await hashPassword(newPassword)

    await c.env.DB
      .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .bind(passwordHash, userId)
      .run()

    return c.json({ message: 'Password reset successfully' })

  } catch (error) {
    console.error('Reset password error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export { app as adminUsers }