Feature: Generate four takes
  The user auditions four random-seed variations before keeping a clip.

  Scenario: Generate 4 takes is disabled for a short prompt
    Given the studio is open
    When the prompt has fewer than 3 characters
    Then Generate 4 takes is not available

  Scenario: Four takes open a comparison grid
    Given the studio is open
    And the model is loaded
    When the user writes a tavern door prompt
    And Generate 4 takes is chosen
    Then four takes are shown
    And each take can be played, kept, or discarded
