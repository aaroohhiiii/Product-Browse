require('dotenv').config(); // Load .env before anything else

const express = require('express');
const productsRouter = require('./routes/products');

const app = express();

app.use(express.json());

// Serve static files from public/ folder
app.use(express.static('public'));

app.use('/api/products', productsRouter);

app.get('/', (req, res) => {
  res.json({ status: 'ok' });
});

// We use process.env.PORT because platforms like Render inject their own PORT at runtime.
// The app must listen on this provided port, otherwise the deployment will fail health checks.
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
