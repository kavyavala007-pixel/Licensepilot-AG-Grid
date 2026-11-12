# Local recording and assembly instructions

## Current deliverable

The finished recording is `LicensePilot-demo-180s.mp4`. Open `index.html` in a browser to play it or click **Download MP4**. The MP4 is a continuous capture of the running app with spoken narration and no subtitles. Runtime: exactly 180 seconds.

The narration uses the built-in macOS Samantha voice. It is synthetic, not a human voice recording. Replace the narration track with a human recording if the final venue requires a human speaker.

## Record the real application

1. The current capture used the repository's built frontend and a temporary database at `/tmp/licensepilot-video.db`, copied from the fictional seed. Do not use the repository database for a demo recording.
2. Confirm the top environment strip says **Demo** and payments are simulated. Confirm the sidebar shows AI off / fixed rules. If either state differs, do not record the corresponding simulated-payment or rules-fallback claim; use only the disclosure and source state actually shown. Never reveal environment variables or credentials.
3. Set the browser to 1920×1080 (16:9) and 25 fps. Use the light theme, close unrelated tabs, wait for charts and tables to finish loading, and ensure seeded customer rows are legible.
4. Record the screen without webcam, notifications, or personal data. Use a deliberate cursor and no sensitive clipboard contents. Follow the exact scene timings in `storyboard.md`. Keep the lower-third disclosure visible on every app scene.
5. In Renewals, verify **Practice run (dry run)** remains checked before any click. A practice run is optional and may be used only with the local seeded demo data. Confirm the interface states no bills were sent. Never turn off dry run.
6. In Licence Advisor, do not complete any checkout. Show the $1.00 flow only while the app visibly confirms Demo/Simulated mode and the UI labels the value as a test amount. Do not show credentials, an external approval flow, or a product price.
7. The included `record-demo.mjs` captures the real UI with a visible pointer and local narration. It needs the existing Node, Playwright, macOS `say`/`afconvert`, and AVFoundation tools; it does not install packages or contact production services.
8. Review the MP4 at full resolution and confirm the runtime is exactly 00:03:00 before uploading.

## Scene order checklist

Overview → Licence Advisor → Customers → Renewals (dry run on) → Assistant → Payments → Activity History → architecture card → disclosure close.

Do not click Send renewal bill, create a subscription, submit a purchase, change policy settings, download customer records, or use live services while recording.
