const { v4: uuidv4 } = require('uuid');

// In-memory store (use DB for production)
const meetings = new Map();

export default function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const meetingId = uuidv4().slice(0, 8);
    const password = req.body.password || '';

    meetings.set(meetingId, {
      id: meetingId,
      password,
      waitingRoomEnabled: req.body.waitingRoom !== false,
      createdAt: new Date().toISOString(),
    });

    return res.status(200).json({ meetingId, success: true, password });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}