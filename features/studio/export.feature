Feature: Export a clipped sound
  The user exports only the trimmed region for games and video.

  Scenario: Export WAV downloads the trim
    Given a clip is on the waveform with a trim region
    When Export WAV is chosen
    Then a WAVE file is saved for that region

  Scenario: Mock OGG explains the desktop engine
    Given the mock engine is active
    When Export OGG is chosen
    Then the user is told OGG needs the desktop app
