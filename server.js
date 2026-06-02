const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT, 10) || 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Store active meetings and their participants
const meetings = new Map();
const waitingRoom = new Map(); // meetingId -> [socketIds]

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);

      // API route: Create a new meeting
      if (parsedUrl.pathname === '/api/create-meeting' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const data = body ? JSON.parse(body) : {};
            const meetingId = uuidv4().slice(0, 8);
            const password = data.password || '';
            meetings.set(meetingId, {
              id: meetingId,
              password: password,
              host: null,
              participants: [],
              waitingRoomEnabled: data.waitingRoom !== false,
              createdAt: new Date().toISOString(),
              locked: false
            });
            waitingRoom.set(meetingId, []);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ meetingId, success: true, password }));
          } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Invalid request' }));
          }
        });
        return;
      }

      // API route: Check if meeting exists
      if (parsedUrl.pathname.startsWith('/api/meeting/') && req.method === 'GET') {
        const meetingId = parsedUrl.pathname.split('/').pop();
        const meeting = meetings.get(meetingId);
        if (meeting) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            exists: true,
            meetingId: meeting.id,
            hasPassword: !!meeting.password,
            waitingRoomEnabled: meeting.waitingRoomEnabled,
            locked: meeting.locked,
            participantCount: meeting.participants.length
          }));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ exists: false, message: 'Meeting not found' }));
        }
        return;
      }

      // API route: Get all meetings (admin)
      if (parsedUrl.pathname === '/api/meetings' && req.method === 'GET') {
        const meetingList = [];
        meetings.forEach((meeting, id) => {
          meetingList.push({
            id: meeting.id,
            participants: meeting.participants.length,
            createdAt: meeting.createdAt
          });
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ meetings: meetingList }));
        return;
      }

      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error handling request:', err);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  });

  // Initialize Socket.IO
  const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Verify meeting password and join
    socket.on('join-meeting', ({ meetingId, password, displayName }) => {
      console.log(`User ${socket.id} (${displayName}) joining meeting ${meetingId}`);

      if (!meetings.has(meetingId)) {
        socket.emit('join-error', { message: 'Meeting not found' });
        return;
      }

      const meeting = meetings.get(meetingId);

      if (meeting.locked) {
        socket.emit('join-error', { message: 'Meeting is locked' });
        return;
      }

      // Check password
      if (meeting.password && meeting.password !== password) {
        socket.emit('join-error', { message: 'Incorrect password' });
        return;
      }

      // Check waiting room
      if (meeting.waitingRoomEnabled && !meeting.host) {
        // First person becomes host, no waiting room needed
      } else if (meeting.waitingRoomEnabled && meeting.host) {
        // Add to waiting room
        if (!waitingRoom.has(meetingId)) waitingRoom.set(meetingId, []);
        waitingRoom.get(meetingId).push({ socketId: socket.id, displayName: displayName || 'Guest' });

        // Notify host
        if (meeting.host) {
          io.to(meeting.host).emit('waiting-room-user', {
            socketId: socket.id,
            displayName: displayName || 'Guest'
          });
        }
        socket.emit('waiting-room');
        return;
      }

      // Add to meeting
      meeting.participants.push({ socketId: socket.id, displayName: displayName || 'Guest' });
      if (!meeting.host) meeting.host = socket.id;

      socket.join(meetingId);
      socket.meetingId = meetingId;
      socket.displayName = displayName || 'Guest';
      socket.isHost = meeting.host === socket.id;

      // Notify existing participants
      const otherParticipants = meeting.participants.filter(p => p.socketId !== socket.id);
      socket.to(meetingId).emit('user-joined', {
        userId: socket.id,
        displayName: socket.displayName,
        participantCount: meeting.participants.length,
        isHost: socket.isHost
      });

      // Send meeting info and participants list to the new user
      socket.emit('meeting-joined', {
        meetingId: meeting.id,
        participants: otherParticipants,
        participantCount: meeting.participants.length,
        isHost: socket.isHost,
        waitingRoomEnabled: meeting.waitingRoomEnabled,
        locked: meeting.locked
      });

      console.log(`Meeting ${meetingId} now has ${meeting.participants.length} participants`);
    });

    // Admit from waiting room
    socket.on('admit-user', ({ userId }) => {
      const meetingId = socket.meetingId;
      if (!meetingId || !meetings.has(meetingId)) return;

      const meeting = meetings.get(meetingId);
      const wr = waitingRoom.get(meetingId) || [];
      const userIndex = wr.findIndex(u => u.socketId === userId);
      if (userIndex === -1) return;

      const user = wr.splice(userIndex, 1)[0];

      // Add to meeting
      meeting.participants.push({ socketId: user.socketId, displayName: user.displayName });

      // Notify the admitted user
      io.to(userId).emit('admitted', { meetingId });

      // Notify all participants
      const allParticipants = meeting.participants.filter(p => p.socketId !== userId).map(p => ({
        socketId: p.socketId,
        displayName: p.displayName
      }));
      io.to(userId).emit('meeting-joined', {
        meetingId: meeting.id,
        participants: allParticipants,
        participantCount: meeting.participants.length,
        isHost: false,
        waitingRoomEnabled: meeting.waitingRoomEnabled,
        locked: meeting.locked
      });

      // Notify existing participants
      socket.to(meetingId).emit('user-joined', {
        userId: user.socketId,
        displayName: user.displayName,
        participantCount: meeting.participants.length
      });
    });

    // Deny from waiting room
    socket.on('deny-user', ({ userId }) => {
      const meetingId = socket.meetingId;
      const wr = waitingRoom.get(meetingId) || [];
      const idx = wr.findIndex(u => u.socketId === userId);
      if (idx !== -1) {
        wr.splice(idx, 1);
        io.to(userId).emit('denied', { message: 'You were denied access to the meeting' });
      }
    });

    // Toggle waiting room
    socket.on('toggle-waiting-room', ({ enabled }) => {
      const meetingId = socket.meetingId;
      if (!meetingId || !meetings.has(meetingId)) return;
      meetings.get(meetingId).waitingRoomEnabled = enabled;
      socket.to(meetingId).emit('waiting-room-changed', { enabled });
    });

    // Lock/unlock meeting
    socket.on('lock-meeting', ({ locked }) => {
      const meetingId = socket.meetingId;
      if (!meetingId || !meetings.has(meetingId)) return;
      meetings.get(meetingId).locked = locked;
      socket.to(meetingId).emit('meeting-locked', { locked });
    });

    // WebRTC Signaling - Offer
    socket.on('offer', ({ to, offer }) => {
      io.to(to).emit('offer', { from: socket.id, displayName: socket.displayName, offer });
    });

    // WebRTC Signaling - Answer
    socket.on('answer', ({ to, answer }) => {
      io.to(to).emit('answer', { from: socket.id, answer });
    });

    // WebRTC Signaling - ICE Candidate
    socket.on('ice-candidate', ({ to, candidate }) => {
      io.to(to).emit('ice-candidate', { from: socket.id, candidate });
    });

    // Chat messages
    socket.on('chat-message', (data) => {
      const meetingId = socket.meetingId;
      if (meetingId) {
        io.to(meetingId).emit('chat-message', {
          from: socket.id,
          displayName: socket.displayName,
          message: data.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Reactions
    socket.on('reaction', (data) => {
      const meetingId = socket.meetingId;
      if (meetingId) {
        io.to(meetingId).emit('reaction', {
          from: socket.id,
          displayName: socket.displayName,
          emoji: data.emoji
        });
      }
    });

    // Raise hand
    socket.on('toggle-hand', () => {
      const meetingId = socket.meetingId;
      if (meetingId) {
        socket.handRaised = !socket.handRaised;
        io.to(meetingId).emit('hand-raised', {
          userId: socket.id,
          displayName: socket.displayName,
          raised: socket.handRaised
        });
      }
    });

    // Media state changes
    socket.on('media-change', (data) => {
      const meetingId = socket.meetingId;
      if (meetingId) {
        socket.to(meetingId).emit('media-change', {
          userId: socket.id,
          ...data
        });
      }
    });

    // Layout change
    socket.on('layout-change', (data) => {
      const meetingId = socket.meetingId;
      if (meetingId) {
        socket.to(meetingId).emit('layout-change', {
          userId: socket.id,
          layout: data.layout
        });
      }
    });

    // Screen share start/stop
    socket.on('screen-share', (data) => {
      const meetingId = socket.meetingId;
      if (meetingId) {
        socket.to(meetingId).emit('screen-share', {
          userId: socket.id,
          displayName: socket.displayName,
          sharing: data.sharing
        });
      }
    });

    // Screen share stream
    socket.on('screen-share-stream', ({ to, stream }) => {
      io.to(to).emit('screen-share-stream', { from: socket.id, stream });
    });

    // Mute all (host only)
    socket.on('mute-all', () => {
      const meetingId = socket.meetingId;
      if (meetingId && socket.isHost) {
        socket.to(meetingId).emit('mute-all');
      }
    });

    // Remove participant (host only)
    socket.on('remove-participant', ({ userId }) => {
      const meetingId = socket.meetingId;
      if (!meetingId || !meetings.has(meetingId)) return;

      const meeting = meetings.get(meetingId);
      if (socket.isHost && userId !== socket.id) {
        const idx = meeting.participants.findIndex(p => p.socketId === userId);
        if (idx !== -1) {
          meeting.participants.splice(idx, 1);
          io.to(userId).emit('removed', { message: 'You have been removed from the meeting' });
          io.to(meetingId).emit('user-left', {
            userId,
            participantCount: meeting.participants.length
          });
        }
      }
    });

    // End meeting (host only)
    socket.on('end-meeting', () => {
      const meetingId = socket.meetingId;
      if (!meetingId || !meetings.has(meetingId)) return;

      const meeting = meetings.get(meetingId);
      if (socket.isHost) {
        io.to(meetingId).emit('meeting-ended');
        meetings.delete(meetingId);
        waitingRoom.delete(meetingId);
        console.log(`Meeting ${meetingId} ended by host`);
      }
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id}`);

      const meetingId = socket.meetingId;
      if (meetingId && meetings.has(meetingId)) {
        const meeting = meetings.get(meetingId);
        meeting.participants = meeting.participants.filter(p => p.socketId !== socket.id);

        // Handle host transfer
        if (meeting.host === socket.id && meeting.participants.length > 0) {
          meeting.host = meeting.participants[0].socketId;
          io.to(meeting.host).emit('host-transferred', {
            displayName: meeting.participants[0].displayName
          });
        }

        io.to(meetingId).emit('user-left', {
          userId: socket.id,
          displayName: socket.displayName,
          participantCount: meeting.participants.length,
          handRaised: socket.handRaised
        });

        // Also remove from waiting room
        const wr = waitingRoom.get(meetingId) || [];
        const wrIdx = wr.findIndex(u => u.socketId === socket.id);
        if (wrIdx !== -1) wr.splice(wrIdx, 1);

        // Clean up empty meetings
        if (meeting.participants.length === 0) {
          meetings.delete(meetingId);
          waitingRoom.delete(meetingId);
          console.log(`Meeting ${meetingId} deleted (empty)`);
        } else {
          console.log(`Meeting ${meetingId} now has ${meeting.participants.length} participants`);
        }
      }
    });
  });

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});