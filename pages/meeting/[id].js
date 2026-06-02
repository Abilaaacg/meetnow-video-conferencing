import Head from 'next/head'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/router'
import Peer from 'peerjs'

export async function getServerSideProps() {
  return { props: {} }
}

const REACTIONS = ['👍', '👏', '❤️', '😂', '😮', '🎉', '🔥', '💯']

export default function MeetingRoom() {
  const router = useRouter()
  const { id: meetingId } = router.query

  const [connected, setConnected] = useState(false)
  const [meetingJoined, setMeetingJoined] = useState(false)
  const [joinError, setJoinError] = useState('')
  const [meetingEnded, setMeetingEnded] = useState(false)

  const [audioEnabled, setAudioEnabled] = useState(true)
  const [videoEnabled, setVideoEnabled] = useState(true)
  const [screenSharing, setScreenSharing] = useState(false)

  const [participants, setParticipants] = useState([])
  const [participantCount, setParticipantCount] = useState(1)
  const [isHost, setIsHost] = useState(false)
  const [displayName, setDisplayName] = useState('')

  const [activePanel, setActivePanel] = useState(null)
  const [chatMessages, setChatMessages] = useState([])
  const [chatInput, setChatInput] = useState('')

  const [handRaised, setHandRaised] = useState(false)
  const [reactions, setReactions] = useState([])
  const [showReactionPicker, setShowReactionPicker] = useState(false)
  const [meetingTimer, setMeetingTimer] = useState(0)
  const [copied, setCopied] = useState(false)
  const [notification, setNotification] = useState(null)

  const localVideoRef = useRef(null)
  const localStreamRef = useRef(null)
  const screenStreamRef = useRef(null)
  const peerRef = useRef(null)
  const connectionsRef = useRef({})
  const remoteVideosRef = useRef({})
  const chatEndRef = useRef(null)
  const timerRef = useRef(null)

  const showNotif = useCallback((msg, type = 'info') => {
    setNotification({ msg, type })
    setTimeout(() => setNotification(null), 3000)
  }, [])

  const formatTime = (s) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
  }

  const copyMeetingLink = () => {
    navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Initialize peer and stream
  useEffect(() => {
    if (!meetingId) return

    const name = localStorage.getItem('displayName') || 'Guest'
    setDisplayName(name)

    const init = async () => {
      // Get local stream
      let stream
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true })
          setVideoEnabled(false)
        } catch {
          showNotif('Could not access camera or microphone', 'error')
          return
        }
      }
      localStreamRef.current = stream
      if (localVideoRef.current) localVideoRef.current.srcObject = stream

      // Create PeerJS peer
      const peerId = `${meetingId}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`
      const peer = new Peer(peerId, {
        host: '0.peerjs.com',
        port: 443,
        path: '/',
        debug: 0,
      })
      peerRef.current = peer

      peer.on('open', (id) => {
        setConnected(true)
        setMeetingJoined(true)
        setIsHost(true)
        showNotif('Connected! Share the meeting link to invite others.', 'success')
      })

      peer.on('error', (err) => {
        console.error('PeerJS error:', err)
        if (err.type === 'unavailable-id') {
          setJoinError('Meeting is full or already exists')
        }
      })

      // Handle incoming connections (new participant)
      peer.on('connection', (conn) => {
        conn.on('open', () => {
          const peerName = conn.metadata?.displayName || 'Guest'
          const remotePeerId = conn.peer

          connectionsRef.current[remotePeerId] = conn
          setParticipants(prev => {
            const exists = prev.find(p => p.id === remotePeerId)
            if (exists) return prev
            return [...prev, { id: remotePeerId, displayName: peerName }]
          })
          setParticipantCount(prev => prev + 1)
          showNotif(`${peerName} joined`, 'info')

          // Send existing participants list to new peer
          const existingPeers = Object.keys(connectionsRef.current)
          conn.send({ type: 'peers-list', peers: existingPeers, hostName: name })

          // Tell existing peers about the new peer
          Object.entries(connectionsRef.current).forEach(([id, c]) => {
            if (id !== remotePeerId && c.open) {
              c.send({ type: 'new-peer', peerId: remotePeerId, displayName: peerName })
            }
          })

          // Set up chat and data handlers
          setupDataHandlers(conn, remotePeerId)
        })
      })

      // If host exists, connect to host
      const hostPeerId = meetingId
      const conn = peer.connect(hostPeerId, {
        metadata: { displayName: name },
        reliable: true,
      })

      conn.on('open', () => {
        setIsHost(false)
        connectionsRef.current['host'] = conn
        setupDataHandlers(conn, 'host')
      })

      conn.on('error', () => {
        // No host found - we are the host
        setIsHost(true)
        showNotif('You are the first participant (Host)', 'info')
      })
    }

    init()

    return () => {
      if (peerRef.current) peerRef.current.destroy()
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop())
      if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach(t => t.stop())
    }
  }, [meetingId])

  // Setup data handlers for a connection
  const setupDataHandlers = useCallback((conn, remotePeerId) => {
    conn.on('data', (data) => {
      switch (data.type) {
        case 'chat':
          setChatMessages(prev => [...prev, {
            from: remotePeerId,
            displayName: data.displayName,
            message: data.message,
            timestamp: new Date().toISOString(),
            isLocal: false,
          }])
          break
        case 'reaction': {
          const id = Date.now() + Math.random()
          setReactions(prev => [...prev, { id, emoji: data.emoji, from: data.displayName }])
          setTimeout(() => setReactions(prev => prev.filter(r => r.id !== id)), 3000)
          break
        }
        case 'hand-raise':
          setParticipants(prev => prev.map(p =>
            p.id === remotePeerId ? { ...p, handRaised: data.raised } : p
          ))
          break
        case 'media-change':
          setParticipants(prev => prev.map(p =>
            p.id === remotePeerId ? { ...p, audioMuted: data.audio === false, videoOff: data.video === false } : p
          ))
          break
        case 'peers-list':
          // Connect to all existing peers
          data.peers.forEach(peerId => {
            if (!connectionsRef.current[peerId]) {
              const newConn = conn.peer.connect(peerId, {
                metadata: { displayName: localStorage.getItem('displayName') || 'Guest' },
                reliable: true,
              })
              newConn.on('open', () => {
                connectionsRef.current[peerId] = newConn
                setupDataHandlers(newConn, peerId)
                // Call the peer for video
                callPeer(peerId)
              })
            }
          })
          break
        case 'new-peer':
          // A new peer joined - connect to them
          if (!connectionsRef.current[data.peerId]) {
            const newConn = conn.peer.connect(data.peerId, {
              metadata: { displayName: localStorage.getItem('displayName') || 'Guest' },
              reliable: true,
            })
            newConn.on('open', () => {
              connectionsRef.current[data.peerId] = newConn
              setupDataHandlers(newConn, data.peerId)
            })
          }
          break
      }
    })
  }, [])

  // Call a peer for video
  const callPeer = useCallback((peerId) => {
    if (!peerRef.current || !localStreamRef.current) return

    const call = peerRef.current.call(peerId, localStreamRef.current)
    if (!call) return

    call.on('stream', (remoteStream) => {
      let video = document.getElementById(`remote-${peerId}`)
      if (!video) {
        video = document.createElement('video')
        video.id = `remote-${peerId}`
        video.autoplay = true
        video.playsInline = true
        video.className = 'remote-video'
        const container = document.getElementById('remote-videos')
        if (container) container.appendChild(video)
      }
      video.srcObject = remoteStream
    })
  }, [])

  // Handle incoming calls
  useEffect(() => {
    if (!peerRef.current) return

    peerRef.current.on('call', (call) => {
      call.answer(localStreamRef.current)
      call.on('stream', (remoteStream) => {
        const peerId = call.peer
        let video = document.getElementById(`remote-${peerId}`)
        if (!video) {
          video = document.createElement('video')
          video.id = `remote-${peerId}`
          video.autoplay = true
          video.playsInline = true
          video.className = 'remote-video'
          const container = document.getElementById('remote-videos')
          if (container) container.appendChild(video)
        }
        video.srcObject = remoteStream
      })
    })
  }, [peerRef.current])

  // Timer
  useEffect(() => {
    if (meetingJoined) {
      timerRef.current = setInterval(() => setMeetingTimer(p => p + 1), 1000)
      return () => clearInterval(timerRef.current)
    }
  }, [meetingJoined])

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      switch(e.key.toLowerCase()) {
        case 'm': toggleAudio(); break
        case 'v': toggleVideo(); break
        case 'h': toggleHand(); break
        case 'c': setActivePanel(p => p === 'chat' ? null : 'chat'); break
        case 'p': setActivePanel(p => p === 'participants' ? null : 'participants'); break
        default: break
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [audioEnabled, videoEnabled, handRaised])

  const broadcast = (data) => {
    Object.values(connectionsRef.current).forEach(conn => {
      if (conn.open) conn.send(data)
    })
  }

  const toggleAudio = () => {
    if (localStreamRef.current) {
      const track = localStreamRef.current.getAudioTracks()[0]
      if (track) {
        track.enabled = !track.enabled
        setAudioEnabled(track.enabled)
        broadcast({ type: 'media-change', audio: track.enabled })
      }
    }
  }

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const track = localStreamRef.current.getVideoTracks()[0]
      if (track) {
        track.enabled = !track.enabled
        setVideoEnabled(track.enabled)
        broadcast({ type: 'media-change', video: track.enabled })
      }
    }
  }

  const toggleScreenShare = async () => {
    if (!screenSharing) {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true })
        screenStreamRef.current = stream
        const screenTrack = stream.getVideoTracks()[0]
        screenTrack.onended = () => stopScreenShare()
        setScreenSharing(true)
        showNotif('Screen sharing started', 'success')
      } catch {
        showNotif('Failed to share screen', 'error')
      }
    } else {
      stopScreenShare()
    }
  }

  const stopScreenShare = () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop())
      screenStreamRef.current = null
    }
    setScreenSharing(false)
  }

  const toggleHand = () => {
    const newState = !handRaised
    setHandRaised(newState)
    broadcast({ type: 'hand-raise', raised: newState })
  }

  const sendReaction = (emoji) => {
    const id = Date.now() + Math.random()
    setReactions(prev => [...prev, { id, emoji, from: 'You' }])
    setTimeout(() => setReactions(prev => prev.filter(r => r.id !== id)), 3000)
    broadcast({ type: 'reaction', emoji, displayName })
    setShowReactionPicker(false)
  }

  const sendChat = () => {
    if (chatInput.trim()) {
      broadcast({ type: 'chat', message: chatInput.trim(), displayName })
      setChatMessages(prev => [...prev, {
        from: 'local', displayName, message: chatInput.trim(),
        timestamp: new Date().toISOString(), isLocal: true,
      }])
      setChatInput('')
    }
  }

  const leaveMeeting = () => {
    if (peerRef.current) peerRef.current.destroy()
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop())
    router.push('/')
  }

  // Waiting room / ended screens
  if (joinError) {
    return (
      <div className="waiting-room-screen">
        <Head><title>Error</title></Head>
        <div className="waiting-room-content">
          <div className="waiting-icon">❌</div>
          <h1>{joinError}</h1>
          <button className="btn-primary" onClick={() => router.push('/')}>Go Home</button>
        </div>
      </div>
    )
  }

  if (!meetingJoined) {
    return (
      <div className="waiting-room-screen">
        <Head><title>Joining...</title></Head>
        <div className="waiting-room-content">
          <div className="loading-spinner"></div>
          <h1>Joining Meeting...</h1>
        </div>
      </div>
    )
  }

  return (
    <div className="meeting-container">
      <Head>
        <title>Meeting - {meetingId}</title>
      </Head>

      {notification && (
        <div className={`notification notification-${notification.type}`}>{notification.msg}</div>
      )}

      <div className="floating-reactions">
        {reactions.map(r => (
          <div key={r.id} className="floating-reaction">{r.emoji}</div>
        ))}
      </div>

      <div className="meeting-header">
        <div className="header-left">
          <span className="logo-small">📹 MeetNow</span>
          <span className={`connection-indicator ${connected ? 'connected' : ''}`}>
            {connected ? '● Connected' : '● Connecting...'}
          </span>
        </div>
        <div className="header-center">
          <span className="meeting-timer">⏱️ {formatTime(meetingTimer)}</span>
          <span className="meeting-id-badge" onClick={copyMeetingLink}>
            📋 {meetingId} {copied ? '✓' : ''}
          </span>
        </div>
        <div className="header-right">
          <span className="participant-badge">👥 {participantCount}</span>
          {isHost && <span className="host-badge">⭐ Host</span>}
        </div>
      </div>

      <div className="video-area layout-grid">
        <div className="local-video-wrapper">
          <video ref={localVideoRef} autoPlay playsInline muted className="local-video" />
          <div className="video-label">
            {displayName} (You)
            {handRaised && ' ✋'}
            {!audioEnabled && ' 🔇'}
            {!videoEnabled && ' 📷'}
          </div>
        </div>
        <div className="remote-videos" id="remote-videos"></div>
      </div>

      <div className="meeting-controls">
        <div className="controls-left">
          <span className="meeting-id-small" onClick={copyMeetingLink}>📋 {meetingId}</span>
        </div>
        <div className="controls-center">
          <button className={`ctrl-btn ${!audioEnabled ? 'off' : ''}`} onClick={toggleAudio}>
            {audioEnabled ? '🎤' : '🔇'}
          </button>
          <button className={`ctrl-btn ${!videoEnabled ? 'off' : ''}`} onClick={toggleVideo}>
            {videoEnabled ? '📹' : '📷'}
          </button>
          <button className={`ctrl-btn ${screenSharing ? 'sharing' : ''}`} onClick={toggleScreenShare}>
            🖥️
          </button>
          <button className={`ctrl-btn ${handRaised ? 'raised' : ''}`} onClick={toggleHand}>✋</button>
          <button className="ctrl-btn" onClick={() => setShowReactionPicker(!showReactionPicker)}>👋</button>
          {showReactionPicker && (
            <div className="reaction-picker">
              {REACTIONS.map(emoji => (
                <button key={emoji} className="reaction-btn" onClick={() => sendReaction(emoji)}>{emoji}</button>
              ))}
            </div>
          )}
          <button className="ctrl-btn" onClick={() => setActivePanel(p => p === 'chat' ? null : 'chat')}>💬</button>
          <button className="ctrl-btn" onClick={() => setActivePanel(p => p === 'participants' ? null : 'participants')}>
            👥 {participantCount}
          </button>
        </div>
        <div className="controls-right">
          <button className="ctrl-btn leave-btn" onClick={leaveMeeting}>🚪</button>
        </div>
      </div>

      {activePanel === 'chat' && (
        <div className="side-panel">
          <div className="panel-header">
            <span>💬 Chat</span>
            <button className="panel-close" onClick={() => setActivePanel(null)}>✕</button>
          </div>
          <div className="panel-messages">
            {chatMessages.length === 0 && <div className="panel-empty">No messages yet</div>}
            {chatMessages.map((msg, idx) => (
              <div key={idx} className={`chat-msg ${msg.isLocal ? 'local' : 'remote'}`}>
                <span className="msg-sender">{msg.isLocal ? 'You' : msg.displayName}</span>
                <span className="msg-text">{msg.message}</span>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="panel-input">
            <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && sendChat()}
              placeholder="Type a message..." className="chat-input-field" />
            <button className="send-btn" onClick={sendChat}>➤</button>
          </div>
        </div>
      )}

      {activePanel === 'participants' && (
        <div className="side-panel">
          <div className="panel-header">
            <span>👥 Participants ({participantCount})</span>
            <button className="panel-close" onClick={() => setActivePanel(null)}>✕</button>
          </div>
          <div className="panel-messages">
            <div className="participant-item local-user">
              <span className="participant-avatar">👤</span>
              <span className="participant-name">{displayName} (You) {isHost ? '⭐' : ''}</span>
            </div>
            {participants.map(p => (
              <div key={p.id} className="participant-item">
                <span className="participant-avatar">👤</span>
                <span className="participant-name">{p.displayName}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}