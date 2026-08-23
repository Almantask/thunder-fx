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
