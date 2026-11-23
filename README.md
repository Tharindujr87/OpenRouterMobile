# ORM — personal assistant

A mobile-first personal assistant built with Expo, React Native and TypeScript.
It opens on a **chat screen** with sessions in a left drawer, automatic model routing,
and manual model selection. Capture commands still run locally and cost nothing.

## What works now

- **Diary** tab with a date picker (tap the day to open it, or type `YYYY-MM-DD`).
  Each day shows a short summary and a list of entries; tap an entry to expand the
  cleaned text, your original words and its tags.
- **One diary chat box**: type a short note and it is saved to the selected day; ask a
  question such as “what happened with Joe?” and the diary is searched locally before
  any model call. The separate search box was removed.
- **Diary capture**: start a chat message with `diary:`. A cheap model fixes spelling
  and grammar, writes a one-line summary and tags, and lists anything unclear as a
  question. Nothing is saved until you tap **Save to diary**. Both the cleaned text and
  your original words are kept. Entries are included in Markdown and JSON exports.
- **Chat** with New session, Pinned sessions, and Chat sessions in the left menu.
  Sessions can be pinned, renamed implicitly from the first message, and deleted.
- **Auto routing**: cheap default model, with escalation for image, document, and
  reasoning requests. Each reply shows which route was used and why.
- **Tasks** with three visible statuses: **Open** (no deadline reached), **Due**
  (deadline reached or passed), and **Completed**. Open a task to see its activity
  timeline. You can add notes, edit the title/due/reminder dates, complete or reopen,
  and delete — each action can carry a note, which is stored with the task history.
  The latest note is shown directly on open and due tasks in the list.
- All date and time entry uses pickers: a month calendar with time steppers on web and
  the native date/time picker on the phone. No typed date fields remain.
- **Manual model picker** in the chat header: Auto or any configured model.
- **Clean answer output**: the generated text is shown in its own block; route details,
  timestamps and controls are in a separate details bar. **Copy answer** copies only the
  generated text, without the wrapper.
- **Message actions**: your messages have **Edit**, **Copy** and **Retry**; answers have
  **Copy answer**, **Read** and **Retry**. Editing or retrying removes the old answer and
  regenerates from fresh history. Local saves and date answers hide Retry so they cannot
  be accidentally saved twice.
- **Local capture routing**: `Note:`, `add task`, and `remind me` messages are handled
  by the deterministic parser on the phone — no API call, no cost.
- **Multi-item messages**: a message with several lines or actions becomes a
  **Suggested actions** review card. The model proposes the breakdown, but all dates
  are resolved on the device and nothing is saved until you tap **Save all**. With no
  API key this still works offline using local line splitting. Question-like lines
  (for example “Which week number?”) stay in chat rather than becoming tasks; an
  explicit `add task` / `remind me` line still opens the review.
- The system prompt includes the device's current date and tells the model it may
  answer date, weekday and week-number questions, but must base every calculation on
  that provided date rather than its own assumed "today".
- Common date questions ("what is the date tomorrow", "which week number", "how many
  weeks in the year") are answered locally from the device clock — no model call, no
  cost, and no chance of an invented date.
- **OpenRouter transport** with streaming responses. Add your key in Settings.
  Without a key, the app still handles capture commands and explains the setup step.
- **Capture screen** with a chat-like input. Type naturally, review a preview, then save.
  - `Note: ...` saves a searchable note.
  - `add task ...` saves a to-do with no deadline.
  - `remind me tomorrow at 9 to ...` saves a to-do with a reminder time.
  - `... by Friday at 5` records a separate deadline.
  - Deadlines and reminders are stored independently.
- **Confirmation before saving**: title is editable, ambiguous hours show a `CHECK TIME`
  tag and an AM/PM toggle, and time can be changed with a native date/time picker.
  The app never claims a reminder was scheduled unless scheduling succeeded.
- **Reminders** via local notifications with **Snooze 10 min** and **Got it** actions
  on supported phones.
- **Calendar**: chose a writable calendar in Settings and optionally add a timed
  reminder to it.
- **Read** button on notes and chat replies (text-to-speech, only when tapped).
- **Export**: Markdown export for OpenCode and a full JSON backup.
- **Daily review**: local notification at a chosen time; the review itself is built
  on the phone and works offline.
- **Memory**: a simple, editable key/value store for preferences and style.
- **Storage**: SQLite on the phone; nothing leaves the device in Phase 1.

## Run it

```bash
npm install
npm start
```

Scan the QR with **Expo Go** (Android) or open in Camera on iPhone.
For a browser preview only: `npm run web`. Web uses a localStorage adapter because
expo-sqlite's synchronous API needs cross-origin isolation in browsers. The phone
always uses real SQLite.

Open **Settings → AI & routing** and paste your OpenRouter API key. The key is stored
on the device. For a shared or backed-up phone, point the base URL at your own proxy
instead.

### Free and Pro modes

The chat header has **Free** and **Pro** buttons. Both use the same routing rules, but
keep separate model choices:

- **Free** — `openrouter/free` for ordinary chat, `nvidia/nemotron-3-ultra-550b-a55b:free`
  for reasoning, `inclusionai/ling-3.2-flash:free` for documents. There are **no free
  image or video models** on OpenRouter, so those requests are reported honestly.
- **Pro** — the configured paid models below.

The manual model picker and Settings model choices are scoped to the active mode.

Routing models (all verified against OpenRouter's public model list):

- Default / cheap: `tencent/hy4-flash`, `deepseek/deepseek-v4.1-flash-1017`,
  `nvidia/nemotron-3-ultra-550b-a55b:free`
- General: `openai/gpt-6-luna`
- Strong / documents: `anthropic/claude-opus-5.5`
- Image: `google/gemini-3.1-flash-lite-image`, `google/gemini-3.1-flash-image`,
  `google/gemini-3-pro-image`, `openai/gpt-5-image-mini`

Video model IDs such as `heygen/heygen-video-1`, `bytedance/seedance-2.5` and
`qwen/qwen-image-3-pro` are not on OpenRouter's public API. There is an optional
video model field in Settings for a provider you control; without it, video requests
are reported honestly instead of pretending to work.

Quality checks:

```bash
npm run typecheck
npm test
```

## Phone test checklist — do this before trusting the app

1. Open Settings → **Allow notifications** → **Send test reminder**.
   Confirm it appears with the screen locked, and that **Snooze** and **Got it** work.
2. Open Settings → **Allow calendar access** and choose the calendar you actually use.
3. Capture `remind me in 2 minutes to test the remind flow`, save, lock the phone,
   and wait for the notification.
4. Capture `add task order filters` — confirm it appears under Tasks with **no** deadline.
5. Capture `Note: ask about bulk pricing` — confirm it appears under Notes and search finds it.
6. Capture `add task finish quote by Friday at 5, remind me Thursday afternoon` —
   confirm the deadline and reminder are different and both are shown correctly.
7. Try `remind me tomorrow at 9` — confirm the `CHECK TIME` tag and AM/PM toggle.
8. Use **Export chat as Markdown** and check the file opens in your target tool.
9. If the app is killed and reopened, confirm notes and tasks are still there.
10. In Chat, open the left menu: create a session, pin it, switch sessions, delete one.
11. Send `remind me tomorrow at 9 to call` in Chat and confirm the `capture` route badge
    and that no API key is needed.
12. After adding a key, send an ordinary question and confirm a streamed reply with a
    route badge. Then use the Model button to pick a model manually and confirm the
    `manual` badge.
13. In Chat, tap **Copy answer** and paste somewhere. Confirm you get only the answer
    text, with no route details or labels.
14. In Diary, tap **New entry** and record something with `diary:`. Review the cleaned
    text, save it, then ask “what happened with …?” in Chat and confirm the entry is found.

## Online and phone deployment

The app still works fully offline. The online layer is scaffolding that is ready once
you add your own accounts:

1. **Supabase** — create a project, run `supabase/schema.sql` in its SQL editor. If an
   earlier attempt failed with a `text`/`uuid` foreign-key error, run
   `supabase/repair-user-keys.sql` first and then rerun `supabase/schema.sql`. Then
   deploy `supabase/functions/chat` with:
   - `OPENROUTER_API_KEY` = your OpenRouter key (server-only)
   - `ORM_MONTHLY_CAP_USD` = monthly spend limit (default `5`)
   - `SUPABASE_URL` and `SUPABASE_ANON_KEY` are provided automatically by Supabase.
2. **Environment** — copy `.env.example` to `.env.local` and fill in
   `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
3. **Sign in** — Settings → Cloud account → email magic link. When signed in, AI calls
   go through the Edge Function, so no API key is stored on the device.
4. **Backup** — Settings → Cloud account → Upload backup / Download from cloud. This is
   a full snapshot replace, not live row-by-row sync. The newest upload wins, so upload
   before switching devices.
5. **Web** — Cloudflare Pages is the recommended target: a static export needs no
   server-side functions there, and the free tier has no bandwidth cap or commercial-use
   restriction. `npm run build:web` produces `dist/`. Then run `npx wrangler login` once
   and `npm run deploy:web` to upload. Alternatively deploy `dist/` from a Git repo or
   to Vercel/Netlify.
6. **Phone** — `npm run build:android` or `npm run build:ios` uses EAS. Android needs an
   Expo account; iOS also needs an Apple Developer account. Install the resulting build
   directly for personal use; app-store submission is separate.

Nothing online is active until steps 1–2 are completed. Without them the app behaves
exactly as before: local SQLite on the phone and localStorage in the browser.

## Browser preview data

The browser preview stores data in `localStorage` **per browser and profile**. Chrome
and the in-app browser therefore hold separate, unrelated copies — that is why task
counts differ between them. This is by design for local testing; the app on your phone
uses one SQLite database. Use **Settings → Data → Full backup (JSON)** to move data
between browsers if you need to.

## Known limits

- The API key is stored on the device, not behind a server proxy yet.
- Image and document requests select the right model, but output is still plain chat
  text; file generation is not implemented yet.
- No public OpenRouter video model is available, so video requests need a custom provider.
- No cloud sync. Export a backup regularly.
- Notification actions depend on the phone OS; Focus / Do Not Disturb can still hide alerts.
- SMS is not implemented (costs money and needs a phone-number flow).
- On iOS, write-only calendar access may limit calendar selection to a virtual calendar.

## Next

1. Move the API key behind a small Supabase Edge Function and add a monthly spend cap.
2. Turn image/document routes into real generated files.
3. On-demand and end-of-day AI summaries, with the existing offline review as fallback.
4. Export formats tuned for OpenCode and other external tools.
