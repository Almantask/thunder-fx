Feature: Keep tabs
  The keep is split into Library, Generate, and Settings.

  Scenario: Generate is the working canvas
    Given the studio is open
    Then the Generate tab is selected
    And Cast is available

  Scenario: Library hides the weave console
    Given the studio is open
    When the keeper opens the Library tab
    Then the Grimoire search is shown
    And Cast is not available

  Scenario: Settings holds the library folder and logs
    Given the studio is open
    When the keeper opens the Settings tab
    Then the generated sounds folder is shown
    And the error log is shown
