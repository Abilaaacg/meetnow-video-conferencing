import Head from 'next/head'
import { useState } from 'react'
import { useRouter } from 'next/router'

export async function getServerSideProps() {
  return { props: {} }
}

export default function Home() {
  const [meetingId, setMeetingId] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [createPassword, setCreatePassword] = useState('')
  const [waitingRoom, setWaitingRoom] = useState(true)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [micEnabled, setMicEnabled] = useState(true)
  const [camEnabled, setCamEnabled] = useState(true)
  const router = useRouter()

  const SIGNALING_SERVER = process.env.NEXT_PUBLIC_SIGNALING_SERVER || process.env.VERCEL_URL ? '' : ''

  const createMeeting = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/create-meeting`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: createPassword, waitingRoom })
      })
      const data = await res.json()
      if (data.success) {
        localStorage.setItem('displayName', displayName || 'Host')
        router.push(`/meeting/${data.meetingId}`)
      } else {
        setError('Failed to create meeting. Please try again.')
      }
    } catch (err) {
      setError('Failed to connect to server. Please try again.')
      setLoading(false)
    }
  }

  const joinMeeting = async () => {
    if (!meetingId.trim()) {
      setError('Please enter a meeting ID')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/check-meeting/${meetingId.trim()}`)
      const data = await res.json()
      if (data.exists) {
        localStorage.setItem('displayName', displayName || 'Guest')
        router.push(`/meeting/${meetingId.trim()}`)
      } else {
        setError('Meeting not found. Please check the ID and try again.')
        setLoading(false)
      }
    } catch (err) {
      setError('Failed to connect to server. Please try again.')
      setLoading(false)
    }
  }

  const quickStart = () => {
    localStorage.setItem('displayName', displayName || 'Host')
    setShowCreateModal(true)
  }

  return (
    <div className="container">
      <Head>
        <title>MeetNow - Video Conferencing</title>
        <link rel="icon" href="/favicon.ico" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      {/* Error Toast */}
      {error && (
        <div className="error-toast" onClick={() => setError('')}>
          <div className="error-title">Error</div>
          <div className="error-message">{error}</div>
          <div className="error-close">&times;</div>
        </div>
      )}

      {/* Header */}
      <header className="home-header">
        <div className="logo">
          <span className="logo-icon">📹</span>
          <span className="logo-text">MeetNow</span>
        </div>
        <div className="header-actions">
          <button className="header-btn" onClick={() => setShowSettingsModal(true)}>
            ⚙️ Settings
          </button>
        </div>
      </header>

      <main className="home-main">
        <div className="hero-section">
          <h1 className="main-title">Video Meetings, <br/><span className="highlight">Made Simple</span></h1>
          <p className="subtitle">
            High-quality video calls with enterprise-grade features.<br/>
            Free, secure, and works right in your browser.
          </p>
        </div>

        {/* Pre-join Camera Preview */}
        <div className="preview-section">
          <div className="preview-card">
            <div className="preview-video">
              <div className="preview-placeholder">
                <span className="preview-avatar">👤</span>
                <span className="preview-label">Camera Preview</span>
              </div>
            </div>
            <div className="preview-controls">
              <button
                className={`preview-ctrl ${micEnabled ? 'active' : 'off'}`}
                onClick={() => setMicEnabled(!micEnabled)}
                title={micEnabled ? 'Mute Microphone' : 'Unmute Microphone'}
              >
                {micEnabled ? '🎤' : '🔇'}
              </button>
              <input
                type="text"
                className="name-input"
                placeholder="Enter your name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
              <button
                className={`preview-ctrl ${camEnabled ? 'active' : 'off'}`}
                onClick={() => setCamEnabled(!camEnabled)}
                title={camEnabled ? 'Turn Off Camera' : 'Turn On Camera'}
              >
                {camEnabled ? '📹' : '📷'}
              </button>
            </div>
          </div>
        </div>

        {/* Action Cards */}
        <div className="action-cards">
          {/* Create Meeting Card */}
          <div className="action-card create-card" onClick={() => setShowCreateModal(true)}>
            <div className="card-icon">➕</div>
            <h3>New Meeting</h3>
            <p>Create an instant meeting and invite others</p>
            <button className="card-btn create">Create Meeting</button>
          </div>

          {/* Join Meeting Card */}
          <div className="action-card join-card">
            <div className="card-icon">🔗</div>
            <h3>Join Meeting</h3>
            <p>Enter a meeting code to join an existing meeting</p>
            <div className="join-form">
              <input
                type="text"
                placeholder="Meeting Code"
                value={meetingId}
                onChange={(e) => setMeetingId(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && joinMeeting()}
                className="join-input"
              />
              <button
                className="card-btn join"
                onClick={joinMeeting}
                disabled={loading}
              >
                Join
              </button>
            </div>
          </div>

          {/* Schedule Card */}
          <div className="action-card schedule-card">
            <div className="card-icon">📅</div>
            <h3>Schedule</h3>
            <p>Plan ahead and schedule a meeting</p>
            <button className="card-btn schedule">Schedule Meeting</button>
          </div>
        </div>

        {/* Features Section */}
        <div className="features-section">
          <h2 className="features-title">Everything You Need</h2>
          <div className="features-grid">
            <div className="feature">
              <span className="feature-icon">🖥️</span>
              <h4>Screen Sharing</h4>
              <p>Share your screen with all participants</p>
            </div>
            <div className="feature">
              <span className="feature-icon">💬</span>
              <h4>In-Meeting Chat</h4>
              <p>Send messages during the meeting</p>
            </div>
            <div className="feature">
              <span className="feature-icon">✋</span>
              <h4>Raise Hand</h4>
              <p>Signal that you want to speak</p>
            </div>
            <div className="feature">
              <span className="feature-icon">🔒</span>
              <h4>Secure Meetings</h4>
              <p>Password protection and waiting room</p>
            </div>
            <div className="feature">
              <span className="feature-icon">👋</span>
              <h4>Reactions</h4>
              <p>Express yourself with emoji reactions</p>
            </div>
            <div className="feature">
              <span className="feature-icon">📐</span>
              <h4>Layout Options</h4>
              <p>Grid view, Speaker view, and more</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="home-footer">
          <p>&copy; 2024 MeetNow. Built with ❤️ | @copyrit-e-n-g-Ahmed-Nabil@</p>
        </footer>
      </main>

      {/* ===== CREATE MEETING MODAL ===== */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => { setShowCreateModal(false); setLoading(false); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create a New Meeting</h2>
              <button className="modal-close" onClick={() => { setShowCreateModal(false); setLoading(false); }}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Your Name</label>
                <input
                  type="text"
                  placeholder="Enter your display name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>Meeting Password (optional)</label>
                <input
                  type="password"
                  placeholder="Leave empty for no password"
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  className="form-input"
                />
              </div>
              <div className="form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={waitingRoom}
                    onChange={(e) => setWaitingRoom(e.target.checked)}
                  />
                  <span className="checkmark"></span>
                  <span>Enable Waiting Room</span>
                </label>
                <span className="form-hint">Participants will wait for host approval before joining</span>
              </div>
              <div className="modal-preview-controls">
                <button
                  className={`preview-ctrl ${micEnabled ? 'active' : 'off'}`}
                  onClick={() => setMicEnabled(!micEnabled)}
                >
                  {micEnabled ? '🎤' : '🔇'}
                </button>
                <button
                  className={`preview-ctrl ${camEnabled ? 'active' : 'off'}`}
                  onClick={() => setCamEnabled(!camEnabled)}
                >
                  {camEnabled ? '📹' : '📷'}
                </button>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn-primary"
                onClick={createMeeting}
                disabled={loading}
              >
                {loading ? 'Creating...' : 'Join Meeting'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== SETTINGS MODAL ===== */}
      {showSettingsModal && (
        <div className="modal-overlay" onClick={() => setShowSettingsModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Settings</h2>
              <button className="modal-close" onClick={() => setShowSettingsModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="settings-group">
                <h3>Audio</h3>
                <div className="form-group">
                  <label>Microphone</label>
                  <select className="form-select">
                    <option>Default Microphone</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Speaker</label>
                  <select className="form-select">
                    <option>Default Speaker</option>
                  </select>
                </div>
              </div>
              <div className="settings-group">
                <h3>Video</h3>
                <div className="form-group">
                  <label>Camera</label>
                  <select className="form-select">
                    <option>Default Camera</option>
                  </select>
                </div>
              </div>
              <div className="settings-group">
                <h3>General</h3>
                <div className="form-group">
                  <label>Display Name</label>
                  <input
                    type="text"
                    placeholder="Your name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowSettingsModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}