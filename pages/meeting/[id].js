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
  const myPeerIdRef = useRef(null)
  const chatEndRef = useRef(null)
  const timerRef = useRef(null)
  const isHostRef = useRef(false)

  const showNotif = useCallback((msg, type = 'info') => {
    setNotification({ msg, type })
    setTimeout(() => setNotification(null), 3000)
  }, [])

  const formatTime = (s) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }

  const copyMeetingLink = () => {
    navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const broadcast = useCallback((data) => {
    Object.values(connectionsRef.current).forEach(conn => {
      if (conn.open) conn.send(data)
    })
  }, [])

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

  const setupDataHandlers = useCallback((conn, remotePeerId) => {
    conn.on('data', (data) => {
      switch (data.type) {
        case 'chat':
          setChatMessages(prev => [...prev, {
            from: remotePeerId, displayName: data.displayName,
            message: data.message, timestamp: new Date().toISOString(), isLocal: false,
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
        case 'welcome': {
          const myId = myPeerIdRef.current
          data.peers.forEach(peerId => {
            if (peerId !== myId && !connectionsRef.current[peerId]) {
              const newConn = peerRef.current.connect(peerId, {
                metadata: { displayName: localStorage.getItem('displayName') || 'Guest' },
                reliable: true,
              })
              newConn.on('open', () => {
                connectionsRef.current[peerId] = newConn
                setupDataHandlers(newConn, peerId)
                callPeer(peerId)
              })
            }
          })
          break
        }
        case 'new-peer': {
          const myId = myPeerIdRef.current
          if (data.peerId !== myId && !connectionsRef.current[data.peerId]) {
            const newConn = peerRef.current.connect(data.peerId, {
              metadata: { displayName: localStorage.getItem('displayName') || 'Guest' },
              reliable: true,
            })
            newConn.on('open', () => {
              connectionsRef.current[data.peerId] = newConn
              setupDataHandlers(newConn, data.peerId)
              callPeer(data.peerId)
            })
          }
          break
        }
      }
    })
  }, [callPeer])

  // Setup host listeners
  const setupHostListeners = useCallback((peer) => {
    peer.on('connection', (newConn) => {
      newConn.on('open', () => {
        const peerName = newConn.metadata?.displayName || 'Guest'
        const remotePeerId = newConn.peer

        connectionsRef.current[remotePeerId] = newConn
        setParticipants(prev => {
          if (prev.find(p => p.id === remotePeerId)) return prev
          return [...prev, { id: remotePeerId, displayName: peerName }]
        })
        setParticipantCount(prev => prev + 1)
        showNotif(`${peerName} joined`, 'info')

        // Send welcome with existing peers
        const existingPeers = Object.keys(connectionsRef.current)
        newConn.send({ type: 'welcome', peers: existingPeers })

        // Notify existing peers
        Object.entries(connectionsRef.current).forEach(([id, c]) => {
          if (id !== remotePeerId && c.open) {
            c.send({ type: 'new-peer', peerId: remotePeerId, displayName: peerName })
          }
        })

        callPeer(remotePeerId)
        setupDataHandlers(newConn, remotePeerId)
      })
    })

    peer.on('call', (call) => {
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
  }, [callPeer, setupDataHandlers, showNotif])

  // Initialize
  useEffect(() => {
    if (!meetingId) return

    const name = localStorage.getItem('displayName') || 'Guest'
    setDisplayName(name)

    const init = async () => {
      let stream
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true })
          setVideoEnabled(false)
        } catch {
          showNotif('Could not access camera/mic', 'error')
          return
        }
      }
      localStreamRef.current = stream
      if (localVideoRef.current) localVideoRef.current.srcObject = stream

      const hostPeerId = `host-${meetingId}`

      // Try to become host FIRST (fast path)
      const tryHost = () => {
        return new Promise((resolve) => {
          const peer = new Peer(hostPeerId, {
            host: '0.peerjs.com', port: 443, path: '/', debug: 0,
          })

          peer.on('open', () => {
            // We ARE the host!
            resolve({ success: true, peer })
          })

          peer.on('error', (err) => {
            if (err.type === 'unavailable-id') {
              // ID taken - someone else is host
              peer.destroy()
              resolve({ success: false, peer: null })
            } else {
              console.error('Host peer error:', err)
            }
          })
        })
      }

      const result = await tryHost()

      if (result.success) {
        // WE ARE THE HOST
        peerRef.current = result.peer
        myPeerIdRef.current = hostPeerId
        isHostRef.current = true
        setConnected(true)
        setIsHost(true)
        setMeetingJoined(true)
        setParticipantCount(1)
        setupHostListeners(result.peer)
        showNotif('You are the host!', 'success')
      } else {
        // WE ARE A GUEST - create random ID and connect to host
        const guestId = `guest-${meetingId}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`
        myPeerIdRef.current = guestId

        const peer = new Peer(guestId, {
          host: '0.peerjs.com', port: 443, path: '/', debug: 0,
        })
        peerRef.current = peer

        peer.on('open', () => {
          setConnected(true)
          const conn = peer.connect(hostPeerId, {
            metadata: { displayName: name },
            reliable: true,
          })

          conn.on('open', () => {
            setIsHost(false)
            setMeetingJoined(true)
            connectionsRef.current[hostPeerId] = conn
            setupDataHandlers(conn, hostPeerId)
            showNotif('Connected to meeting!', 'success')
          })

          conn.on('error', (err) => {
            console.error('Connection error:', err)
            showNotif('Failed to connect to host', 'error')
          })
        })

        // Handle incoming calls as guest
        peer.on('call', (call) => {
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

        peer.on('error', (err) => {
          console.error('Guest peer error:', err)
        })
      }
    }

    init()

    return () => {
      if (peerRef.current) peerRef.current.destroy()
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop())
    }
  }, [meetingId])

  // Timer
  useEffect(() => {
    if (meetingJoined) {
      timerRef.current = setInterval(() => setMeetingTimer(p => p + 1), 1000)
      return () => clearInterval(timerRef.current)
    }
  }, [meetingJoined])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  useEffect(() => {
    const handleKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      switch (e.key.toLowerCase()) {
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
        stream.getVideoTracks()[0].onended = () => {
          screenStreamRef.current = null
          setScreenSharing(false)
        }
        setScreenSharing(true)
        showNotif('Screen sharing started', 'success')
      } catch {
        showNotif('Failed to share screen', 'error')
      }
    } else {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop())
        screenStreamRef.current = null
      }
      setScreenSharing(false)
    }
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
          <p style={{ color: '#aaa', marginTop: '10px' }}>Connecting to {meetingId}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="meeting-container">
      <Head><title>Meeting - {meetingId}</title></Head>

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
            {displayName} (You) {handRaised && ' ✋'}
            {!audioEnabled && ' 🔇'} {!videoEnabled && ' 📷'}
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
          <button className={`ctrl-btn ${screenSharing ? 'sharing' : ''}`} onClick={toggleScreenShare}>🖥️</button>
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