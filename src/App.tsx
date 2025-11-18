import { useCallback, useEffect, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import { GameController } from '@/game/core/GameController'
import type { GameSnapshot, GameStatus, TowerType } from '@/game/core/types'
import { GameControls } from '@/ui/components/GameControls'
import { GameHUD } from '@/ui/components/GameHUD'
import { DebugPanel } from '@/ui/components/DebugPanel'
import { TowerPicker } from '@/ui/components/TowerPicker'
import { audioManager } from '@/game/audio/AudioManager'
import type { AudioConfig } from '@/game/audio/AudioManager'
import { ErrorBoundary } from '@/ui/components/ErrorBoundary'

const initialTower: TowerType = 'indica'

type AppPhase = 'loading' | 'idle' | 'playing' | 'gameover' | 'resetting'

function App() {
  const controllerRef = useRef<GameController | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const startOverlayRef = useRef<HTMLDivElement | null>(null)
  const gameOverOverlayRef = useRef<HTMLDivElement | null>(null)
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null)
  const [selectedTower, setSelectedTower] = useState<TowerType>(initialTower)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [showHowToPlay, setShowHowToPlay] = useState(false)
  const [quickWaveIndex, setQuickWaveIndex] = useState(0)
  const [audioConfig, setAudioConfig] = useState<AudioConfig>({
    masterVolume: 1.0,
    sfxVolume: 0.8,
    musicVolume: 0.6,
    muted: false
  })
  const [isAudioReady, setIsAudioReady] = useState(false)
  const [audioContextUnlocked, setAudioContextUnlocked] = useState(false)
  const snapshotStatus = snapshot?.status
  const [appPhase, setAppPhase] = useState<AppPhase>('loading')
  const [resetPending, setResetPending] = useState(false)
  const [liveAnnouncement, setLiveAnnouncement] = useState<string | null>(null)
  const prevStatusRef = useRef<GameStatus | null>(null)
  const announcementTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const initializeAudio = async () => {
      await audioManager.initialize()
      setAudioConfig(audioManager.getConfig())
      setIsAudioReady(true)
    }
    initializeAudio()

    const controller = new GameController()
    controllerRef.current = controller
    const unsubscribe = controller.subscribe(setSnapshot)
    if (canvasRef.current) {
      controller.setCanvas(canvasRef.current)
    }

    return () => {
      unsubscribe()
      controller.destroy()
      audioManager.destroy()
    }
  }, [])

  const unlockAudioContext = useCallback(async () => {
    if (audioContextUnlocked) {
      return
    }

    try {
      await audioManager.resumeOnGesture()
      setAudioContextUnlocked(true)
    } catch (error) {
      console.warn('Audio context resume failed', error)
    }
  }, [audioContextUnlocked])

  useEffect(() => {
    if (!snapshot) {
      return
    }

    const maxIndex = Math.max(snapshot.wave.total - 1, 0)
    setQuickWaveIndex((prev) => Math.min(prev, maxIndex))
  }, [snapshot?.wave.total])

  useEffect(() => {
    if (!feedback) {
      return
    }

    const timer = window.setTimeout(() => {
      setFeedback(null)
    }, 4000)

    return () => clearTimeout(timer)
  }, [feedback])

  useEffect(() => {
    controllerRef.current?.setPreviewTowerType(selectedTower)
  }, [selectedTower])

  useEffect(() => {
    if (!snapshotStatus || !isAudioReady) {
      setAppPhase('loading')
      return
    }

    if (resetPending) {
      setAppPhase('resetting')
      return
    }

    if (snapshotStatus === 'won' || snapshotStatus === 'lost') {
      setAppPhase('gameover')
      return
    }

    if (snapshotStatus === 'running' || snapshotStatus === 'paused') {
      setAppPhase('playing')
      return
    }

    setAppPhase('idle')
  }, [snapshotStatus, isAudioReady, resetPending])

  useEffect(() => {
    if (!resetPending || !snapshotStatus) {
      return
    }

    if (snapshotStatus === 'idle' || snapshotStatus === 'running') {
      setResetPending(false)
    }
  }, [resetPending, snapshotStatus])

  useEffect(() => {
    if (!snapshot) {
      prevStatusRef.current = null
      setLiveAnnouncement(null)
      return
    }

    const previousStatus = prevStatusRef.current
    const currentStatus = snapshot.status

    if (previousStatus === currentStatus) {
      return
    }

    prevStatusRef.current = currentStatus

    let message: string | null = null
    if (currentStatus === 'won') {
      message = 'Victory! The prototype loop is cleared.'
    } else if (currentStatus === 'lost') {
      message = 'Game over! Reset to defend again.'
    } else if (currentStatus === 'running' && previousStatus !== 'running') {
      message = `Wave ${snapshot.wave.current} launched.`
    }

    if (!message) {
      return
    }

    setLiveAnnouncement(message)
    if (announcementTimerRef.current) {
      window.clearTimeout(announcementTimerRef.current)
    }

    announcementTimerRef.current = window.setTimeout(() => {
      setLiveAnnouncement(null)
      announcementTimerRef.current = null
    }, 4000)

    return () => {
      if (announcementTimerRef.current) {
        window.clearTimeout(announcementTimerRef.current)
        announcementTimerRef.current = null
      }
    }
  }, [snapshot])

  useEffect(() => {
    return () => {
      if (announcementTimerRef.current) {
        window.clearTimeout(announcementTimerRef.current)
      }
    }
  }, [])

  const handleCanvasClick = (event: MouseEvent<HTMLCanvasElement>) => {
    void unlockAudioContext()
    const controller = controllerRef.current
    if (!controller) {
      return
    }

    const result = controller.placeTowerFromScreen(event.clientX, event.clientY, selectedTower)
    setFeedback(result.message)
  }

  const handleCanvasMove = (event: MouseEvent<HTMLCanvasElement>) => {
    controllerRef.current?.updateHover(event.clientX, event.clientY)
  }

  const handleCanvasLeave = () => {
    controllerRef.current?.clearHover()
  }

  const handleSelectTower = (type: TowerType) => {
    setSelectedTower(type)
    setFeedback(null)
  }

  const handleStart = useCallback(async () => {
    await unlockAudioContext()
    controllerRef.current?.start()
  }, [unlockAudioContext])
  const handlePause = useCallback(() => controllerRef.current?.pause(), [])
  const handleReset = useCallback(async () => {
    await unlockAudioContext()
    setResetPending(true)
    setAppPhase('resetting')
    controllerRef.current?.resetGame()
  }, [setResetPending, setAppPhase, unlockAudioContext])
  const handleSpeedChange = useCallback(
    (speed: number) => {
      controllerRef.current?.setGameSpeed(speed)
      setFeedback(`Game speed set to ${speed}x`)
    },
    [setFeedback]
  )
  const handleNextWave = useCallback(async () => {
    await unlockAudioContext()
    const controller = controllerRef.current
    if (!controller) {
      return
    }

    const started = controller.beginNextWave()
    if (started) {
      setFeedback('Next wave deployed.')
    } else {
      setFeedback('Wave not ready yet.')
    }
  }, [setFeedback, unlockAudioContext])

  const handleToggleRanges = () => {
    controllerRef.current?.toggleShowRanges()
  }

  const handleToggleHitboxes = () => {
    controllerRef.current?.toggleShowHitboxes()
  }

  const handleSetQuickWave = (index: number) => {
    setQuickWaveIndex(index)
  }

  const handleQuickStartWave = () => {
    void unlockAudioContext()
    const controller = controllerRef.current
    if (!controller) {
      return
    }

    controller.quickSetWave(quickWaveIndex)
    setFeedback(`Wave ${quickWaveIndex + 1} loaded.`)
  }

  const handleToggleHowToPlay = () => {
    setShowHowToPlay((prev) => !prev)
  }

  // Audio control handlers
  const handleMasterVolumeChange = (volume: number) => {
    void unlockAudioContext()
    audioManager.setMasterVolume(volume)
    setAudioConfig(audioManager.getConfig())
  }

  const handleSfxVolumeChange = (volume: number) => {
    void unlockAudioContext()
    audioManager.setSfxVolume(volume)
    setAudioConfig(audioManager.getConfig())
  }

  const handleMusicVolumeChange = (volume: number) => {
    void unlockAudioContext()
    audioManager.setMusicVolume(volume)
    setAudioConfig(audioManager.getConfig())
  }

  const handleToggleMute = () => {
    void unlockAudioContext()
    audioManager.setMuted(!audioConfig.muted)
    setAudioConfig(audioManager.getConfig())
  }

  const handleRetry = useCallback(async () => {
    await unlockAudioContext()
    const controller = controllerRef.current
    if (!controller) {
      return
    }

    setResetPending(true)
    setAppPhase('resetting')

    controller.resetGame()
    controller.start()
    setFeedback('Resetting the loop...')
  }, [setFeedback, setAppPhase, setResetPending, unlockAudioContext])

  const showStartOverlay = snapshotStatus === 'idle' && appPhase === 'idle'
  const showGameOverOverlay =
    snapshot?.status === 'won' || snapshot?.status === 'lost'
  const isAppBusy = appPhase === 'loading' || appPhase === 'resetting'
  const canvasStatusMessage = !isAudioReady
    ? 'Loading audio...'
    : appPhase === 'resetting'
    ? 'Resetting the prototype...'
    : !snapshot
    ? 'Preparing the battle map...'
    : undefined
  const isCanvasBusy = Boolean(canvasStatusMessage)

  // Keyboard shortcuts and accessibility
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore if typing in input fields
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return
      }

      switch (event.code) {
        case 'Space':
          event.preventDefault()
          if (snapshot?.status === 'running') {
            handlePause()
          } else {
            handleStart()
          }
          break
        case 'KeyR':
          event.preventDefault()
          handleReset()
          break
        case 'KeyN':
          event.preventDefault()
          if (snapshot?.nextWaveAvailable) {
            handleNextWave()
          }
          break
        case 'Digit1':
          event.preventDefault()
          handleSpeedChange(1)
          break
        case 'Digit2':
          event.preventDefault()
          handleSpeedChange(2)
          break
        case 'Digit3':
          event.preventDefault()
          handleSpeedChange(4)
          break
        case 'Escape':
          event.preventDefault()
          if (showGameOverOverlay) {
            handleRetry()
          } else {
            // Cancel tower selection (reset to first available tower)
            handleSelectTower('indica')
            setFeedback('Tower selection cancelled')
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    snapshot,
    handleStart,
    handlePause,
    handleReset,
    handleNextWave,
    handleSpeedChange,
    handleRetry,
    showGameOverOverlay,
  ])

  useEffect(() => {
    const activeOverlay = showStartOverlay
      ? startOverlayRef.current
      : showGameOverOverlay
      ? gameOverOverlayRef.current
      : null

    if (!activeOverlay) {
      return
    }

    const focusableSelectors =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    const focusableElements = Array.from(
      activeOverlay.querySelectorAll<HTMLElement>(focusableSelectors)
    )
    const firstElement = focusableElements[0] ?? activeOverlay
    const lastElement = focusableElements[focusableElements.length - 1] ?? activeOverlay

    firstElement?.focus()

    const handleTrap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') {
        return
      }

      if (focusableElements.length === 0) {
        return
      }

      if (event.shiftKey) {
        if (document.activeElement === firstElement) {
          event.preventDefault()
          lastElement?.focus()
        }
      } else if (document.activeElement === lastElement) {
        event.preventDefault()
        firstElement?.focus()
      }
    }

    activeOverlay.addEventListener('keydown', handleTrap)
    return () => {
      activeOverlay.removeEventListener('keydown', handleTrap)
    }
  }, [showStartOverlay, showGameOverOverlay])

  return (
    <ErrorBoundary onReset={handleRetry}>
      <div className="app-shell">
        <div className="sr-live" role="status" aria-live="polite" aria-atomic="true">
          {liveAnnouncement ?? ''}
        </div>
      <header className="app-header">
        <div className="hero-banner">
          <div className="hero-copy">
            <p className="eyebrow">Command Console</p>
            <h1>BioShield Uplink</h1>
            <p className="subtitle">
              Direct the turret line, sculpt the tempo, and keep the breach sealed.
            </p>
            <div className="hero-tags">
              <span className="tag-chip">Real-time tactics</span>
              <span className="tag-chip">Adaptive tempo</span>
              <span className="tag-chip">Precision build</span>
            </div>
          </div>
          <div className="hero-highlight" role="status" aria-live="polite">
            <div className="highlight-label">Session</div>
            <div className={`highlight-state state-${snapshotStatus ?? 'idle'}`}>
              <span className="pulse-dot" aria-hidden="true" />
              <span className="state-text">
                {snapshotStatus === 'running' && 'Live engagement'}
                {snapshotStatus === 'paused' && 'On hold'}
                {snapshotStatus === 'idle' && 'Ready to deploy'}
                {snapshotStatus === 'won' && 'Secured run'}
                {snapshotStatus === 'lost' && 'Breach detected'}
                {!snapshotStatus && 'Initializing systems'}
              </span>
            </div>
          </div>
        </div>

        <div className="header-panels">
          <GameHUD snapshot={snapshot} />
          <div className="control-panel">
            <div className="panel-title-row">
              <p className="eyebrow">Operations</p>
              <span className="panel-sub">Flow + Audio</span>
            </div>
            <GameControls
              status={snapshot?.status ?? 'idle'}
              onStart={handleStart}
              onPause={handlePause}
              onNextWave={handleNextWave}
              onReset={handleReset}
              nextWaveAvailable={snapshot?.nextWaveAvailable ?? false}
              gameSpeed={snapshot?.gameSpeed ?? 1}
              onSpeedChange={handleSpeedChange}
              isBusy={isAppBusy}
              audioConfig={audioConfig}
              onMasterVolumeChange={handleMasterVolumeChange}
              onSfxVolumeChange={handleSfxVolumeChange}
              onMusicVolumeChange={handleMusicVolumeChange}
              onToggleMute={handleToggleMute}
            />
          </div>
        </div>
      </header>

      <main className="main-stage">
        <section className="tower-column">
          <TowerPicker
            selected={selectedTower}
            onSelect={handleSelectTower}
            feedback={feedback}
            currentMoney={snapshot?.money ?? 0}
          />
          <DebugPanel
            showRanges={snapshot?.showRanges ?? false}
            showHitboxes={snapshot?.showHitboxes ?? false}
            fps={snapshot?.fps ?? 0}
            currentWave={snapshot?.wave.current ?? 1}
            totalWaves={snapshot?.wave.total ?? 1}
            quickWaveIndex={quickWaveIndex}
            onToggleRanges={handleToggleRanges}
            onToggleHitboxes={handleToggleHitboxes}
            onSetQuickWave={handleSetQuickWave}
            onQuickStartWave={handleQuickStartWave}
          />
        </section>

      <section className="canvas-wrapper" aria-busy={isCanvasBusy}>
        {canvasStatusMessage && (
          <div className="canvas-loading" role="status" aria-live="polite">
            <span className="spinner" aria-hidden="true" />
            <span>{canvasStatusMessage}</span>
          </div>
        )}
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          onMouseMove={handleCanvasMove}
          onMouseLeave={handleCanvasLeave}
        />
      </section>
      </main>

      <div
        className={`overlay-panel start-overlay ${showStartOverlay ? 'visible' : ''}`}
        aria-hidden={!showStartOverlay}
      >
        <div
          ref={startOverlayRef}
          className="overlay-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="start-overlay-title"
          aria-describedby="start-overlay-desc"
          tabIndex={-1}
        >
          <p className="eyebrow">Seed the Defense</p>
          <h2 id="start-overlay-title">Play the prototype loop</h2>
          <p id="start-overlay-desc" className="overlay-subtext">
            Place towers, control the tempo, and push waves back. Deploy towers tactically before
            releasing each wave.
          </p>
          <div className="overlay-actions">
            <button className="primary" onClick={handleStart}>
              Play
            </button>
            <button className="ghost" onClick={handleToggleHowToPlay}>
              {showHowToPlay ? 'Hide tips' : 'How to play'}
            </button>
          </div>
          {showHowToPlay && (
            <div className="how-to-panel">
              <h4>🎮 How to Play</h4>
              <div className="how-to-section">
                <h5>🏗️ Tower Strategy</h5>
                <p>• <strong>Indica:</strong> Heavy damage, slow fire rate - best for tough enemies</p>
                <p>• <strong>Sativa:</strong> Fast fire rate, lower damage - keeps enemies at bay</p>
                <p>• <strong>Support:</strong> Slows enemies down, no direct damage - pairs with shooters</p>
              </div>
              <div className="how-to-section">
                <h5>💰 Economy & Survival</h5>
                <p>• Earn money by defeating enemies</p>
                <p>• Lose lives when enemies reach the end</p>
                <p>• Build strategically before starting waves</p>
              </div>
              <div className="how-to-section">
                <h5>⌨️ Keyboard Shortcuts</h5>
                <p>• <strong>Space:</strong> Start/Pause game</p>
                <p>• <strong>1, 2, 3:</strong> Change game speed (1x, 2x, 4x)</p>
                <p>• <strong>N:</strong> Start next wave</p>
                <p>• <strong>R:</strong> Reset game</p>
                <p>• <strong>Esc:</strong> Cancel tower selection</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div
        className={`overlay-panel gameover-overlay ${showGameOverOverlay ? 'visible' : ''}`}
        aria-hidden={!showGameOverOverlay}
      >
        <div
          ref={gameOverOverlayRef}
          className="overlay-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="gameover-overlay-title"
          aria-describedby="gameover-overlay-desc"
          tabIndex={-1}
        >
          <p className="eyebrow">{snapshot?.status === 'won' ? 'Trophy' : 'Warning'}</p>
          <h2 id="gameover-overlay-title">
            {snapshot?.status === 'won' ? 'Garden Secured' : 'Garden Lost'}
          </h2>
          <p id="gameover-overlay-desc" className="overlay-subtext">
            {snapshot?.status === 'won'
              ? 'You stood strong through the planned waves. Restart to test balance.'
              : 'The path was breached. Reset the prototype when you are ready to retry.'}
          </p>
          <button className="primary" onClick={handleRetry}>
            Retry
          </button>
        </div>
      </div>
    </div>
  </ErrorBoundary>
  )
}

export default App


