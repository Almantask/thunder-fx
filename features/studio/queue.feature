Feature: Generate a prompt queue
  The user loads shipped /prompts entries into a queue and generates them in order.

  Scenario: Browse prompts lists shipped effects
    Given the studio is open
    When the user opens Browse prompts
    Then Combat prompts are shown
    And Steel sword draw can be added to the queue

  Scenario: Ambience library lists instrumental beds
    Given the studio is open
    When the user opens Browse prompts
    And the user selects Ambience
    Then Forest prompts are shown

  Scenario: Preview shows the prompt text
    Given the studio is open
    When the user opens Browse prompts
    And the user previews Steel sword draw
    Then the sword draw prompt text is shown

  Scenario: Selected catalog prompts join the generate queue
    Given the studio is open
    When the user adds Steel sword draw from the catalog
    Then the generate queue lists Steel sword draw

  Scenario: Generate queue creates library clips in order
    Given the studio is open
    And Steel sword draw is in the generate queue
    When the user Generates the queue
    Then a waveform is shown
    And the library lists the sword draw clip

  Scenario: Use loads a catalog prompt into Generate
    Given the studio is open
    When the user uses Steel sword draw from the catalog
    Then the prompt is the sword draw text
    And Duration is 1.5 seconds

  Scenario: Generate queue shows an estimated total time
    Given the studio has generated a clip before
    And Steel sword draw is in the generate queue
    Then Generate queue shows an estimated duration
