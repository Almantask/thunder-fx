Feature: Setup
  The user must accept licenses and check the engine before the studio opens.

  Scenario: Continue stays disabled until both licenses are accepted
    Given setup is on Licenses
    When only the Community License is accepted
    Then Continue is not available

  Scenario: The user proceeds after both licenses
    Given setup is on Licenses
    When the Community License and Gemma Terms are accepted
    And Continue is chosen
    Then Hardware is shown

  Scenario: A failed check stays technical
    Given Hardware reports that CUDA is missing
    Then the user sees a short warning
    And the technical details name CUDA
