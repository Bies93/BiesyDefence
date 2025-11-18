import type { GameSnapshot } from '@/game/core/types'

interface GameHUDProps {
  snapshot: GameSnapshot | null
}

interface HudLabelProps {
  iconClass: string
  label: string
}

function HudLabel({ iconClass, label }: HudLabelProps) {
  return (
    <div className="hud-row-title">
      <span className={`hud-icon ${iconClass}`} aria-hidden="true" />
      <span className="hud-label">{label}</span>
    </div>
  )
}

export function GameHUD({ snapshot }: GameHUDProps) {
  if (!snapshot) {
    const skeletonWidths = [90, 68, 76, 52]
    return (
      <div className="hud hud-skeleton" role="status" aria-live="polite">
        {skeletonWidths.map((width, index) => (
          <span
            key={`skeleton-${index}`}
            className="hud-skeleton-line"
            style={{ width: `${width}%` }}
          />
        ))}
      </div>
    )
  }

  // Enhanced validation and sanitization with comprehensive error handling
  const safeSnapshot = {
    ...snapshot,
    money: Math.max(0, Number.isFinite(snapshot.money) ? snapshot.money : 0),
    lives: Math.max(0, Number.isFinite(snapshot.lives) ? snapshot.lives : 0),
    score: Math.max(0, Number.isFinite(snapshot.score) ? snapshot.score : 0),
    fps: Number.isFinite(snapshot.fps) ? snapshot.fps : 0,
    gameSpeed: Math.max(0.25, Math.min(8, Number.isFinite(snapshot.gameSpeed) ? snapshot.gameSpeed : 1)),
    wave: {
      current: Math.max(1, Number.isFinite(snapshot.wave.current) ? snapshot.wave.current : 1),
      total: Math.max(1, Number.isFinite(snapshot.wave.total) ? snapshot.wave.total : 1),
      queued: Math.max(0, Number.isFinite(snapshot.wave.queued) ? snapshot.wave.queued : 0),
    }
  }

  // Determine visual states based on data changes
  const livesCritical = safeSnapshot.lives <= 3 && safeSnapshot.lives > 0
  const livesLow = safeSnapshot.lives <= 10 && safeSnapshot.lives > 3
  const moneyLow = safeSnapshot.money < 50
  const fpsLow = safeSnapshot.fps < 30 && safeSnapshot.fps > 0

  const spawnProgress =
    safeSnapshot.nextSpawnCountdown !== null && safeSnapshot.nextSpawnDelay
      ? 1 - Math.max(safeSnapshot.nextSpawnCountdown / (safeSnapshot.nextSpawnDelay ?? 1), 0)
      : 0
  const fpsDisplay = safeSnapshot.fps

  const waveCompletion = Math.min(
    Math.max(safeSnapshot.wave.current / safeSnapshot.wave.total, 0),
    1
  )

  return (
    <div className="hud hud-refined">
      <div className="hud-header">
        <div className="hud-title-group">
          <p className="eyebrow">Telemetry</p>
          <h3>Frontline Readout</h3>
          <span className="microcopy">Live economy, attrition, and tempo in one glance.</span>
        </div>
        <div className="wave-progress" aria-label="Wave progress">
          <div className="progress-label">Wave Track</div>
          <div className="progress-rail">
            <div className="progress-fill" style={{ width: `${waveCompletion * 100}%` }} />
          </div>
          <div className="progress-values">
            <span>Wave {safeSnapshot.wave.current}</span>
            <span>Total {safeSnapshot.wave.total}</span>
          </div>
        </div>
      </div>

      <div className="hud-grid">
        <div className={`hud-card money-card ${moneyLow ? 'warning' : ''}`}>
          <HudLabel iconClass="hud-icon-money" label="Credits" />
          <div className="stat-main">
            <strong className="stat-value">${safeSnapshot.money}</strong>
            <span className="stat-hint">Resource pool</span>
          </div>
          {moneyLow && <span className="stat-alert">Low reserves</span>}
        </div>

        <div className={`hud-card lives-card ${livesCritical ? 'critical' : livesLow ? 'warning' : ''}`}>
          <HudLabel iconClass="hud-icon-lives" label="Integrity" />
          <div className="stat-main">
            <strong className="stat-value">{safeSnapshot.lives}</strong>
            <span className="stat-hint">Core health</span>
          </div>
          {livesCritical && <span className="stat-alert">Critical!</span>}
          {livesLow && !livesCritical && <span className="stat-alert">Reinforce soon</span>}
        </div>

        <div className="hud-card score-card">
          <HudLabel iconClass="hud-icon-score" label="Score" />
          <div className="stat-main">
            <strong className="stat-value">{safeSnapshot.score.toLocaleString()}</strong>
            <span className="stat-hint">Efficiency index</span>
          </div>
        </div>

        <div className="hud-card wave-card">
          <HudLabel iconClass="hud-icon-wave" label="Wave" />
          <div className="stat-main">
            <strong className="stat-value">{safeSnapshot.wave.current}</strong>
            <span className="stat-hint">of {safeSnapshot.wave.total}</span>
          </div>
          {safeSnapshot.wave.queued > 0 && (
            <span className="stat-alert">{safeSnapshot.wave.queued} queued</span>
          )}
        </div>

        <div className="hud-card speed-card">
          <HudLabel iconClass="hud-icon-speed" label="Tempo" />
          <div className="stat-main">
            <strong className="stat-value">{safeSnapshot.gameSpeed}x</strong>
            <span className="stat-hint">Simulation speed</span>
          </div>
        </div>

        <div className={`hud-card fps-card ${fpsLow ? 'warning' : ''}`}>
          <div className="hud-row-title">
            <span className="hud-label">Performance</span>
          </div>
          <div className="stat-main">
            <strong className={`stat-value ${fpsLow ? 'low-fps' : ''}`}>{fpsDisplay.toFixed(1)}</strong>
            <span className="stat-hint">Frames / sec</span>
          </div>
          {fpsLow && <span className="stat-alert">Optimize view</span>}
        </div>
      </div>

      <div className="hud-footer">
        {safeSnapshot.nextWaveAvailable && (
          <div className="next-wave-ready">
            🚀 Next wave primed — press N or trigger the Next Wave control
          </div>
        )}
        {safeSnapshot.nextSpawnCountdown !== null && safeSnapshot.nextSpawnDelay !== null && (
          <div className="spawn-ticker">
            <span className="spawn-label">Next enemy in:</span>
            <div className="spawn-timer">
              <span className="spawn-countdown">{safeSnapshot.nextSpawnCountdown.toFixed(1)}s</span>
              <div className="spawn-ticker-bar">
                <div
                  className="spawn-progress"
                  style={{ width: `${Math.min(Math.max(spawnProgress, 0), 1) * 100}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

