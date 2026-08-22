Feature: Export a clipped sound
  The keeper exports only the trimmed region for games and video.

  Scenario: Export WAV downloads the trim
    Given a clip is on the scroll with a trim region
    When Export WAV is chosen
    Then a WAVE file is saved for that region

  Scenario: Mock OGG explains the desktop engine
    Given the mock brazier is lit
    When Export OGG is chosen
    Then the keeper is told OGG needs the CUDA engine
