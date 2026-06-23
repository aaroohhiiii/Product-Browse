# ProductBrowse

A backend API for browsing 200,000 products with stable cursor-based pagination and category filtering. Built as a take-home assignment for CodeVector.

**Live URL:** https://product-browse.onrender.com

---

## The Core Problem

Standard offset pagination (`LIMIT 20 OFFSET 40000`) has two problems at scale:

1. **It gets slower the deeper you go.** Postgres scans and discards 40,000 rows before returning 20. On 200k rows this is measurably slow by page 500.

2. **It breaks when data changes.** If 50 new products are inserted while you're on page 3, everything shifts. You see duplicates or skip rows entirely.

This API uses cursor-based pagination to solve both. Each response returns a cursor pointing to the last item you saw. The next request picks up exactly from that position using an index scan, not a row count. New inserts never affect results you're already browsing.

---

## Tech Stack

- **Runtime:** Node.js + Express
- **Database:** PostgreSQL (hosted on Supabase)
- **Deployed on:** Render

---

## Project Structure
/

├── src/

│   ├── index.js          # Express app entry point

│   ├── db.js             # PostgreSQL connection pool

│   ├── routes/

│   │   └── products.js   # Pagination + filter logic

│   └── utils/

│       └── cursor.js     # Cursor encode/decode helpers

├── public/

│   └── index.html        # Frontend UI (vanilla JS)

├── schema.sql            # Table definition + indexes

├── seed.js               # Generates and inserts 200k products

└── .env.example          # Environment variable template

---

## Running Locally

**1. Clone and install**
```bash
git clone https://github.com/aaroohhiiii/Product-Browse
cd Product-Browse
npm install
```

**2. Set up environment variables**
```bash
cp .env.example .env
```
Fill in your Supabase session pooler connection string:
DATABASE_URL=postgresql://postgres.xxxx:password@aws-0-ap-south-1.pooler.supabase.com:5432/postgres

PORT=3000

**3. Run the schema**

Go to Supabase SQL editor, paste the contents of `schema.sql` and run it. This creates the products table and both indexes.

**4. Seed the database**
```bash
npm run seed
```
Inserts 200,000 products in batches of 1,000. Takes under 60 seconds.

**5. Start the server**
```bash
npm run dev
```
Server runs at `http://localhost:3000`

---

## API Reference

### GET /api/products

Fetch a paginated list of products, newest first.

**Query Parameters**

| Parameter  | Type   | Required | Description |
|------------|--------|----------|-------------|
| limit      | number | No       | Products per page. Default 20, max 100 |
| cursor     | string | No       | Cursor from previous response. Omit for first page |
| category   | string | No       | Filter by category name |

**Example Requests**

First page:
GET /api/products

GET /api/products?limit=20

With category filter:
GET /api/products?category=Electronics

Next page (paste cursor from previous response):
GET /api/products?cursor=eyJjcmVhdGVkX2F0IjoiMjAyNC0wMy0xNVQxMDozMDowMC4wMDBaIiwiaWQiOjU0MzJ9

Combined:
GET /api/products?category=Electronics&cursor=eyJjcmVhdGVkX2F0Ijoi...&limit=20

**Response**
```json
{
  "data": [
    {
      "id": 54320,
      "name": "Ergonomic Wooden Chair",
      "category": "Home & Kitchen",
      "price": "4299.99",
      "created_at": "2024-03-15T10:30:00.000Z",
      "updated_at": "2024-03-15T10:30:00.000Z"
    }
  ],
  "nextCursor": "eyJjcmVhdGVkX2F0IjoiMjAyNC0wMy0xNVQxMDozMDowMC4wMDBaIiwiaWQiOjU0MzJ9",
  "hasMore": true,
  "count": 20
}
```

When `nextCursor` is `null` and `hasMore` is `false`, you have reached the last page.

---

## Key Design Decisions

**Cursor pagination over offset**

Offset pagination scans and discards rows on every request. At 200k rows, deep pages are slow and inserts during browsing cause duplicates or skipped items. Cursor pagination uses an index to jump directly to the right position every time. Every page is equally fast regardless of depth.

**Compound cursor (created_at, id)**

Using only `created_at` as the cursor breaks when multiple products share the same timestamp, which happens frequently after bulk inserts. Adding `id` as a tiebreaker makes the cursor unambiguous since id is always unique.

**Two indexes**

`(created_at DESC, id DESC)` for unfiltered pagination. `(category, created_at DESC, id DESC)` for filtered pagination. Without the second index, a category filter would force a full table scan before applying the cursor.

**limit + 1 trick**

We fetch one extra row per request to determine if a next page exists, instead of running a separate COUNT query. COUNT on a large filtered table is expensive. Fetching one extra row costs nothing.

**Batch inserts in seed script**

Inserting 200k rows one at a time would require 200,000 network round trips to the database. Batching 1,000 rows per INSERT reduces that to 200 round trips. The entire seed runs in under 60 seconds wrapped in a single transaction so a failed run leaves no partial data.

**NUMERIC(10,2) for price**

Floating point types (FLOAT, DOUBLE) cannot represent all decimal values exactly. `0.1 + 0.2` in a float is `0.30000000000000004`. For money this is a real bug. NUMERIC stores exact decimal values.

**TIMESTAMPTZ over TIMESTAMP**

TIMESTAMPTZ stores all timestamps in UTC internally and converts on read. TIMESTAMP stores no timezone info, which causes silent bugs if the server region changes or the app goes global.

---

## What I'd Improve With More Time

- Full text search on product name using a GIN index on a tsvector column
- A `/api/categories` endpoint returning distinct categories dynamically from the DB instead of hardcoding them in the frontend
- Rate limiting on the API
- Integration tests for cursor edge cases, particularly around same-timestamp products
- A proper CI pipeline that runs the seed script and hits the API before deploying

---

## Note on AI Usage

I used Claude throughout this project. It helped me think through the pagination approach, scaffold the structure, and speed up implementation. The most useful thing was using it to reason through tradeoffs rather than just generate code. For example, understanding why cursor pagination solves the stable browsing requirement that offset pagination can't, catching that the seed script needed a transaction so a failed run doesn't leave partial data, and understanding why the composite index needs category as the leftmost column. All comments in the code reflect what I actually understand about each decision.