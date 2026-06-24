require('dotenv').config(); // Load .env before anything else

const express = require('express');
const rateLimit = require('express-rate-limit');
const productsRouter = require('./routes/products');

const app = express();

app.use(express.json());

// Apply rate limiting to protect all API endpoints from abuse/scraping
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 100, // limit each IP to 100 requests per minute
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api', apiLimiter);
app.use('/api/products', productsRouter);
app.use(express.static('public'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// We use process.env.PORT because platforms like Render inject their own PORT at runtime.
// The app must listen on this provided port, otherwise the deployment will fail health checks.
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

module.exports = app;
