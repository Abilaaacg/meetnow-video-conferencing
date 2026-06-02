import { createRouter } from 'next-connect';

// In-memory store - must match create-meeting
const meetings = new Map();

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  const meeting = meetings.get(id);

  if (meeting) {
    return res.status(200).json({
      exists: true,
      meetingId: meeting.id,
      hasPassword: !!meeting.password,
      waitingRoomEnabled: meeting.waitingRoomEnabled,
    });
  } else {
    return res.status(404).json({ exists: false, message: 'Meeting not found' });
  }
}