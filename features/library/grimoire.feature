Feature: Library
  Past sounds live on the Library tab.

  Scenario: Empty library offers starter prompts
    Given the library has no clips
    Then three starter prompts are shown

  Scenario: Empty library in instrumental mode offers music starters
    Given the library has no clips
    And Instrumental mode is selected
    Then three instrumental starter prompts are shown

  Scenario: Library cards show a prompt name
    Given the library has a tavern door clip
    Then the library lists Tavern door
    And the full prompt is not shown

  Scenario: Choosing a clip loads the waveform and prompt
    Given the library has a tavern door clip
    When that clip is chosen
    Then the waveform shows that clip
    And the prompt is the tavern door text

  Scenario: Playing visible sounds
    Given the library has saved clips
    When the user clicks Play visible sounds
    Then playback starts for the visible sounds
    And the button shows Pause

  Scenario: Categories are collapsed by default and expandable
    Given the library has saved clips across categories
    Then the category headers are displayed in a collapsed state
    When the user expands a category
    Then the clips within that category are revealed

  Scenario: Switching between browsing sounds and browsing ambiences
    Given the library has sound effects and ambience clips
    When the user switches browsing mode to Ambiences
    Then only ambience clips and categories are shown
    When the user switches browsing mode to Sounds
    Then only sound effect clips and categories are shown
