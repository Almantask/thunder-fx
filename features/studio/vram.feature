Feature: VRAM monitor and precision
  The titlebar shows GPU memory. Settings can load Medium in half precision.

  Scenario: Titlebar shows used and total VRAM
    Given the studio is open
    Then VRAM used and total are shown

  Scenario: High VRAM is highlighted
    Given VRAM use is above 85 percent
    Then the VRAM badge warns

  Scenario: Settings offers FP16 low-VRAM mode
    Given the Settings tab is open
    When FP16 / BF16 is chosen
    Then the precision setting is saved
    And Load model applies it after an unload
