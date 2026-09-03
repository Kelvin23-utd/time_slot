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

Click the faint **Admin** link at the bottom of the page and enter the admin password. You get a heat-map of every slot, a star on any slot that everyone picked (people with zero picks are not counted), and a ranked list of the most popular slots.

## Configuration

`DATES` in `index.html` is currently **empty on purpose**: the page shows a "No dates have been set up yet" notice and the Book button is disabled until you fill in the next booking window.

Dates and hours live in **two places and must match**:

- `index.html`: `DATES` and `HOURS` near the top of the `<script>` block.
- `Code.gs`: `DATES` and `HOURS` at the top of the file.

The backend only stores slots whose id (`YYYY-MM-DD_HH`) appears in its own `DATES`/`HOURS`, so after changing them you must redeploy the Apps Script **and** run `initSheet()` once so the sheet gets the new header columns (or `resetSheet()` to also wipe old bookings).

## Deploying the backend (Google Apps Script)

1. Create a Google Sheet.
2. Add a sheet tab named `Config` with two columns: `admin_password` in A1 and the password in B1.
3. Extensions → Apps Script. Paste `Code.gs`, save.
4. Run `initSheet()` once from the editor (authorize when prompted). This creates the `Availability` tab with the header row.
5. Deploy → New deployment → Web app. Execute as **Me**, access **Anyone**. Copy the web-app URL.
6. Paste that URL into `SCRIPT_URL` in `index.html`.

Every code change to `Code.gs` needs a new deployment version (Deploy → Manage deployments → Edit → New version) before the live site sees it.

## API (unchanged from the original QE scheduler)

All calls are `POST` with a JSON body `{ "action": ..., ... }` and `Content-Type: text/plain`.

| action             | body                        | auth            | returns                          |
|--------------------|-----------------------------|-----------------|----------------------------------|
| `getAllPublic`     |                             | none            | `{ professors: [{name, slots}] }` |
| `saveAvailability` | `name`, `slots: {id: 0/1}`  | none            | `{ success }`                    |
| `getAll`           | `password`                  | admin password  | `{ professors: [{name, slots}] }` |
| `login`            | `role`, `password`          | admin password  | `{ success, role }`              |

The response key is still called `professors` so an already-deployed backend keeps working with the new front end.

## Sheet layout

`Availability` tab: column A = name, columns B onward = one column per slot id (`2026-04-10_09`, ...), cell value `1` = picked. One row per person; names are matched case-insensitively.
