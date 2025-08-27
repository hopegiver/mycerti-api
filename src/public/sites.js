import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { requireUser } from '../utils/auth.js'

const app = new Hono()

// All routes require user authentication
app.use('*', requireUser)

// Validation schemas
const createSiteSchema = z.object({
  name: z.string().min(1),
  subdomain: z.string().min(1).regex(/^[a-z0-9-]+$/),
  plan: z.enum(['free', 'pro', 'enterprise']).default('free')
})

const updateSiteSchema = z.object({
  name: z.string().min(1).optional(),
  plan: z.enum(['free', 'pro', 'enterprise']).optional()
})

// POST /sites - 사이트 생성
app.post('/', zValidator('json', createSiteSchema), async (c) => {
  try {
    const user = c.get('user')
    const { name, subdomain, plan } = c.req.valid('json')

    // Check if subdomain is already taken
    const existingSite = await c.env.DB
      .prepare('SELECT id FROM sites WHERE subdomain = ?')
      .bind(subdomain)
      .first()

    if (existingSite) {
      return c.json({ error: 'Subdomain already taken' }, 400)
    }

    // Check user's site limit (basic limit: free=1, pro=5, enterprise=unlimited)
    const userSitesCount = await c.env.DB
      .prepare('SELECT COUNT(*) as count FROM sites WHERE owner_user_id = ?')
      .bind(user.id)
      .first()

    const limits = { free: 1, pro: 5, enterprise: 999 }
    if (userSitesCount.count >= limits[plan]) {
      return c.json({ error: `Site limit reached for ${plan} plan` }, 400)
    }

    // Create site
    const quotas = {
      free: { pages: 10, assets_mb: 100 },
      pro: { pages: 100, assets_mb: 1000 },
      enterprise: { pages: 1000, assets_mb: 10000 }
    }

    const result = await c.env.DB
      .prepare('INSERT INTO sites (owner_user_id, name, subdomain, plan, quota_pages, quota_assets_mb) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(
        user.id,
        name,
        subdomain,
        plan,
        quotas[plan].pages,
        quotas[plan].assets_mb
      )
      .run()

    if (!result.success) {
      return c.json({ error: 'Failed to create site' }, 500)
    }

    // Add user as owner in site_users table
    await c.env.DB
      .prepare('INSERT INTO site_users (site_id, user_id, role) VALUES (?, ?, ?)')
      .bind(result.meta.last_row_id, user.id, 'owner')
      .run()

    // Create default home page
    await c.env.DB
      .prepare('INSERT INTO pages (site_id, path, title, content_html, status, updated_by) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(
        result.meta.last_row_id,
        '/',
        'Welcome',
        '<h1>Welcome to your new site!</h1><p>Start building your homepage.</p>',
        'draft',
        user.id
      )
      .run()

    return c.json({
      message: 'Site created successfully',
      site: {
        id: result.meta.last_row_id,
        name,
        subdomain,
        plan,
        quota_pages: quotas[plan].pages,
        quota_assets_mb: quotas[plan].assets_mb
      }
    }, 201)

  } catch (error) {
    console.error('Create site error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// GET /sites - 사용자의 사이트 목록
app.get('/', async (c) => {
  try {
    const user = c.get('user')

    const sites = await c.env.DB
      .prepare(`
        SELECT s.*, su.role,
        (SELECT COUNT(*) FROM pages WHERE site_id = s.id AND status = 'published') as published_pages,
        (SELECT COUNT(*) FROM pages WHERE site_id = s.id) as total_pages
        FROM sites s
        LEFT JOIN site_users su ON s.id = su.site_id AND su.user_id = ?
        WHERE s.owner_user_id = ? OR su.user_id = ?
        ORDER BY s.created_at DESC
      `)
      .bind(user.id, user.id, user.id)
      .all()

    return c.json({
      sites: sites.results || []
    })

  } catch (error) {
    console.error('Get sites error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// GET /sites/:id - 특정 사이트 상세 정보
app.get('/:id', async (c) => {
  try {
    const user = c.get('user')
    const siteId = c.req.param('id')

    // Check if user has access to this site
    const siteAccess = await c.env.DB
      .prepare(`
        SELECT s.*, su.role
        FROM sites s
        LEFT JOIN site_users su ON s.id = su.site_id AND su.user_id = ?
        WHERE s.id = ? AND (s.owner_user_id = ? OR su.user_id = ?)
      `)
      .bind(user.id, siteId, user.id, user.id)
      .first()

    if (!siteAccess) {
      return c.json({ error: 'Site not found or access denied' }, 404)
    }

    // Get site statistics
    const stats = await c.env.DB
      .prepare(`
        SELECT 
          (SELECT COUNT(*) FROM pages WHERE site_id = ? AND status = 'published') as published_pages,
          (SELECT COUNT(*) FROM pages WHERE site_id = ?) as total_pages,
          (SELECT COUNT(*) FROM assets WHERE site_id = ?) as total_assets,
          (SELECT COALESCE(SUM(size_bytes), 0) FROM assets WHERE site_id = ?) as total_size_bytes
      `)
      .bind(siteId, siteId, siteId, siteId)
      .first()

    return c.json({
      site: {
        ...siteAccess,
        stats
      }
    })

  } catch (error) {
    console.error('Get site error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// PUT /sites/:id - 사이트 정보 수정
app.put('/:id', zValidator('json', updateSiteSchema), async (c) => {
  try {
    const user = c.get('user')
    const siteId = c.req.param('id')
    const updates = c.req.valid('json')

    // Check if user is owner
    const site = await c.env.DB
      .prepare('SELECT * FROM sites WHERE id = ? AND owner_user_id = ?')
      .bind(siteId, user.id)
      .first()

    if (!site) {
      return c.json({ error: 'Site not found or access denied' }, 404)
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
      
      // Update quotas based on new plan
      const quotas = {
        free: { pages: 10, assets_mb: 100 },
        pro: { pages: 100, assets_mb: 1000 },
        enterprise: { pages: 1000, assets_mb: 10000 }
      }
      updateFields.push('quota_pages = ?', 'quota_assets_mb = ?')
      values.push(quotas[updates.plan].pages, quotas[updates.plan].assets_mb)
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

// DELETE /sites/:id - 사이트 삭제
app.delete('/:id', async (c) => {
  try {
    const user = c.get('user')
    const siteId = c.req.param('id')

    // Check if user is owner
    const site = await c.env.DB
      .prepare('SELECT * FROM sites WHERE id = ? AND owner_user_id = ?')
      .bind(siteId, user.id)
      .first()

    if (!site) {
      return c.json({ error: 'Site not found or access denied' }, 404)
    }

    // Delete site (CASCADE will handle related records)
    await c.env.DB
      .prepare('DELETE FROM sites WHERE id = ?')
      .bind(siteId)
      .run()

    return c.json({ message: 'Site deleted successfully' })

  } catch (error) {
    console.error('Delete site error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export { app as sites }