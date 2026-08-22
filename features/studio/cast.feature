Feature: Cast an incantation
  The keeper weaves a sound from text and hears it on the scroll.

  Scenario: Cast is sealed for a short incantation
    Given the studio is open
    When the incantation has fewer than 3 characters
    Then Cast is not available

  Scenario: A successful Cast fills the scroll
    Given the studio is open
    When the keeper writes a tavern door incantation
    And Casts
    Then eight rites are reported
    And a waveform is shown on the scroll

  Scenario: The last clip stays while a new weave runs
    Given a clip is already on the Grimoire
    When the keeper Casts again
    Then the previous clip remains listed
