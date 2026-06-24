// encodeCursor(sortField, sortValue, id)
// Takes the field we're sorting by, its value, and the unique ID of the row
// and encodes them into a single base64 string.
function encodeCursor(sortField, sortValue, id) {
  let value = sortValue
  if (sortField === 'created_at') {
    value = new Date(sortValue).toISOString()
  } else if (sortField === 'price') {
    // Keep as a string to preserve decimal precision in JSON transmission
    value = sortValue.toString()
  }

  const payload = JSON.stringify({
    sortField: sortField,
    sortValue: value,
    id: id
  })
  return Buffer.from(payload).toString('base64')
}

// decodeCursor(cursorString)
// Reverses encodeCursor. Decodes base64 back into { sortField, sortValue, id }.
//
// Backward Compatibility:
// If it finds the old cursor format { created_at, id }, it seamlessly maps it 
// to { sortField: 'created_at', sortValue: created_at, id } so existing users
// or cached links do not break.
function decodeCursor(cursorString) {
  try {
    const payload = JSON.parse(Buffer.from(cursorString, 'base64').toString('utf8'))
    
    // Fallback for old cursor format
    if (payload.created_at && !payload.sortField) {
      return {
        sortField: 'created_at',
        sortValue: payload.created_at,
        id: parseInt(payload.id, 10)
      }
    }

    return {
      sortField: payload.sortField,
      sortValue: payload.sortValue,
      id: parseInt(payload.id, 10)
    }
  } catch (err) {
    return null
  }
}

module.exports = { encodeCursor, decodeCursor }

