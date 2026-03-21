// Vercel Cron Job — runs every Sunday at 6:00 AM
// Runs full pattern analysis and generates weekly intelligence report
const intelligenceHandler = require('../intelligence');

module.exports = async function handler(req, res) {
  const cronSecret = req.headers['x-cron-secret'];
  if (cronSecret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Reuse the intelligence handler's pattern analysis
  req.query = { action: 'pattern_analysis' };
  return intelligenceHandler(req, res);
};
