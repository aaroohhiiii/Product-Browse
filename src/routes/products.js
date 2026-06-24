const express = require('express')
const router = express.Router()
const db = require('../db')
const { encodeCursor, decodeCursor } = require('../utils/cursor')
const { z } = require('zod')

// Cache variables for /api/products/categories
let categoriesCache = null
let cacheTimestamp = 0
const CACHE_TTL = 10 * 60 * 1000 // 10 minutes cache TTL

// Zod validation schema for /api/products query parameters
const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  category: z.string().optional(),
  search: z.string().optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc']).default('newest')
})

// Helper to convert plain search terms to prefix-matching tsquery
function formatSearchQuery(searchStr) {
  if (!searchStr) return null
  const words = searchStr.trim().split(/\s+/).filter(w => w.length > 0)
  if (words.length === 0) return null
  // Escape special tsquery characters and apply prefix wildcard (.*)
  return words.map(w => `${w.replace(/[:*&|!']/g, '')}:*`).join(' & ')
}

// GET /api/products/categories
// Returns all distinct categories. Cached in memory for 10 minutes.
// Backed by an index-only scan on idx_products_category_created_at_id.
router.get('/categories', async (req, res) => {
  try {
    const now = Date.now()
    if (categoriesCache && (now - cacheTimestamp < CACHE_TTL)) {
      return res.json(categoriesCache)
    }

    const query = `
      SELECT DISTINCT category 
      FROM products 
      ORDER BY category ASC
    `
    const result = await db.query(query)
    const categories = result.rows.map(r => r.category)

    categoriesCache = categories
    cacheTimestamp = now

    res.json(categories)
  } catch (err) {
    console.error('Error fetching categories:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/products
// Query params:
//   - limit: how many products per page (default 20, max 100)
//   - cursor: opaque base64 string from previous response (absent on first page)
//   - category: optional category filter string
//   - search: optional text search string
//   - sort: 'newest' | 'price_asc' | 'price_desc'
router.get('/', async (req, res) => {
  // Validate incoming query parameters
  const validation = querySchema.safeParse(req.query)
  if (!validation.success) {
    return res.status(400).json({
      error: 'Invalid query parameters',
      details: validation.error.format()
    })
  }

  const { limit, cursor: cursorParam, category, search, sort } = validation.data

  try {
    // Decode cursor if present
    const decoded = cursorParam ? decodeCursor(cursorParam) : null

    // Determine ordering parameters based on 'sort'
    let sortCol = 'created_at'
    let orderDirection = 'DESC'
    let compareOperator = '<' // Default for DESC: value less than cursor

    if (sort === 'price_asc') {
      sortCol = 'price'
      orderDirection = 'ASC'
      compareOperator = '>' // Value greater than cursor
    } else if (sort === 'price_desc') {
      sortCol = 'price'
      orderDirection = 'DESC'
      compareOperator = '<' // Value less than cursor
    }

    const fetchLimit = limit + 1
    const values = []
    let paramIndex = 1

    // Build query dynamically
    let query = `
      SELECT id, name, category, price, created_at, updated_at
      FROM products
      WHERE 1=1
    `

    // Category filter
    if (category) {
      query += ` AND category = $${paramIndex}`
      values.push(category)
      paramIndex++
    }

    // Full text search filter
    const tsQueryVal = formatSearchQuery(search)
    if (tsQueryVal) {
      query += ` AND search_vector @@ to_tsquery('english', $${paramIndex})`
      values.push(tsQueryVal)
      paramIndex++
    }

    // Cursor pagination constraint
    // We only apply the cursor filter if it matches the current sort parameter to prevent bugs
    if (decoded && decoded.sortField === sort) {
      query += ` AND (${sortCol}, id) ${compareOperator} ($${paramIndex}, $${paramIndex + 1})`
      values.push(decoded.sortValue, decoded.id)
      paramIndex += 2
    }

    // Order by column and tiebreaker ID
    query += ` ORDER BY ${sortCol} ${orderDirection}, id ${orderDirection} LIMIT $${paramIndex}`
    values.push(fetchLimit)

    // Execute query
    const result = await db.query(query, values)
    const rows = result.rows

    // Pagination status
    const hasMore = rows.length > limit
    const products = hasMore ? rows.slice(0, limit) : rows

    // Calculate next cursor
    const lastRow = products[products.length - 1]
    const nextCursor = hasMore && lastRow
      ? encodeCursor(sort, lastRow[sortCol], lastRow.id)
      : null

    res.json({
      data: products,
      nextCursor,
      hasMore,
      count: products.length
    })

  } catch (err) {
    console.error('Error fetching products:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/products/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params
    if (isNaN(parseInt(id))) {
      return res.status(400).json({ error: 'Invalid product ID' })
    }

    const query = `
      SELECT id, name, category, price, created_at, updated_at
      FROM products
      WHERE id = $1
    `
    const result = await db.query(query, [id])

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' })
    }

    res.json(result.rows[0])
  } catch (err) {
    console.error('Error fetching product by ID:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

module.exports = router

