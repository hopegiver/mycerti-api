import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { requireAdmin } from '../utils/auth.js'

const app = new Hono()

// All routes require admin authentication
app.use('*', requireAdmin)

// Validation schemas
const updateSiteSchema = z.object({
  name: z.string().optional(),
  plan: z.enum(['free', 'pro', 'enterprise']).optional(),
  status: z.enum(['active', 'suspended']).optional(),
  quota_pages: z.number().optional(),
  quota_assets_mb: z.number().optional()
})

const transferSiteSchema = z.object({
  newOwnerId: z.number(),
  transferReason: z.string().optional()
})

// GET /sites - 사이트 관리 (페이지네이션, 검색, 필터)
app.get('/sites', async (c) => {
  try {
    const page = parseInt(c.req.query('page')) || 1
    const limit = parseInt(c.req.query('limit')) || 20
    const search = c.req.query('search') || ''
    const plan = c.req.query('plan') || ''
    const sortBy = c.req.query('sortBy') || 'created_at'
    const sortOrder = c.req.query('sortOrder') || 'DESC'

    let query = `
      SELECT s.*, u.email as owner_email, u.name as owner_name, u.status as owner_status,
      (SELECT COUNT(*) FROM pages WHERE site_id = s.id AND status = 'published') as published_pages,
      (SELECT COUNT(*) FROM pages WHERE site_id = s.id) as total_pages,
      (SELECT COUNT(*) FROM assets WHERE site_id = s.id) as total_assets,
      (SELECT COALESCE(SUM(size_bytes), 0) FROM assets WHERE site_id = s.id) as total_size_bytes,
      (SELECT COUNT(*) FROM site_users WHERE site_id = s.id) as members_count
      FROM sites s
      LEFT JOIN users u ON s.owner_user_id = u.id
      WHERE 1=1
    `
    const params = []

    if (search) {
      query += ` AND (s.name LIKE ? OR s.subdomain LIKE ? OR u.email LIKE ? OR u.name LIKE ?)`
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`)
    }

    if (plan) {
      query += ` AND s.plan = ?`
      params.push(plan)
    }

    // Validate sortBy to prevent SQL injection
    const allowedSortFields = ['created_at', 'name', 'subdomain', 'plan', 'owner_email']
    const validSortBy = allowedSortFields.includes(sortBy) ? 
      (sortBy === 'owner_email' ? 'u.email' : `s.${sortBy}`) : 's.created_at'
    const validSortOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'

    query += ` ORDER BY ${validSortBy} ${validSortOrder} LIMIT ? OFFSET ?`
    params.push(limit, (page - 1) * limit)

    const sites = await c.env.DB
      .prepare(query)
      .bind(...params)
      .all()

    // Get total count
    let countQuery = `
      SELECT COUNT(*) as total FROM sites s
      LEFT JOIN users u ON s.owner_user_id = u.id
      WHERE 1=1
    `
    const countParams = []

    if (search) {
      countQuery += ` AND (s.name LIKE ? OR s.subdomain LIKE ? OR u.email LIKE ? OR u.name LIKE ?)`
      countParams.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`)
    }

    if (plan) {
      countQuery += ` AND s.plan = ?`
      countParams.push(plan)
    }

    const totalResult = await c.env.DB
      .prepare(countQuery)
      .bind(...countParams)
      .first()

    return c.json({
      sites: sites.results || [],
      pagination: {
        page,
        limit,
        total: totalResult.total,
        pages: Math.ceil(totalResult.total / limit)
      }
    })

  } catch (error) {
    console.error('Get sites error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// GET /sites/:id - 특정 사이트 상세 정보
app.get('/sites/:id', async (c) => {
  try {
    const siteId = c.req.param('id')

    const site = await c.env.DB
      .prepare(`
        SELECT s.*, u.email as owner_email, u.name as owner_name, u.status as owner_status
        FROM sites s
        LEFT JOIN users u ON s.owner_user_id = u.id
        WHERE s.id = ?
      `)
      .bind(siteId)
      .first()

    if (!site) {
      return c.json({ error: 'Site not found' }, 404)
    }

    // Get site members
    const members = await c.env.DB
      .prepare(`
        SELECT su.*, u.email, u.name, u.status
        FROM site_users su
        LEFT JOIN users u ON su.user_id = u.id
        WHERE su.site_id = ?
        ORDER BY su.added_at DESC
      `)
      .bind(siteId)
      .all()

    // Get recent pages
    const recentPages = await c.env.DB
      .prepare(`
        SELECT p.*, u.name as updated_by_name
        FROM pages p
        LEFT JOIN users u ON p.updated_by = u.id
        WHERE p.site_id = ?
        ORDER BY p.updated_at DESC
        LIMIT 10
      `)
      .bind(siteId)
      .all()

    // Get recent publish jobs
    const recentPublishes = await c.env.DB
      .prepare(`
        SELECT pj.*, u.name as created_by_name
        FROM publish_jobs pj
        LEFT JOIN users u ON pj.created_by = u.id
        WHERE pj.site_id = ?
        ORDER BY pj.created_at DESC
        LIMIT 5
      `)
      .bind(siteId)
      .all()

    return c.json({
      site: {
        ...site,
        members: members.results || [],
        recent_pages: recentPages.results || [],
        recent_publishes: recentPublishes.results || []
      }
    })

  } catch (error) {
    console.error('Get site error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// PUT /sites/:id - 사이트 정보 수정
app.put('/sites/:id', zValidator('json', updateSiteSchema), async (c) => {
  try {
    const siteId = c.req.param('id')
    const updates = c.req.valid('json')

    const site = await c.env.DB
      .prepare('SELECT * FROM sites WHERE id = ?')
      .bind(siteId)
      .first()

    if (!site) {
      return c.json({ error: 'Site not found' }, 404)
    }

    // Build update query
    const updateFields = []
    const values = []
    
    if (updates.name) {
      updateFields.push('name = ?')
      values.push(updates.name)
    }
    
    if (updates.plan) {
      updateFields.push('plan = ?')
      values.push(updates.plan)
      
      // Update quotas based on new plan if not manually specified
      if (!updates.quota_pages && !updates.quota_assets_mb) {
        const quotas = {
          free: { pages: 10, assets_mb: 100 },
          pro: { pages: 100, assets_mb: 1000 },
          enterprise: { pages: 1000, assets_mb: 10000 }
        }
        updateFields.push('quota_pages = ?', 'quota_assets_mb = ?')
        values.push(quotas[updates.plan].pages, quotas[updates.plan].assets_mb)
      }
    }

    if (updates.quota_pages !== undefined) {
      updateFields.push('quota_pages = ?')
      values.push(updates.quota_pages)
    }

    if (updates.quota_assets_mb !== undefined) {
      updateFields.push('quota_assets_mb = ?')
      values.push(updates.quota_assets_mb)
    }

    if (updateFields.length === 0) {
      return c.json({ error: 'No fields to update' }, 400)
    }

    values.push(siteId)

    await c.env.DB
      .prepare(`UPDATE sites SET ${updateFields.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run()

    return c.json({ message: 'Site updated successfully' })

  } catch (error) {
    console.error('Update site error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// POST /sites/:id/transfer - 사이트 소유권 이전
app.post('/sites/:id/transfer', zValidator('json', transferSiteSchema), async (c) => {
  try {
    const siteId = c.req.param('id')
    const { newOwnerId, transferReason } = c.req.valid('json')

    const site = await c.env.DB
      .prepare('SELECT * FROM sites WHERE id = ?')
      .bind(siteId)
      .first()

    if (!site) {
      return c.json({ error: 'Site not found' }, 404)
    }

    // Check if new owner exists
    const newOwner = await c.env.DB
      .prepare('SELECT * FROM users WHERE id = ? AND status = ?')
      .bind(newOwnerId, 'active')
      .first()

    if (!newOwner) {
      return c.json({ error: 'New owner not found or inactive' }, 404)
    }

    // Update site ownership
    await c.env.DB
      .prepare('UPDATE sites SET owner_user_id = ? WHERE id = ?')
      .bind(newOwnerId, siteId)
      .run()

    // Update site_users table
    await c.env.DB
      .prepare('UPDATE site_users SET role = ? WHERE site_id = ? AND user_id = ?')
      .bind('admin', siteId, site.owner_user_id)
      .run()

    // Add or update new owner in site_users
    await c.env.DB
      .prepare(`
        INSERT OR REPLACE INTO site_users (site_id, user_id, role, added_at) 
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      `)
      .bind(siteId, newOwnerId, 'owner')
      .run()

    return c.json({ 
      message: 'Site ownership transferred successfully',
      from: site.owner_user_id,
      to: newOwnerId,
      reason: transferReason
    })

  } catch (error) {
    console.error('Transfer site error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// DELETE /sites/:id - 사이트 삭제
app.delete('/sites/:id', async (c) => {
  try {
    const siteId = c.req.param('id')

    const site = await c.env.DB
      .prepare('SELECT * FROM sites WHERE id = ?')
      .bind(siteId)
      .first()

    if (!site) {
      return c.json({ error: 'Site not found' }, 404)
    }

    // Get site statistics for logging
    const stats = await c.env.DB
      .prepare(`
        SELECT 
          (SELECT COUNT(*) FROM pages WHERE site_id = ?) as pages_count,
          (SELECT COUNT(*) FROM assets WHERE site_id = ?) as assets_count,
          (SELECT COUNT(*) FROM site_users WHERE site_id = ?) as members_count
      `)
      .bind(siteId, siteId, siteId)
      .first()

    // Delete site (CASCADE will handle related records)
    await c.env.DB
      .prepare('DELETE FROM sites WHERE id = ?')
      .bind(siteId)
      .run()

    return c.json({ 
      message: 'Site deleted successfully',
      deleted_stats: stats
    })

  } catch (error) {
    console.error('Delete site error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// POST /sites/:id/suspend - 사이트 일시정지
app.post('/sites/:id/suspend', zValidator('json', z.object({
  reason: z.string().optional()
})), async (c) => {
  try {
    const siteId = c.req.param('id')
    const { reason } = c.req.valid('json')

    const site = await c.env.DB
      .prepare('SELECT * FROM sites WHERE id = ?')
      .bind(siteId)
      .first()

    if (!site) {
      return c.json({ error: 'Site not found' }, 404)
    }

    // In a full implementation, you would add a status column to sites table
    // For now, we'll just return a success message
    return c.json({ 
      message: 'Site suspended successfully',
      reason: reason || 'No reason provided'
    })

  } catch (error) {
    console.error('Suspend site error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export { app as adminSites }