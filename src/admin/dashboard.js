import { Hono } from 'hono'
import { requireAdmin } from '../utils/auth.js'

const app = new Hono()

// All routes require admin authentication
app.use('*', requireAdmin)

// GET /dashboard - 대시보드 통계
app.get('/dashboard', async (c) => {
  try {
    const stats = await c.env.DB
      .prepare(`
        SELECT 
          (SELECT COUNT(*) FROM users WHERE status = 'active') as active_users,
          (SELECT COUNT(*) FROM users WHERE status = 'suspended') as suspended_users,
          (SELECT COUNT(*) FROM sites) as total_sites,
          (SELECT COUNT(*) FROM sites WHERE plan = 'free') as free_sites,
          (SELECT COUNT(*) FROM sites WHERE plan = 'pro') as pro_sites,
          (SELECT COUNT(*) FROM sites WHERE plan = 'enterprise') as enterprise_sites,
          (SELECT COUNT(*) FROM pages WHERE status = 'published') as published_pages,
          (SELECT COUNT(*) FROM publish_jobs WHERE created_at >= date('now', '-7 days')) as recent_publishes
      `)
      .first()

    return c.json({ stats })

  } catch (error) {
    console.error('Dashboard error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// GET /stats/users - 사용자 통계 (일별)
app.get('/stats/users', async (c) => {
  try {
    const days = parseInt(c.req.query('days')) || 30

    const userStats = await c.env.DB
      .prepare(`
        SELECT 
          date(created_at) as date,
          COUNT(*) as signups
        FROM users 
        WHERE created_at >= date('now', '-${days} days')
        GROUP BY date(created_at)
        ORDER BY date DESC
      `)
      .all()

    return c.json({
      stats: userStats.results || [],
      period: `${days} days`
    })

  } catch (error) {
    console.error('User stats error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// GET /stats/sites - 사이트 통계 (일별)
app.get('/stats/sites', async (c) => {
  try {
    const days = parseInt(c.req.query('days')) || 30

    const siteStats = await c.env.DB
      .prepare(`
        SELECT 
          date(created_at) as date,
          plan,
          COUNT(*) as created
        FROM sites 
        WHERE created_at >= date('now', '-${days} days')
        GROUP BY date(created_at), plan
        ORDER BY date DESC, plan
      `)
      .all()

    return c.json({
      stats: siteStats.results || [],
      period: `${days} days`
    })

  } catch (error) {
    console.error('Site stats error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// GET /stats/publishing - 퍼블리싱 통계
app.get('/stats/publishing', async (c) => {
  try {
    const days = parseInt(c.req.query('days')) || 30

    const publishStats = await c.env.DB
      .prepare(`
        SELECT 
          date(created_at) as date,
          scope,
          status,
          COUNT(*) as count
        FROM publish_jobs 
        WHERE created_at >= date('now', '-${days} days')
        GROUP BY date(created_at), scope, status
        ORDER BY date DESC
      `)
      .all()

    return c.json({
      stats: publishStats.results || [],
      period: `${days} days`
    })

  } catch (error) {
    console.error('Publishing stats error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export { app as adminDashboard }