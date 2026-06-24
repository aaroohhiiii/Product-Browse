const request = require('supertest')
const app = require('../src/index')
const db = require('../src/db')

describe('Product Browse API Integration Tests', () => {
  
  // Close database pool after tests finish
  afterAll(async () => {
    // We don't close the pool inside db.js directly because it doesn't export the pool,
    // but the pool is managed by pg module's global pool or we can let Jest's forceExit handle it.
  })

  test('GET /api/health - health check', async () => {
    const res = await request(app).get('/api/health')
    expect(res.statusCode).toBe(200)
    expect(res.body.status).toBe('ok')
  })

  test('GET /api/products - defaults to 20 items', async () => {
    const res = await request(app).get('/api/products')
    expect(res.statusCode).toBe(200)
    expect(res.body.data).toBeInstanceOf(Array)
    expect(res.body.data.length).toBeLessThanOrEqual(20)
    expect(res.body).toHaveProperty('nextCursor')
    expect(res.body).toHaveProperty('hasMore')
  })

  test('GET /api/products - validation errors for invalid limit and sort', async () => {
    const resLimit = await request(app).get('/api/products?limit=150')
    expect(resLimit.statusCode).toBe(400)
    expect(resLimit.body).toHaveProperty('error')

    const resSort = await request(app).get('/api/products?sort=alphabetical')
    expect(resSort.statusCode).toBe(400)
    expect(resSort.body).toHaveProperty('error')
  })

  test('GET /api/products/categories - returns array of categories', async () => {
    const res = await request(app).get('/api/products/categories')
    expect(res.statusCode).toBe(200)
    expect(res.body).toBeInstanceOf(Array)
    expect(res.body.length).toBeGreaterThan(0)
    expect(typeof res.body[0]).toBe('string')
  })

  test('GET /api/products - filters by category', async () => {
    // 1. Fetch categories
    const catRes = await request(app).get('/api/products/categories')
    const targetCategory = catRes.body[0]

    // 2. Fetch products in that category
    const res = await request(app).get(`/api/products?category=${encodeURIComponent(targetCategory)}&limit=5`)
    expect(res.statusCode).toBe(200)
    res.body.data.forEach(product => {
      expect(product.category).toBe(targetCategory)
    })
  })

  test('GET /api/products - sorts by price ascending', async () => {
    const res = await request(app).get('/api/products?sort=price_asc&limit=10')
    expect(res.statusCode).toBe(200)
    const prices = res.body.data.map(p => parseFloat(p.price))
    
    // Check sorted order
    for (let i = 0; i < prices.length - 1; i++) {
      expect(prices[i]).toBeLessThanOrEqual(prices[i + 1])
    }
  })

  test('GET /api/products - sorts by price descending', async () => {
    const res = await request(app).get('/api/products?sort=price_desc&limit=10')
    expect(res.statusCode).toBe(200)
    const prices = res.body.data.map(p => parseFloat(p.price))
    
    // Check sorted order
    for (let i = 0; i < prices.length - 1; i++) {
      expect(prices[i]).toBeGreaterThanOrEqual(prices[i + 1])
    }
  })

  test('GET /api/products - stable cursor-based pagination across pages', async () => {
    // Page 1
    const resPage1 = await request(app).get('/api/products?limit=5')
    expect(resPage1.statusCode).toBe(200)
    expect(resPage1.body.data.length).toBe(5)
    
    const cursor = resPage1.body.nextCursor
    expect(cursor).not.toBeNull()

    // Page 2
    const resPage2 = await request(app).get(`/api/products?limit=5&cursor=${encodeURIComponent(cursor)}`)
    expect(resPage2.statusCode).toBe(200)
    expect(resPage2.body.data.length).toBe(5)

    // Check no duplicate products exist between page 1 and page 2
    const idsPage1 = resPage1.body.data.map(p => p.id)
    const idsPage2 = resPage2.body.data.map(p => p.id)
    const intersection = idsPage1.filter(id => idsPage2.includes(id))
    
    expect(intersection.length).toBe(0)
  })

  test('GET /api/products - full text search matches keywords', async () => {
    // 1. Get a product name to search
    const baseRes = await request(app).get('/api/products?limit=1')
    expect(baseRes.statusCode).toBe(200)
    if (baseRes.body.data.length > 0) {
      const sampleProductName = baseRes.body.data[0].name
      // Split name and take the first word as search query
      const firstWord = sampleProductName.split(' ')[0]

      // 2. Perform search
      const searchRes = await request(app).get(`/api/products?search=${encodeURIComponent(firstWord)}&limit=5`)
      expect(searchRes.statusCode).toBe(200)
      searchRes.body.data.forEach(product => {
        expect(product.name.toLowerCase()).toContain(firstWord.toLowerCase())
      })
    }
  })
})
