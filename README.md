# time_slot

A one-page time-slot booking site. Guests type their name, click the times that work for them, and press **Book**. Everyone can see how many people picked each slot; an admin password unlocks a heat-map of all bookings plus a "most popular slots" list.

Front end: a single static `index.html` (host it anywhere, e.g. GitHub Pages).
Back end: `Code.gs`, a Google Apps Script web app that stores bookings in a Google Sheet.

## How guests use it

1. Open the page.
2. Type your name in the box at the top.
3. Click (or drag across) the time slots that work for you; on a phone, tap them. Green = your picks. A small number in a cell is how many other people picked it; hover or tap a cell to see their names.
4. Press **Book**.

Come back with the same name to change your booking: your previous picks load automatically. Booking with no slots selected clears your booking. Slots are not exclusive: several people may pick the same one.

## Admin view

Click the faint **Admin** link at the bottom of the page and enter the admin password. You get a heat-map of every slot, a star on any slot that everyone picked (people with no picks in the current dates are not counted), and a ranked list of the most popular slots.

## Changing the dates

Edit `DATES` (and `HOURS` if needed) near the top of the `<script>` block in `index.html`, then push. That is the only place dates live: the backend adds sheet columns for new slot ids automatically on the first booking. Current window: weekdays Sep 4 to Sep 18, 2026, 9 AM to 5 PM.

Leave `DATES` empty to close booking; the page then shows a "No dates have been set up yet" notice with the Book button disabled.

Old date columns stay in the sheet (harmless, the page ignores them). To wipe everything, run `resetSheet()` in the Apps Script editor.

## Deploying the backend (Google Apps Script)

1. Create a Google Sheet.
2. Add a sheet tab named `Config` with `admin_password` in A1 and the password in B1.
3. Extensions → Apps Script. Paste `Code.gs`, save.
4. Run `initSheet()` once from the editor (authorize when prompted). This creates the `Availability` tab with `Name` in A1.
5. Deploy → New deployment → Web app. Execute as **Me**, access **Anyone**. Copy the web-app URL.
6. Paste that URL into `SCRIPT_URL` in `index.html`.

Every code change to `Code.gs` needs a new deployment version (Deploy → Manage deployments → Edit → New version) before the live site sees it. Opening the web-app URL in a browser returns `{"ok":true,"version":2}` when the current backend is live.

### Upgrading from the v1 backend

The page refuses to take bookings from the old backend (it hardcoded its own dates and silently dropped anything else) and shows "Booking is not open yet" until v2 is deployed. To upgrade: paste the new `Code.gs` over the old one, save, then Deploy → Manage deployments → Edit → New version → Deploy. Optionally run `resetSheet()` to drop the old April columns and rows.

## API

All calls are `POST` with a JSON body `{ "action": ..., ... }` and `Content-Type: text/plain`. Every response includes `"version": 2`.

| action             | body                        | auth            | returns                                        |
|--------------------|-----------------------------|-----------------|------------------------------------------------|
| `getAllPublic`     |                             | none            | `{ slotIds, professors: [{name, slots}] }`      |
| `saveAvailability` | `name`, `slots: {id: 0/1}`  | none            | `{ success }`                                  |
| `getAll`           | `password`                  | admin password  | `{ slotIds, professors: [{name, slots}] }`      |
| `getAvailability`  | `name`                      | none            | `{ slots }` (only the 1s)                      |
| `login`            | `role`, `password`          | admin password  | `{ success, role }`                            |

Slot ids look like `2026-09-04_09` (date, underscore, start hour). Ids that do not match that shape are ignored. The people list is still keyed `professors`, a leftover from v1, so the page and backend can be updated independently.

## Sheet layout

`Availability` tab: column A = name, columns B onward = one column per slot id, cell value `1` = picked. One row per person; names are matched case-insensitively. A person's row is rewritten in full on every booking, so it always equals what they last sent.
