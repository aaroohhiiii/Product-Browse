const express = require('express')
const router = express.Router()
const db = require('../db')
const { encodeCursor, decodeCursor } = require('../utils/cursor')

// GET /api/products
// Query params:
//   - limit: how many products per page (default 20, max 100)
//   - cursor: opaque base64 string from previous response (absent on first page)
//   - category: optional category filter string
//
// CORE PAGINATION LOGIC:
// We use cursor-based pagination instead of OFFSET because:
// OFFSET 40000 means Postgres scans and discards 40000 rows before returning results.
// With 200k rows this gets slower the deeper you paginate.
// Cursor pagination uses the index to jump directly to the right position every time.
// Every page request is equally fast regardless of how deep you are.
//
// THE STABLE BROWSING GUARANTEE:
// If 50 new products are inserted while someone is on page 3, those new products
// have newer created_at timestamps. Our cursor points to an older timestamp.
// The WHERE clause only returns rows OLDER than the cursor, so new inserts
// never shift the results the user is seeing. No duplicates, no skipped rows.
//
// THE COMPOUND CURSOR PROBLEM:
// If two products share the exact same created_at timestamp (very possible with 
// bulk inserts), a single-field cursor is ambiguous — we don't know which of the 
// two same-timestamp rows we last saw.
// Solution: use (created_at, id) together as the cursor. Since id is unique,
// this combination is always unambiguous.

router.get('/', async (req, res) => {
  try {
    // Parse and validate limit
    // We cap at 100 to prevent someone requesting 200000 rows in one shot
    const limit = Math.min(parseInt(req.query.limit) || 20, 100)
    const category = req.query.category || null
    const cursorParam = req.query.cursor || null

    // Decode cursor if present
    // On first page request cursor is null so decoded will also be null
    // decodeCursor returns null if the string is malformed (safe fallback to first page)
    const decoded = cursorParam ? decodeCursor(cursorParam) : null

    // We fetch limit + 1 rows instead of exactly limit.
    // Why? To know if there are MORE pages after this one without a separate COUNT query.
    // If we get 21 rows back when limit is 20, we know there's a next page.
    // We return only 20 to the client but use the 21st to set hasMore = true.
    // A COUNT(*) on 200k rows with filters is expensive; this trick costs nothing.
    const fetchLimit = limit + 1

    // BUILD THE SQL QUERY DYNAMICALLY
    // We build it in parts because the WHERE clause changes depending on 
    // whether a cursor and/or category filter is present.
    
    const values = []
    let paramIndex = 1

    // Base query — we always order by (created_at DESC, id DESC)
    // newest products first, id as tiebreaker for same timestamps
    let query = `
      SELECT id, name, category, price, created_at, updated_at
      FROM products
      WHERE 1=1
    `
    // WHERE 1=1 is a common trick that lets us append AND clauses freely
    // without worrying about whether it's the first condition or not

    // Add category filter if provided
    if (category) {
      query += ` AND category = $${paramIndex}`
      values.push(category)
      paramIndex++
    }

    // Add cursor condition if this is not the first page
    // (created_at, id) < (cursor_time, cursor_id) with DESC ordering means
    // "give me rows that come AFTER the cursor position when sorted newest first"
    // This is a ROW VALUE COMPARISON — Postgres evaluates it as:
    //   created_at < cursor_time 
    //   OR (created_at = cursor_time AND id < cursor_id)
    // Which is exactly what we want for a compound sort key
    if (decoded) {
      query += ` AND (created_at, id) < ($${paramIndex}, $${paramIndex + 1})`
      values.push(decoded.created_at, decoded.id)
      paramIndex += 2
    }

    // Add ORDER BY and LIMIT
    query += ` ORDER BY created_at DESC, id DESC LIMIT $${paramIndex}`
    values.push(fetchLimit)

    // Execute query
    const result = await db.query(query, values)
    const rows = result.rows

    // Determine if there are more pages
    const hasMore = rows.length > limit

    // Slice off the extra row we fetched — client only gets limit rows
    const products = hasMore ? rows.slice(0, limit) : rows

    // Generate next cursor from the last row in the returned set
    // (not the extra row — from the actual last item the client sees)
    const lastRow = products[products.length - 1]
    const nextCursor = hasMore && lastRow 
      ? encodeCursor(lastRow.created_at, lastRow.id) 
      : null

    // Return response
    // nextCursor is null when there are no more pages
    // client should stop paginating when nextCursor is null
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

module.exports = router
