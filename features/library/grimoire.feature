Feature: Library
  Past sounds live on the Library tab.

  Scenario: Empty library offers starter prompts
    Given the library has no clips
    Then three starter prompts are shown

  Scenario: Empty library in instrumental mode offers music starters
    Given the library has no clips
    And Instrumental mode is selected
    Then three instrumental starter prompts are shown

  Scenario: Choosing a clip loads the waveform
    Given the library has a tavern door clip
    When that clip is chosen
    Then the waveform shows that clip
