Feature: Export a clipped sound
  The user exports only the trimmed region for games and video.

  Scenario: Export WAV downloads the trim
    Given a clip is on the waveform with a trim region
    When Export WAV is chosen
    Then a WAVE file is saved for that region

  Scenario: Export can use 48 kHz 24-bit or mono
    Given a clip is on the waveform
    When 48 kHz, 24-bit, or mono is chosen
    Then Export WAV uses those settings

  Scenario: Mock compressed formats explain the desktop engine
    Given the mock engine is active
    When Export FLAC, MP3, or OGG is chosen
    Then the user is told that format needs the desktop app

  Scenario: Auto-trim snaps In and Out to audible audio
    Given a clip is on the waveform with leading silence
    When Auto-trim silence is chosen
    Then the In and Out markers skip the quiet ends
