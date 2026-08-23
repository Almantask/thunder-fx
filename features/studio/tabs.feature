Feature: Studio tabs
  The app is split into Library, Generate, and Settings.

  Scenario: Generate is the working canvas
    Given the studio is open
    Then the Generate tab is selected
    And Generate is available

  Scenario: Library hides the generate console
    Given the studio is open
    When the user opens the Library tab
    Then the library search is shown
    And Generate is not available

  Scenario: Settings holds the library folder and logs
    Given the studio is open
    When the user opens the Settings tab
    Then the generated sounds folder is shown
    And the error log is shown
