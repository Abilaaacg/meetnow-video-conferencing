const { v4: uuidv4 } = require('uuid');

// In-memory store (resets on cold start - use a database for production)
const meetings = new Map();

exports.handler = async (event) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const meetingId = uuidv4().slice(0, 8);
    const password = body.password || '';

    meetings.set(meetingId, {
      id: meetingId,
      password,
      waitingRoomEnabled: body.waitingRoom !== false,
      createdAt: new Date().toISOString(),
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ meetingId, success: true, password }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Internal server error' }),
    };
  }
};