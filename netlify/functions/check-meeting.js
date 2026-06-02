exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Extract meeting ID from path: /.netlify/functions/check-meeting/MEETING_ID
  const pathParts = event.path.split('/');
  const meetingId = pathParts[pathParts.length - 1];

  if (!meetingId) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ exists: false, message: 'Meeting ID required' }),
    };
  }

  // For Netlify, we'll always return exists: true since meetings are managed by the signaling server
  // In production, you'd check against a database
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      exists: true,
      meetingId: meetingId,
      hasPassword: false,
      waitingRoomEnabled: true,
      locked: false,
      participantCount: 0
    }),
  };
};