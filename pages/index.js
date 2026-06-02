import Head from 'next/head'
import { useState } from 'react'
import { useRouter } from 'next/router'
import { v4 as uuidv4 } from 'uuid'

export async function getServerSideProps() {
  return { props: {} }
}

export default function Home() {
  const [meetingId, setMeetingId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [error, setError] = useState('')
  const [micEnabled, setMicEnabled] = useState(true)
  const [camEnabled, setCamEnabled] = useState(true)
  const router = useRouter()

  const createMeeting = () => {
    const id = uuidv4().slice(0, 8)
    localStorage.setItem('displayName', displayName || 'Host')
    router.push(`/meeting/${id}`)
  }

  const joinMeeting = () => {
    if (!meetingId.trim()) {
      setError('Please enter a meeting ID')
      return
    }
    localStorage.setItem('displayName', displayName || 'Guest')
    router.push(`/meeting/${meetingId.trim()}`)
  }

  return (
    <div className="container">
      <Head>
        <title>MeetNow - Video Conferencing</title>
        <link rel="icon" href="/favicon.ico" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      {error && (
        <div className="error-toast" onClick={() => setError('')}>
          <div className="error-title">Error</div>
          <div className="error-message">{error}</div>
          <div className="error-close">&times;</div>
        </div>
      )}

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
              >
                {camEnabled ? '📹' : '📷'}
              </button>
            </div>
          </div>
        </div>

        <div className="action-cards">
          <div className="action-card create-card" onClick={createMeeting}>
            <div className="card-icon">➕</div>
            <h3>New Meeting</h3>
            <p>Create an instant meeting and invite others</p>
            <button className="card-btn create">Create Meeting</button>
          </div>

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
              <button className="card-btn join" onClick={joinMeeting}>Join</button>
            </div>
          </div>

          <div className="action-card schedule-card">
            <div className="card-icon">📅</div>
            <h3>Schedule</h3>
            <p>Plan ahead and schedule a meeting</p>
            <button className="card-btn schedule" onClick={createMeeting}>Schedule Meeting</button>
          </div>
        </div>

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

        <footer className="home-footer">
          <p>&copy; 2024 MeetNow. Built with ❤️</p>
        </footer>
      </main>

      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create a New Meeting</h2>
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>&times;</button>
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
              <button className="btn-primary" onClick={createMeeting}>Join Meeting</button>
            </div>
          </div>
        </div>
      )}

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