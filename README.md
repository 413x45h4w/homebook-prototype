# Homebook

Homebook is a portable knowledge base for people who pay high-trust service providers to work in their apartment: a cleaner, a dog walker, a piano teacher, a plumber. The customer keeps one household file. An instruction given to one provider carries over to the next provider of the same kind, and house-wide notes (the door code, the Wi-Fi, what not to touch) go to everyone.

Service providers get a day of jobs on a map, travel time between stops, scheduling that can be low-touch or negotiated in a thread, and a way to request payment.

This repository is a clickable front-end prototype. There is no backend. Mock data lives in [`src/data/seed.json`](src/data/seed.json). Anything you change is stored in `localStorage` in this browser.

The hosted demo is [https://413x45h4w.github.io/homebook-prototype/](https://413x45h4w.github.io/homebook-prototype/). Routing is hash-based (`/#/knowledge`, `/#/packet/dog_walker`) so deep links work on GitHub Pages.

## Run it

```bash
npm install
npm run dev
```

Open [http://localhost:5173/homebook-prototype/](http://localhost:5173/homebook-prototype/). The `/homebook-prototype/` base path matches the GitHub Pages project site.

```bash
npm run build
npm run preview
```

The production preview is [http://localhost:4173/homebook-prototype/](http://localhost:4173/homebook-prototype/).

**Switch persona** (Alex the customer, or Maria, Jordan, Sam, or Lena) and **Reset demo data** are in the header on every screen. Reset restores the seeded apartment and clears notes, messages, bookings, and photos you added.

## What’s in the demo

Alex Chen lives at 412 West 22nd Street, Apt 4B, Chelsea. The household file has 20 notes and a few illustrated photos (the lockbox, Miso’s harness, the espresso machine, the fiddle leaf, the vacuum, the piano).

| Person | Role | Why they’re here |
| --- | --- | --- |
| Maria Alvarez | Cleaner | Current cleaner. Feedback themes include “Missed under the bed” twice. |
| Jordan Hale | Dog walker | Current walker. Today’s route has a travel conflict. |
| Sam Okonkwo | Dog walker, past | The feeding rule was written in Sam’s thread and still applies to every walker. |
| Lena Petrov | Piano teacher | Thursday lessons. She has already proposed two other times. |

Other stops on the providers’ maps (Priya in Greenpoint, Maya in Brooklyn Heights, Ruth on the Upper West Side, and others) exist so a day has more than one address. Only Alex has a full knowledge base.

## Customer walkthrough

1. **Home.** Upcoming visits, the size of the house file, and a shortcut into the dog-walker packet.
2. **Knowledge base** (`/#/knowledge`). Filter by room or by who should see a note. Open **How to run the laundry**. The “Why relevant” chip explains that laundry goes to the cleaner, not a dog walker or piano teacher. Open **Quiet hours for 4A**: it mentions the vacuum and Miso, and it still goes to every provider because it is a house rule. Tags can be overridden; **Use suggestion** puts the guess back.
3. **Per kind of work** (`/#/packet/dog_walker`). Everything a new dog walker would receive: Miso, feeding, the evening pill, plus door, Wi-Fi, and the other universal notes. Sam was sent an earlier packet; feeding and the pill were added later, from messages.
4. **Share with new provider** (`/#/share`). Pick a kind, read the preview, and send it. The send is mocked and shows up under “Already shared”.
5. **Export / print** (`/#/export`). Download `homebook-alex.json` or print the page.
6. **Notes and photos.** **Add a note** files a new instruction. Relevance updates as you type — try a general note that says “the faucet leaks” and watch it tag the plumber. **Add a photo** uses the file picker (camera or library on a phone). The picture is shown from an object URL while it is resized, then stored as a JPEG data URL in `localStorage`. Each photo has an annotation, for example “This is where the vacuum lives.”
7. **Messages** (`/#/messages/thread-jordan`). Alex’s line “Please always text me if she refuses the harness…” has not been filed yet. The offer says why it looks like an instruction. Saving it toasts **Instruction saved to knowledge base** and links the message to the new note. Search (`/#/search?q=harness`) finds both.
8. **Feedback.** Open Maria’s profile (`/#/providers/sp-maria`). Themes are counted across visits (“Missed under the bed · 2 visits”). Open a completed visit to add or update a rating.
9. **Book.** Maria’s calendar (`/#/book/sp-maria`) has open mornings. Confirming a slot creates the visit and an **Add to Google Calendar** link (`calendar.google.com`). A slot that doesn’t leave enough travel time explains why and can be **requested anyway**, which becomes a message the provider accepts or answers with other times.
10. **Reschedule.** On an upcoming visit, **Request reschedule** posts into the thread. The provider proposes times; accepting one moves the visit. Lena has already proposed two Thursday options in her thread, so that half of the flow is visible immediately.

## Provider walkthrough

Switch persona to **Jordan Hale**.

1. **Today** (`/#/sp`). Numbered stops on a Leaflet map with OpenStreetMap tiles. Between Alex in Chelsea and Priya in Greenpoint the gap is shorter than the estimate, so the leg is flagged. Legs that fit say so. **Open route in Google Maps** builds a `google.com/maps/dir` link for the day’s stops.
2. Travel time is haversine distance × 15 km/h, plus 5 minutes to get in the building. It is not live traffic. The place to swap in the Google Maps Distance Matrix API is marked in [`src/lib/travel.ts`](src/lib/travel.ts) (`GOOGLE_DISTANCE_MATRIX`). The prototype never calls Google.
3. **Week** shows the same conflicts across seven days.
4. **A job** (`/#/visits/...`) opens the client’s packet before the work: dog notes plus universal notes for Alex, or a one-line access note for anyone else. **Request payment** reveals a Venmo link (`venmo.com/<handle>?txn=pay&amount=…&note=…`) and the Zelle email or phone with copy. **Mark paid** / **Mark unpaid** is local mock state. On Alex’s packet, **Suggest a knowledge-base note** sends a title, a topic, and the note (or a dictation) to Alex. It stays pending until Alex approves it.
5. **Inbox.** Jordan has a pending request for an extra evening walk (so the pill happens). Accept it, or send other open times. Alex can accept those from the customer side.
6. Switch to **Maria** to see her own conflict (Brooklyn Heights → Upper West Side) and her unpaid visits. Switch to **Sam** to see a past provider with history and no booking calendar. Switch to **Lena** for Thursday lessons.

Alex reviews suggestions at **Pending from providers** (`/#/knowledge/proposals`), also linked from the knowledge base and badged on File. Approve publishes the note with “Contributed by” the provider. You can edit the wording first. Request changes sends it back. Decline leaves the file untouched. Every step stays in the suggestion’s history.

## Voice notes

On **Add a note** (`/#/knowledge/new`) and on a provider or visit, **Record memo** captures audio in the browser and, where the browser supports it (Chrome, Edge, Safari), fills the transcript live with the Web Speech API. **Upload voice memo** takes an m4a, mp3, wav, or webm file, including an iPhone Voice Memo. If live captions aren’t available (Firefox, or a blocked microphone), **Transcribe on this device** runs Whisper Tiny in the browser via Transformers.js. The model downloads once from Hugging Face; nothing is sent to a paid API. You edit the transcript, pick the provider, and optionally add a rating or category. The clip stays in this browser (IndexedDB) with a play button, and the note is marked Voice on that provider’s page. Notes are append-only.

Memos longer than about 10 minutes are transcribed only through the first 10. The first model download is roughly 40 MB.

## App feedback

A **Feedback** tab sits on the edge of every screen, including dialogs. On a phone in portrait it opens as a full-width sheet, and the note and Send stay in view when the keyboard is up. Testers do not sign in. A note is stored in Supabase with the flow and step. If the network fails, it stays in an outbox on this device and is sent later. Reviewers open **App feedback** in the sidebar, or `/#/review`, sign in, and approve or disapprove. Decisions are new rows, not edits. Notes saved in the browser before this change are sent automatically on the next visit, with no sign-in. The review screen still has Upload my local tickets for a reviewer.

## How relevance is guessed

[`src/lib/classify.ts`](src/lib/classify.ts) is a small classifier:

- Apartment access, Wi-Fi, emergency contacts, and do-not-touch notes go to **all providers**, even if the wording mentions a dog or a vacuum.
- Pets go to the dog walker and the pet sitter. Laundry, kitchen, and plants go to the cleaner. Piano goes to the piano teacher.
- A general note is narrowed by keywords (“leash”, “faucet”, “piano”). If it doesn’t name a trade, everyone gets it.
- The “Why relevant” chip lists the category and the keywords it used. Overriding the tags replaces that guess until you ask for it back.

Instruction detection in [`src/lib/instructions.ts`](src/lib/instructions.ts) looks for “please”, “always”, “don’t”, and a few imperatives. Scheduling talk (“can we move Thursday”, a booking proposal) is not treated as a household instruction.

## GitHub Pages

[`.github/workflows/pages.yml`](.github/workflows/pages.yml) builds on every push to `main` and deploys with `actions/deploy-pages`. The Vite `base` is `/homebook-prototype/`.

In the repository settings, **Settings → Pages → Build and deployment → Source** must be **GitHub Actions**. If that source is still “Deploy from a branch”, the workflow can succeed and the site will not update.
