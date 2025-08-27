import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

export async function hashPassword(password) {
  return await bcrypt.hash(password, 10)
}

export async function comparePassword(password, hashedPassword) {
  return await bcrypt.compare(password, hashedPassword)
}

export function generateToken(payload, type = 'user') {
  const secret = type === 'admin' ? 'malgnsoft-admin' : 'malgnsoft-user'
  return jwt.sign(payload, secret, { expiresIn: '7d' })
}

export function verifyToken(token, type = 'user') {
  try {
    const secret = type === 'admin' ? 'malgnsoft-admin' : 'malgnsoft-user'
    return jwt.verify(token, secret)
  } catch (error) {
    return null
  }
}

export function requireAuth(type = 'user') {
  return async (c, next) => {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'No token provided' }, 401)
    }

    const token = authHeader.substring(7)
    const payload = verifyToken(token, type)
    
    if (!payload) {
      return c.json({ error: 'Invalid token' }, 401)
    }

    c.set('user', payload)
    await next()
  }
}

export const requireUser = requireAuth('user')
export const requireAdmin = requireAuth('admin')