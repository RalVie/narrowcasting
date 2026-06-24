export function PlayerApp() {
  return (
    <main className="player-shell">
      <section className="playback-surface" aria-label="Local playlist playback">
        <p className="status-label">Waiting for local schedule</p>
        <h1>Local playlist playback</h1>
        <p className="supporting-copy">
          Media will play from the local cache only. Server, internet, and network availability are
          not required for playback once content exists on this device.
        </p>
      </section>
      <footer className="status-bar">
        <span>Playback: idle</span>
        <span>Cache: placeholder</span>
        <span>Urgent commands: reserved</span>
      </footer>
    </main>
  );
}
