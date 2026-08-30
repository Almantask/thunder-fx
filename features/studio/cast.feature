Feature: Generate a sound
  The user generates a sound from text and hears it on the waveform.

  Scenario: Generate is disabled for a short prompt
    Given the studio is open
    When the prompt has fewer than 3 characters
    Then Generate is not available

  Scenario: A successful generate fills the waveform
    Given the studio is open
    When the user writes a tavern door prompt
    And Generates
    Then eight steps are reported
    And a waveform is shown

  Scenario: Generate shows a loading bar while it runs
    Given the studio is open
    When the user writes a tavern door prompt
    And Generates
    Then a loading bar is shown on the waveform

  Scenario: The last clip stays while a new generate runs
    Given a clip is already in the library
    When the user Generates again
    Then the previous clip remains listed

  Scenario: Sound effects is the default generate mode
    Given the studio is open
    Then Sound effects mode is selected
    And Browse prompts is shown
    And Generate queue is shown

  Scenario: Ambience mode prepares a looping background bed
    Given the studio is open
    When the user chooses Ambience mode
    Then Ambience mode is selected
    And the prompt uses a sound-effects track type
    And music is listed in the negative prompt
    And Generate seamless loop is on

  Scenario: Instrumental mode prepares a music prompt
    Given the studio is open
    When the user chooses Instrumental mode
    Then Instrumental mode is selected
    And the prompt uses a music track type
    And vocals are listed in the negative prompt

  Scenario: Instrumental generate saves a music clip
    Given the studio is open
    When the user chooses Instrumental mode
    And the user writes a lute theme prompt
    And Generates
    Then a waveform is shown
    And the library lists a music clip
    And the clip lists lute as an instrument

  Scenario: Music WAV files carry instrument tags
    Given the studio is open
    When the user chooses Instrumental mode
    And the user writes a lute and cello prompt
    And Generates
    Then the saved WAVE file lists lute and cello in its metadata

  Scenario: Load model is separate from Generate
    Given the studio is open
    Then Load model is shown
    And Generate does not load the model

  Scenario: Generate waits until the model is loaded
    Given the studio is open
    And the model is not loaded
    When the prompt is long enough
    Then Generate is not available
    And Load model is available

  Scenario: Duration can use the full Medium length
    Given the studio is open
    Then Duration can be set to 380 seconds

  Scenario: Generate shows an estimated time from past clips
    Given the studio has generated a clip before
    When the prompt is long enough
    Then Generate shows an estimated duration

  Scenario: Load model shows an estimated time from past loads
    Given the studio has loaded the model before
    And the model is not loaded
    Then Load model shows an estimated duration

  Scenario: A generate shows remaining time
    Given the studio is open
    When the user writes a tavern door prompt
    And Generates
    Then remaining time is shown

  Scenario: A finished clip shows the seed it was generated with
    Given the studio is open
    When the user writes a tavern door prompt
    And Generates
    Then the seed used for the clip is shown beside its length
    And the same seed is shown on the clip in the library

  Scenario: Instrumental seamless loop ends the same way it starts
    Given the studio is open
    When the user chooses Instrumental mode
    Then Generate seamless loop is on
    When the user writes a lute theme prompt
    And Generates
    Then a waveform is shown
    And preview looping is on

