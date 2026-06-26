import express from 'express';
import cors from 'cors';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Placeholder for ticket analysis endpoint (to be implemented in Step 8)
app.post('/analyze-ticket', (_req, res) => {
  res.status(501).json({ error: 'Endpoint not implemented yet' });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

export default app;
