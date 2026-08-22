Feature: First Watch
  The keeper must swear oaths and light the brazier before the studio opens.

  Scenario: Continue stays sealed until both oaths are sworn
    Given the First Watch is on Oaths
    When only the Community License is accepted
    Then Continue is not available

  Scenario: The keeper proceeds after both oaths
    Given the First Watch is on Oaths
    When the Community License and Gemma Terms are accepted
    And Continue is chosen
    Then Augury is shown

  Scenario: A failed omen stays technical
    Given Augury reports that CUDA is missing
    Then the keeper sees an in-world warning
    And the technical details name CUDA
