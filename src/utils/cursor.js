// encodeCursor(created_at, id)
// Takes the created_at and id of the LAST item on the current page
// and encodes them into a single base64 string.
//
// Why base64? It's URL-safe (mostly), compact, and hides the internals.
// The client never needs to know what's inside the cursor string.
//
// Why JSON.stringify first? Because we need to combine two values 
// (created_at and id) into one string before encoding.
// JSON gives us a clean, parseable format to do that.
//
// created_at.toISOString() converts the Date object to a standard 
// UTC string like "2024-03-15T10:30:00.000Z" which is unambiguous 
// across timezones and safe to store/compare.
function encodeCursor(created_at, id) {
  const payload = JSON.stringify({
    created_at: new Date(created_at).toISOString(),
    id: id
  })
  // Buffer.from().toString('base64') is Node's built-in base64 encoder
  // No external library needed
  return Buffer.from(payload).toString('base64')
}

// decodeCursor(cursorString)
// Reverses encodeCursor. Takes the base64 string the client sent back,
// decodes it, and returns { created_at, id } so we can use them in SQL.
//
// We wrap in try/catch because if someone sends a malformed or tampered 
// cursor string, JSON.parse will throw. We return null in that case
// and the route handler will treat it as "no cursor" (first page).
//
// Why parseInt on id? JSON numbers are fine but pg expects a proper 
// integer for BIGINT comparisons. Belt and suspenders.
function decodeCursor(cursorString) {
  try {
    const payload = JSON.parse(Buffer.from(cursorString, 'base64').toString('utf8'))
    return {
      created_at: payload.created_at,
      id: parseInt(payload.id, 10)
    }
  } catch (err) {
    return null
  }
}

module.exports = { encodeCursor, decodeCursor }
