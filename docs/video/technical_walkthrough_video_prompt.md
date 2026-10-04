# Technical Walkthrough Video Prompt

Create the technical walkthrough video for this hackathon project. This is a separate video from the product demo.

## Inspect the current project first

Inspect the current repository, documentation, tests, recent changes, and implementation. Run the relevant parts of the project if possible. Account for functionality added since earlier project plans or descriptions.

Use the current code and working behavior as the source of truth. Decide which technical story is most interesting and can be demonstrated accurately. Choose no more than three technical ideas to explain, such as an important data flow, model integration, system design decision, or recently added capability—only if supported by the project.

Do not ask me to choose the technical story. Make a reasoned choice from the project, briefly explain it, and continue to production.

## Purpose

Explain how the system works under the hood to a technically literate hackathon jury. Focus on the actual implementation: how information moves through the system, which components handle it, and what engineering decision makes the solution work.

This is a technical walkthrough, not another user-facing product pitch. Avoid repeating the product demo’s narrative. Use a real code or system-flow moment to make the engineering understandable.

## Length and format

- Target length: approximately 50 seconds.
- Absolute maximum: 60 seconds, including the ending and fade-out.
- Format: 16:9 landscape, 1920×1080, 30 fps.
- Deliver an MP4 or MOV under 1 GB.
- If the material is too dense, cut details rather than speeding up narration or exceeding 60 seconds.

## Match the product demo’s visual identity

Make the two videos feel like a coherent pair. Reuse the product demo’s typography, colors, contrast, motion language, caption style, and sound-design approach where available.

Keep the same bold, cinematic energy: sharp edits, punch-in zooms, kinetic labels, animated highlights, and purposeful transitions. Adapt the visuals for technical explanation with clean animated architecture diagrams, data-flow lines, and carefully selected code excerpts.

Do not make the video look like a screen-recorded lecture. Keep diagrams simple and readable; show only a few components at a time. If displaying code, use real code from the repository, enlarge the relevant lines, and highlight them. Never show dense, unreadable terminal or editor footage.

## Suggested 50-second structure

These timings are a guide. Adapt them to the strongest technical story you find.

- 0–3 sec: A technically grounded hook that raises the system question the video will answer.
- 3–9 sec: Reveal a simple architecture map of the real system.
- 9–30 sec: Trace one important request or data path through the actual components.
- 30–42 sec: Explain one or two meaningful engineering choices or recently added technical capabilities.
- 42–47 sec: Show how the system produces or verifies its result, if this is implemented.
- 47–50 sec: Close with the project name and one concise technical takeaway.

Do not force a component or capability into the video just to fill a section. If it runs long, cut details rather than speeding up narration or exceeding 60 seconds.

## Accuracy

- Base every technical statement on the current code, configuration, tests, or documentation.
- Show implemented behavior only. Label planned work as future work or leave it out.
- Do not invent performance numbers, model capabilities, deployment details, privacy claims, or architecture components.
- If a key detail is uncertain, omit it or phrase it cautiously.
- Keep explanations precise but accessible; define any acronym that is essential to the story.
- Use the product’s current name and terminology.

## Audio and delivery

- Write concise, natural voice-over that fits the chosen story and runtime.
- Let diagrams and code carry the detail; do not narrate every visual element.
- Add accurate burned-in subtitles and restrained sound cues.
- Use licensed or project-provided music only.

## Production and deliverables

- Use the most reliable production method available, such as real browser or terminal recordings combined with motion graphics. Choose tools after inspecting the repository and environment.
- Keep video work in a clearly named, separate directory. Do not make unrelated changes to the product.
- Render the video and review the actual output for technical accuracy, readability, subtitle timing, audio balance, pacing, and duration. Fix issues before delivery.
- Deliver the finished video, the editable source project, the voice-over script, a timestamped shot list, and a short note naming the technical details selected and where they are supported in the repository.
- Verify that the final video is near 50 seconds and never exceeds 60 seconds or 1 GB.
