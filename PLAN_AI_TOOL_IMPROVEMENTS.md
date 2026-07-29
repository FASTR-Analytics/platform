 Suggested Improvements
Return { "previous_tab": "...", "current_tab": "...", "changed": bool } — structured response enables the AI to track state and detect no-ops.
Add a get_current_tab tool — or include current tab in session context, so the AI doesn’t blindly switch when already there.
Define the editing-mode error explicitly — document what error message is returned when switching is blocked, so the AI can handle it gracefully.
Consider adding "home" or "overview" as aliases — or at minimum document that decks = “Presentations/Slides” in the tool description.