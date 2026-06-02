import Head from 'next/head'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/router'
import io from 'socket.io-client'

export async function getServerSideProps() {
  return { props: {} }
}

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ]
}

const REACTIONS = ['👍', '👏', '❤️', '😂', '😮', '🎉', '🔥', '💯']

export default function MeetingRoom() {
  const router = useRouter()
  const { id: meetingId } = router.query

  // Socket & connection
  const [socket, setSocket] = useState(null)
  const [connected, setConnected] = useState(false)
  const [meetingJoined, setMeetingJoined] = useState(false)
  const [joinError, setJoinError] = useState('')
  const [inWaitingRoom, setInWaitingRoom] = useState(false)
  const [meetingEnded, setMeetingEnded] = useState(false)

  // Media
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [videoEnabled, setVideoEnabled] = useState(true)
  const [screenSharing, setScreenSharing] = useState(false)
  const [backgroundBlur, setBackgroundBlur] = useState(false)

  // Participants & UI
  const [participants, setParticipants] = useState([])
  const [participantCount, setParticipantCount] = useState(0)
  const [isHost, setIsHost] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [waitingRoomUsers, setWaitingRoomUsers] = useState([])

  // Panels
  const [activePanel, setActivePanel] = useState(null) // 'chat', 'participants', 'info', 'settings'
  const [chatMessages, setChatMessages] = useState([])
  const [chatInput, setChatInput] = useState('')

  // Features
  const [layout, setLayout] = useState('grid') // 'grid', 'spotlight', 'sidebar'
  const [handRaised, setHandRaised] = useState(false)
  const [raisedHands, setRaisedHands] = useState([])
  const [reactions, setReactions] = useState([]) // floating reactions
  const [showReactionPicker, setShowReactionPicker] = useState(false)
  const [captionsEnabled, setCaptionsEnabled] = useState(false)
  const [captions, setCaptions] = useState([])
  const [recording, setRecording] = useState(false)
  const [meetingLocked, setMeetingLocked] = useState(false)
  const [meetingTimer, setMeetingTimer] = useState(0)
  const [copied, setCopied] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [notification, setNotification] = useState(null)
  const [spotlightUser, setSpotlightUser] = useState(null)

  // Refs
  const localVideoRef = useRef(null)
  const localStreamRef = useRef(null)
  const screenStreamRef = useRef(null)
  const peerConnectionsRef = useRef({})
  const remoteVideoContainerRef = useRef(null)
  const chatEndRef = useRef(null)
  const socketRef = useRef(null)
  const timerRef = useRef(null)

  // Show notification
  const showNotif = useCallback((msg, type = 'info') => {
    setNotification({ msg, type })
    setTimeout(() => setNotification(null), 3000)
  }, [])

  // Initialize local media stream
  const initLocalStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      localStreamRef.current = stream
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
      }
      return stream
    } catch (err) {
      console.error('Error accessing media devices:', err)
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        localStreamRef.current = stream
        setVideoEnabled(false)
        return stream
      } catch (audioErr) {
        return null
      }
    }
  }, [])

  // Create peer connection
  const createPeerConnection = useCallback((remoteUserId, localStream) => {
    const pc = new RTCPeerConnection(ICE_SERVERS)
    peerConnectionsRef.current[remoteUserId] = pc

    if (localStream) {
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream))
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('ice-candidate', { to: remoteUserId, candidate: event.candidate })
      }
    }

    pc.ontrack = (event) => {
      const remoteStream = event.streams[0]
      let remoteVideo = document.getElementById(`remote-${remoteUserId}`)
      if (!remoteVideo) {
        remoteVideo = document.createElement('video')
        remoteVideo.id = `remote-${remoteUserId}`
        remoteVideo.autoplay = true
        remoteVideo.playsInline = true
        remoteVideo.className = 'remote-video'
        remoteVideo.srcObject = remoteStream
        if (remoteVideoContainerRef.current) {
          remoteVideoContainerRef.current.appendChild(remoteVideo)
        }
      } else {
        remoteVideo.srcObject = remoteStream
      }
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        removePeerConnection(remoteUserId)
      }
    }

    return pc
  }, [])

  const removePeerConnection = useCallback((remoteUserId) => {
    const pc = peerConnectionsRef.current[remoteUserId]
    if (pc) {
      pc.close()
      delete peerConnectionsRef.current[remoteUserId]
    }
    const remoteVideo = document.getElementById(`remote-${remoteUserId}`)
    if (remoteVideo) remoteVideo.remove()
  }, [])

  // Handle offer
  const handleOffer = useCallback(async ({ from, offer }) => {
    const localStream = localStreamRef.current
    const pc = createPeerConnection(from, localStream)
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      socketRef.current.emit('answer', { to: from, answer: pc.localDescription })
    } catch (err) {
      console.error('Error handling offer:', err)
    }
  }, [createPeerConnection])

  const handleAnswer = useCallback(async ({ from, answer }) => {
    const pc = peerConnectionsRef.current[from]
    if (pc) {
      try { await pc.setRemoteDescription(new RTCSessionDescription(answer)) }
      catch (err) { console.error('Error handling answer:', err) }
    }
  }, [])

  const handleIceCandidate = useCallback(async ({ from, candidate }) => {
    const pc = peerConnectionsRef.current[from]
    if (pc) {
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)) }
      catch (err) { console.error('Error adding ICE candidate:', err) }
    }
  }, [])

  // Initialize socket
  useEffect(() => {
    if (!meetingId) return
    const name = localStorage.getItem('displayName') || 'Guest'
    setDisplayName(name)

    let newSocket

    const init = async () => {
      const localStream = await initLocalStream()

      const SIGNALING_SERVER = process.env.NEXT_PUBLIC_SIGNALING_SERVER || ''
      const serverUrl = SIGNALING_SERVER || (typeof window !== 'undefined' ? window.location.origin : '')
      newSocket = io(serverUrl, { transports: ['websocket', 'polling'] })
      socketRef.current = newSocket

      newSocket.on('connect', () => {
        setConnected(true)
        newSocket.emit('join-meeting', { meetingId, displayName: name })
      })

      newSocket.on('disconnect', () => setConnected(false))

      newSocket.on('join-error', ({ message }) => {
        setJoinError(message)
      })

      newSocket.on('waiting-room', () => {
        setInWaitingRoom(true)
        showNotif('You are in the waiting room. Please wait for the host to admit you.', 'info')
      })

      newSocket.on('admitted', () => {
        setInWaitingRoom(false)
        showNotif('You have been admitted to the meeting!', 'success')
        newSocket.emit('join-meeting', { meetingId, displayName: name })
      })

      newSocket.on('denied', ({ message }) => {
        showNotif(message, 'error')
        setTimeout(() => router.push('/'), 2000)
      })

      newSocket.on('meeting-joined', (data) => {
        setMeetingJoined(true)
        setIsHost(data.isHost)
        setParticipantCount(data.participantCount)
        setMeetingLocked(data.locked)
        if (data.participants) {
          setParticipants(data.participants)
          // Create offers to existing participants
          data.participants.forEach(async (p) => {
            const pc = createPeerConnection(p.socketId, localStream)
            try {
              const offer = await pc.createOffer()
              await pc.setLocalDescription(offer)
              newSocket.emit('offer', { to: p.socketId, offer: pc.localDescription })
            } catch (err) { console.error('Error creating offer:', err) }
          })
        }
      })

      newSocket.on('waiting-room-user', ({ socketId, displayName: dn }) => {
        setWaitingRoomUsers(prev => [...prev, { socketId, displayName: dn }])
        showNotif(`${dn} wants to join the meeting`, 'info')
      })

      newSocket.on('user-joined', ({ userId, displayName: dn, participantCount: count }) => {
        setParticipantCount(count)
        setParticipants(prev => [...prev, { socketId: userId, displayName: dn }])
        showNotif(`${dn} joined the meeting`, 'info')
      })

      newSocket.on('user-left', ({ userId, displayName: dn, participantCount: count, handRaised: hr }) => {
        setParticipantCount(count)
        setParticipants(prev => prev.filter(p => p.socketId !== userId))
        removePeerConnection(userId)
        if (dn) showNotif(`${dn} left the meeting`, 'info')
        if (hr) setRaisedHands(prev => prev.filter(h => h.userId !== userId))
      })

      newSocket.on('offer', handleOffer)
      newSocket.on('answer', handleAnswer)
      newSocket.on('ice-candidate', handleIceCandidate)

      // Chat
      newSocket.on('chat-message', (data) => {
        setChatMessages(prev => [...prev, data])
      })

      // Reactions
      newSocket.on('reaction', ({ from, displayName: dn, emoji }) => {
        const id = Date.now() + Math.random()
        setReactions(prev => [...prev, { id, emoji, from: dn }])
        setTimeout(() => setReactions(prev => prev.filter(r => r.id !== id)), 3000)
        showNotif(`${dn} reacted ${emoji}`, 'reaction')
      })

      // Raise hand
      newSocket.on('hand-raised', ({ userId, displayName: dn, raised }) => {
        if (raised) {
          setRaisedHands(prev => [...prev, { userId, displayName: dn }])
          showNotif(`${dn} raised their hand`, 'info')
        } else {
          setRaisedHands(prev => prev.filter(h => h.userId !== userId))
        }
      })

      // Media changes
      newSocket.on('media-change', ({ userId, audio, video }) => {
        setParticipants(prev => prev.map(p =>
          p.socketId === userId ? { ...p, audioMuted: audio === false, videoOff: video === false } : p
        ))
      })

      // Screen share
      newSocket.on('screen-share', ({ userId, displayName: dn, sharing }) => {
        if (sharing) {
          showNotif(`${dn} is sharing their screen`, 'info')
          setSpotlightUser(userId)
        } else {
          setSpotlightUser(null)
        }
      })

      // Waiting room changes
      newSocket.on('waiting-room-changed', ({ enabled }) => {
        setParticipants(prev => prev.map(p => p))
        showNotif(`Waiting room ${enabled ? 'enabled' : 'disabled'}`, 'info')
      })

      newSocket.on('meeting-locked', ({ locked }) => {
        setMeetingLocked(locked)
        showNotif(`Meeting ${locked ? 'locked' : 'unlocked'}`, 'info')
      })

      newSocket.on('mute-all', () => {
        if (localStreamRef.current) {
          localStreamRef.current.getAudioTracks().forEach(t => t.enabled = false)
          setAudioEnabled(false)
          showNotif('Host muted everyone', 'info')
        }
      })

      newSocket.on('host-transferred', ({ displayName: dn }) => {
        setIsHost(true)
        showNotif(`You are now the host`, 'info')
      })

      newSocket.on('removed', ({ message }) => {
        showNotif(message, 'error')
        setTimeout(() => router.push('/'), 2000)
      })

      newSocket.on('meeting-ended', () => {
        setMeetingEnded(true)
        showNotif('The meeting has been ended by the host', 'info')
        setTimeout(() => router.push('/'), 3000)
      })

      newSocket.on('layout-change', ({ layout: l }) => {
        setLayout(l)
      })

      newSocket.on('remove-participant', ({ userId }) => {
        removePeerConnection(userId)
      })

      setSocket(newSocket)
    }

    init()

    return () => {
      if (newSocket) newSocket.disconnect()
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop())
      if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach(t => t.stop())
      Object.keys(peerConnectionsRef.current).forEach(id => peerConnectionsRef.current[id].close())
      peerConnectionsRef.current = {}
    }
  }, [meetingId]) // eslint-disable-line

  // Meeting timer
  useEffect(() => {
    if (meetingJoined) {
      timerRef.current = setInterval(() => setMeetingTimer(prev => prev + 1), 1000)
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
        case 'c': setActivePanel(prev => prev === 'chat' ? null : 'chat'); break
        case 'p': setActivePanel(prev => prev === 'participants' ? null : 'participants'); break
        case 'l': cycleLayout(); break
        case '?': setShowShortcuts(prev => !prev); break
        default: break
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [audioEnabled, videoEnabled, handRaised, activePanel, layout])

  // Format timer
  const formatTime = (s) => {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
    return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
  }

  // Toggle audio
  const toggleAudio = () => {
    if (localStreamRef.current) {
      const track = localStreamRef.current.getAudioTracks()[0]
      if (track) {
        track.enabled = !track.enabled
        setAudioEnabled(track.enabled)
        socket?.emit('media-change', { audio: track.enabled })
      }
    }
  }

  // Toggle video
  const toggleVideo = () => {
    if (localStreamRef.current) {
      const track = localStreamRef.current.getVideoTracks()[0]
      if (track) {
        track.enabled = !track.enabled
        setVideoEnabled(track.enabled)
        socket?.emit('media-change', { video: track.enabled })
      }
    }
  }

  // Screen sharing
  const toggleScreenShare = async () => {
    if (!screenSharing) {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
        screenStreamRef.current = stream
        const screenTrack = stream.getVideoTracks()[0]

        // Replace video track in all peer connections
        Object.values(peerConnectionsRef.current).forEach(pc => {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video')
          if (sender) sender.replaceTrack(screenTrack)
        })

        // Update local video
        if (localVideoRef.current) localVideoRef.current.srcObject = stream

        screenTrack.onended = () => stopScreenShare()

        setScreenSharing(true)
        socket?.emit('screen-share', { sharing: true })
        showNotif('You are sharing your screen', 'success')
      } catch (err) {
        console.error('Screen share error:', err)
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
    // Restore camera track
    if (localStreamRef.current) {
      const camTrack = localStreamRef.current.getVideoTracks()[0]
      Object.values(peerConnectionsRef.current).forEach(pc => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video')
        if (sender && camTrack) sender.replaceTrack(camTrack)
      })
      if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current
    }
    setScreenSharing(false)
    socket?.emit('screen-share', { sharing: false })
  }

  // Toggle hand
  const toggleHand = () => {
    setHandRaised(prev => !prev)
    socket?.emit('toggle-hand')
  }

  // Cycle layout
  const cycleLayout = () => {
    const layouts = ['grid', 'spotlight', 'sidebar']
    const next = layouts[(layouts.indexOf(layout) + 1) % layouts.length]
    setLayout(next)
    socket?.emit('layout-change', { layout: next })
    showNotif(`Layout: ${next.charAt(0).toUpperCase() + next.slice(1)}`, 'info')
  }

  // Send reaction
  const sendReaction = (emoji) => {
    const id = Date.now() + Math.random()
    setReactions(prev => [...prev, { id, emoji, from: 'You' }])
    setTimeout(() => setReactions(prev => prev.filter(r => r.id !== id)), 3000)
    socket?.emit('reaction', { emoji })
    setShowReactionPicker(false)
  }

  // Send chat
  const sendChat = () => {
    if (chatInput.trim() && socket) {
      socket.emit('chat-message', { message: chatInput.trim() })
      setChatMessages(prev => [...prev, {
        from: socket.id, displayName, message: chatInput.trim(),
        timestamp: new Date().toISOString(), isLocal: true
      }])
      setChatInput('')
    }
  }

  // Copy meeting link
  const copyMeetingLink = () => {
    navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Host actions
  const admitUser = (userId) => {
    socket?.emit('admit-user', { userId })
    setWaitingRoomUsers(prev => prev.filter(u => u.socketId !== userId))
  }

  const denyUser = (userId) => {
    socket?.emit('deny-user', { userId })
    setWaitingRoomUsers(prev => prev.filter(u => u.socketId !== userId))
  }

  const toggleWaitingRoom = () => {
    socket?.emit('toggle-waiting-room', { enabled: !meetingLocked })
  }

  const toggleLockMeeting = () => {
    socket?.emit('lock-meeting', { locked: !meetingLocked })
    setMeetingLocked(prev => !prev)
  }

  const muteAll = () => {
    socket?.emit('mute-all')
    toggleAudio()
    showNotif('You muted all participants', 'info')
  }

  const removeParticipant = (userId) => {
    socket?.emit('remove-participant', { userId })
  }

  const endMeeting = () => {
    socket?.emit('end-meeting')
    setMeetingEnded(true)
    setTimeout(() => router.push('/'), 2000)
  }

  // Leave meeting
  const leaveMeeting = () => {
    if (socket) socket.disconnect()
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop())
    router.push('/')
  }

  // Toggle background blur
  const toggleBackgroundBlur = () => {
    if (localVideoRef.current) {
      localVideoRef.current.style.filter = backgroundBlur ? 'none' : 'blur(10px)'
      setBackgroundBlur(!backgroundBlur)
    }
  }

  // Waiting room screen
  if (inWaitingRoom) {
    return (
      <div className="waiting-room-screen">
        <Head><title>Waiting Room - {meetingId}</title></Head>
        <div className="waiting-room-content">
          <div className="waiting-icon">⏳</div>
          <h1>Waiting Room</h1>
          <p>Please wait for the host to admit you to the meeting.</p>
          <div className="waiting-info">
            <p>Meeting: <strong>{meetingId}</strong></p>
            <p>Name: <strong>{displayName}</strong></p>
          </div>
        </div>
      </div>
    )
  }

  // Meeting ended screen
  if (meetingEnded) {
    return (
      <div className="waiting-room-screen">
        <Head><title>Meeting Ended</title></Head>
        <div className="waiting-room-content">
          <div className="waiting-icon">👋</div>
          <h1>Meeting Ended</h1>
          <p>This meeting has been ended. Redirecting to home...</p>
        </div>
      </div>
    )
  }

  // Join error screen
  if (joinError) {
    return (
      <div className="waiting-room-screen">
        <Head><title>Error - Join Meeting</title></Head>
        <div className="waiting-room-content">
          <div className="waiting-icon">❌</div>
          <h1>Unable to Join</h1>
          <p>{joinError}</p>
          <button className="btn-primary" onClick={() => router.push('/')}>Go Home</button>
        </div>
      </div>
    )
  }

  if (!meetingJoined) {
    return (
      <div className="waiting-room-screen">
        <Head><title>Joining Meeting...</title></Head>
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
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      {/* Floating Reactions */}
      <div className="floating-reactions">
        {reactions.map(r => (
          <div key={r.id} className="floating-reaction">{r.emoji}</div>
        ))}
      </div>

      {/* Notification */}
      {notification && (
        <div className={`notification notification-${notification.type}`}>
          {notification.msg}
        </div>
      )}

      {/* Meeting Header */}
      <div className="meeting-header">
        <div className="header-left">
          <span className="logo-small">📹 MeetNow</span>
          <span className={`connection-indicator ${connected ? 'connected' : ''}`}>
            {connected ? '● Connected' : '● Connecting...'}
          </span>
        </div>
        <div className="header-center">
          <span className="meeting-timer">⏱️ {formatTime(meetingTimer)}</span>
          <span className="meeting-id-badge" onClick={copyMeetingLink} title="Click to copy link">
            📋 {meetingId} {copied ? '✓' : ''}
          </span>
          {recording && <span className="recording-badge">🔴 Recording</span>}
        </div>
        <div className="header-right">
          <span className="participant-badge">👥 {participantCount}</span>
          {isHost && <span className="host-badge">⭐ Host</span>}
          {meetingLocked && <span className="locked-badge">🔒</span>}
        </div>
      </div>

      {/* Notification Toast */}
      {raisedHands.length > 0 && (
        <div className="hands-raised-bar">
          {raisedHands.map(h => (
            <span key={h.userId} className="hand-badge">✋ {h.displayName}</span>
          ))}
        </div>
      )}

      {/* Video Area */}
      <div className={`video-area layout-${layout}`}>
        <div className="local-video-wrapper">
          <video ref={localVideoRef} autoPlay playsInline muted className={`local-video ${backgroundBlur ? 'blur-bg' : ''}`} />
          <div className="video-label">
            {displayName} (You)
            {handRaised && ' ✋'}
            {!audioEnabled && ' 🔇'}
            {!videoEnabled && ' 📷'}
          </div>
        </div>
        <div className="remote-videos" ref={remoteVideoContainerRef}></div>
      </div>

      {/* Caption Display */}
      {captionsEnabled && captions.length > 0 && (
        <div className="caption-bar">
          <span>{captions[captions.length - 1]?.text}</span>
        </div>
      )}

      {/* Meeting Controls */}
      <div className="meeting-controls">
        <div className="controls-left">
          <span className="meeting-id-small" onClick={copyMeetingLink}>
            📋 {meetingId}
          </span>
        </div>

        <div className="controls-center">
          <button className={`ctrl-btn ${!audioEnabled ? 'off' : ''}`} onClick={toggleAudio}
            title="Toggle Mic (M)">
            {audioEnabled ? '🎤' : '🔇'}
          </button>
          <button className={`ctrl-btn ${!videoEnabled ? 'off' : ''}`} onClick={toggleVideo}
            title="Toggle Camera (V)">
            {videoEnabled ? '📹' : '📷'}
          </button>
          <button className={`ctrl-btn ${screenSharing ? 'sharing' : ''}`} onClick={toggleScreenShare}
            title="Share Screen">
            🖥️
          </button>
          <button className={`ctrl-btn ${handRaised ? 'raised' : ''}`} onClick={toggleHand}
            title="Raise Hand (H)">
            ✋
          </button>
          <button className="ctrl-btn" onClick={() => setShowReactionPicker(!showReactionPicker)}
            title="Reactions">
            👋
          </button>
          <button className={`ctrl-btn ${backgroundBlur ? 'active' : ''}`} onClick={toggleBackgroundBlur}
            title="Background Blur">
            🌫️
          </button>

          {/* Reaction Picker */}
          {showReactionPicker && (
            <div className="reaction-picker">
              {REACTIONS.map(emoji => (
                <button key={emoji} className="reaction-btn" onClick={() => sendReaction(emoji)}>
                  {emoji}
                </button>
              ))}
            </div>
          )}

          <button className="ctrl-btn" onClick={() => setActivePanel(activePanel === 'chat' ? null : 'chat')}
            title="Chat (C)">💬</button>
          <button className="ctrl-btn" onClick={() => setActivePanel(activePanel === 'participants' ? null : 'participants')}
            title="Participants (P)">
            👥 {participantCount}
          </button>
          <button className="ctrl-btn" onClick={() => setActivePanel(activePanel === 'info' ? null : 'info')}
            title="Meeting Info">
            ℹ️
          </button>
          <button className="ctrl-btn" onClick={cycleLayout}
            title="Toggle Layout (L)">
            📐
          </button>
        </div>

        <div className="controls-right">
          {isHost && (
            <>
              <button className="ctrl-btn host-ctrl" onClick={muteAll} title="Mute All">
                🔇
              </button>
              <button className="ctrl-btn host-ctrl" onClick={toggleLockMeeting}
                title={meetingLocked ? 'Unlock Meeting' : 'Lock Meeting'}>
                {meetingLocked ? '🔓' : '🔒'}
              </button>
              <button className="ctrl-btn end-btn" onClick={endMeeting} title="End Meeting">
                📞
              </button>
            </>
          )}
          <button className="ctrl-btn leave-btn" onClick={leaveMeeting} title="Leave Meeting">
            🚪
          </button>
        </div>
      </div>

      {/* ===== Side Panels ===== */}

      {/* Chat Panel */}
      {activePanel === 'chat' && (
        <div className="side-panel">
          <div className="panel-header">
            <span>💬 Chat</span>
            <button className="panel-close" onClick={() => setActivePanel(null)}>✕</button>
          </div>
          <div className="panel-messages">
            {chatMessages.length === 0 && <div className="panel-empty">No messages yet. Start chatting!</div>}
            {chatMessages.map((msg, idx) => (
              <div key={idx} className={`chat-msg ${msg.isLocal ? 'local' : 'remote'}`}>
                <span className="msg-sender">{msg.isLocal ? 'You' : msg.displayName}</span>
                <span className="msg-text">{msg.message}</span>
                <span className="msg-time">{new Date(msg.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="panel-input">
            <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendChat()}
              placeholder="Type a message..." className="chat-input-field" />
            <button className="send-btn" onClick={sendChat}>➤</button>
          </div>
        </div>
      )}

      {/* Participants Panel */}
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
              <span className="participant-status">
                {!audioEnabled && '🔇'} {!videoEnabled && '📷'} {handRaised && '✋'}
              </span>
            </div>
            {participants.map(p => (
              <div key={p.socketId} className="participant-item">
                <span className="participant-avatar">👤</span>
                <span className="participant-name">{p.displayName} {p.socketId === spotlightUser ? '🖥️' : ''}</span>
                <span className="participant-status">
                  {p.audioMuted && '🔇'} {p.videoOff && '📷'}
                  {raisedHands.find(h => h.userId === p.socketId) && '✋'}
                </span>
                {isHost && (
                  <div className="participant-actions">
                    <button className="mini-btn" onClick={() => removeParticipant(p.socketId)} title="Remove">
                      ✕
                    </button>
                  </div>
                )}
              </div>
            ))}
            {/* Waiting Room Users */}
            {waitingRoomUsers.length > 0 && (
              <>
                <div className="waiting-room-section">
                  <h4>🕐 Waiting Room ({waitingRoomUsers.length})</h4>
                </div>
                {waitingRoomUsers.map(u => (
                  <div key={u.socketId} className="participant-item waiting">
                    <span className="participant-avatar">🕐</span>
                    <span className="participant-name">{u.displayName}</span>
                    <div className="participant-actions">
                      <button className="mini-btn admit" onClick={() => admitUser(u.socketId)}>✓</button>
                      <button className="mini-btn deny" onClick={() => denyUser(u.socketId)}>✕</button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {/* Info Panel */}
      {activePanel === 'info' && (
        <div className="side-panel">
          <div className="panel-header">
            <span>ℹ️ Meeting Info</span>
            <button className="panel-close" onClick={() => setActivePanel(null)}>✕</button>
          </div>
          <div className="panel-messages info-content">
            <div className="info-item">
              <label>Meeting ID</label>
              <div className="info-value">{meetingId}</div>
            </div>
            <div className="info-item">
              <label>Meeting Link</label>
              <div className="info-value link" onClick={copyMeetingLink}>
                {typeof window !== 'undefined' ? window.location.href : ''} {copied ? '✓' : '📋'}
              </div>
            </div>
            <div className="info-item">
              <label>Participants</label>
              <div className="info-value">{participantCount}</div>
            </div>
            <div className="info-item">
              <label>Duration</label>
              <div className="info-value">{formatTime(meetingTimer)}</div>
            </div>
            {isHost && (
              <>
                <div className="info-item">
                  <label>Waiting Room</label>
                  <div className="info-value">
                    <button className={`toggle-btn ${meetingLocked ? 'active' : ''}`} onClick={toggleLockMeeting}>
                      {meetingLocked ? '🔒 Locked' : '🔓 Unlocked'}
                    </button>
                  </div>
                </div>
                <div className="info-item">
                  <label>Captions</label>
                  <div className="info-value">
                    <button className={`toggle-btn ${captionsEnabled ? 'active' : ''}`}
                      onClick={() => setCaptionsEnabled(!captionsEnabled)}>
                      {captionsEnabled ? 'CC On' : 'CC Off'}
                    </button>
                  </div>
                </div>
                <div className="info-item">
                  <label>Recording</label>
                  <div className="info-value">
                    <button className={`toggle-btn ${recording ? 'active' : ''}`}
                      onClick={() => { setRecording(!recording); showNotif(recording ? 'Recording stopped' : 'Recording started', 'info') }}>
                      {recording ? '🔴 Stop' : '⏺️ Start'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Keyboard Shortcuts Modal */}
      {showShortcuts && (
        <div className="modal-overlay" onClick={() => setShowShortcuts(false)}>
          <div className="modal shortcuts-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>⌨️ Keyboard Shortcuts</h2>
              <button className="modal-close" onClick={() => setShowShortcuts(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="shortcut-row"><kbd>M</kbd><span>Toggle Microphone</span></div>
              <div className="shortcut-row"><kbd>V</kbd><span>Toggle Camera</span></div>
              <div className="shortcut-row"><kbd>H</kbd><span>Raise/Lower Hand</span></div>
              <div className="shortcut-row"><kbd>C</kbd><span>Toggle Chat Panel</span></div>
              <div className="shortcut-row"><kbd>P</kbd><span>Toggle Participants Panel</span></div>
              <div className="shortcut-row"><kbd>L</kbd><span>Change Layout</span></div>
              <div className="shortcut-row"><kbd>?</kbd><span>Show/Hide Shortcuts</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}