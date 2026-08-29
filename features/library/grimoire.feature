Feature: Library
  Past sounds live on the Library tab.

  Scenario: Empty library offers starter prompts
    Given the library has no clips
    Then three starter prompts are shown

  Scenario: Empty library in instrumental mode offers music starters
    Given the library has no clips
    And Instrumental mode is selected
    Then three instrumental starter prompts are shown

  Scenario: Empty library in ambience mode offers background-bed starters
    Given the library has no clips
    And Ambience mode is selected
    Then three ambience starter prompts are shown

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

  Scenario: Switching between browsing sounds, ambience, and instrumental
    Given the library has sound effects, ambience, and music clips
    When the user switches browsing mode to Ambience
    Then only ambience clips and categories are shown
    When the user switches browsing mode to Instrumental
    Then only music clips and categories are shown
    When the user switches browsing mode to Sounds
    Then only sound effect clips and categories are shown

  Scenario: Selected clips can be exported as a named zip pack
    Given the library has saved clips
    When the user selects clips and Export pack
    Then a naming template is offered
    And a zip sound pack can be saved

