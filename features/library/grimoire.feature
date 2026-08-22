Feature: Grimoire
  Past incantations live in a rail beside the scroll.

  Scenario: Empty Grimoire offers starter incantations
    Given the Grimoire has no clips
    Then three starter incantations are shown

  Scenario: Choosing a page loads the scroll
    Given the Grimoire has a tavern door clip
    When that page is chosen
    Then the scroll shows that clip
