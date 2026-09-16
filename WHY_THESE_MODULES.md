# Why We Have These Four Modules (Plain-Language Guide)

You already understand the QuickBooks part. This doc explains the other
three — `organizations`, `providers`, and `records` — in plain language,
with one running example. For the deep technical version (every table,
every column, every foreign key), see `SPEND_ANALYTICS_SCHEMA.md`. This one
is just "why do these exist and what does each one actually do."

---

## Think of it like a translator's office

Imagine Ordaraa is a translator's office.

- A **client** walks in. That's a business — a restaurant, say.
- The client gets their mail from different **postal services**, in
  different languages — QuickBooks writes in "QuickBooks language," Xero
  writes in "Xero language."
- The office keeps an exact photocopy of every letter, in whatever language
  it arrived in — untouched, unedited.
- Then a **translator** rewrites each letter into one shared, plain
  language — the same language, no matter which postal service the letter
  came from.
- Everyone else in the office — the accountant, the manager, the person who
  writes the "you're spending too much on flour" report — only ever reads
  the translated version. Nobody downstream has to know French from Spanish.

That's the whole system. Now map it onto the four modules:

| In the analogy | In the code |
|---|---|
| The client | `organizations` |
| Which postal service is connected, and the mailbox key | `providers` |
| The exact photocopy of the original letter | `quickbooks` (you know this one) |
| The translated, shared-language version everyone actually reads | `records` |

## Why `organizations` exists

**In one sentence:** it's *who the data belongs to*.

Every business that signs up for Ordaraa is one "organization" — a
restaurant, a shop, whoever. Every single piece of data anywhere in this
system — every vendor, every bill, every dollar amount — has to answer the
question "whose data is this?" That's what `organizations` is for. It's
deliberately the simplest module of the four — right now it's just a name
and nothing else — because its only job is to exist as the anchor that
every other table points back to, so one business's numbers can never get
mixed up with another business's numbers.

**Why it had to be built now, even though nobody asked for it directly:**
every table we built needs to say "this row belongs to this business." That
requires something for it to point at. There was nothing like that in the
codebase yet, so we added the smallest possible version of it.

## Why `providers` exists

**In one sentence:** it's the "which mailbox, and the key to it" — kept
separate from any one postal service.

Right now, the only postal service Ordaraa talks to is QuickBooks. But the
plan is Xero and Zoho later. If we only ever built "the QuickBooks
connection," then adding Xero would mean inventing a second, parallel way to
track "are we connected, what are the login tokens, when do they expire" —
and a third for Zoho, and so on. Instead, `providers` is the one shared
place that tracks:

- which business is connected to which accounting software,
- the login tokens for that connection (kept encrypted, like a locked
  mailbox key — even if someone stole a copy of the database, they couldn't
  read the tokens without also knowing the encryption key),
- and a bookmark of "how far we've synced so far," so the next sync only
  pulls what's new instead of re-downloading everything every time.

**Why it's a separate module and not just part of `quickbooks`:** because
none of this — "is there a connection," "what are the tokens," "how far
have we synced" — is actually QuickBooks-specific. Xero needs the exact same
three things. Building it once, generically, means adding Xero later is
"write a new translator," not "rebuild the mailbox system from scratch."

## Why `records` exists

**In one sentence:** it's the shared language everyone in the office
actually reads.

This is the one that matters most for the product. Everything Ordaraa is
supposed to do — show a dashboard, notice "your supplier raised prices,"
answer a question in the "Ask Ordaraa" chat — needs to read *one* consistent
shape of data. It can't be "if this business uses QuickBooks, read the data
one way, but if they use Xero, read it a different way." That would mean
rewriting the dashboard, the findings, and the chat assistant every time we
add a new accounting provider.

So `records` holds the translated version: a generic "Vendor," a generic
"expense," a generic "tax rate" — with all the QuickBooks-specific (or
Xero-specific) quirks already stripped out. This is the *only* place the
rest of the app is allowed to read from. When Xero support gets built, it
gets its own "photocopy" layer like `quickbooks` has, plus its own
translator — but it writes into these same `records` tables, so the
dashboard doesn't change at all.

## Walking through one real example

Say Riverside Bistro connects their QuickBooks account, and QuickBooks has a
bill: they bought flour from ABC Supplies for $50.

1. **`organizations`** already has a row for "Riverside Bistro." Everything
   below will be tagged as belonging to this one row.
2. **`providers`** has a row saying "Riverside Bistro ↔ QuickBooks, here are
   the (encrypted) login tokens, last synced 10 minutes ago."
3. **`quickbooks`** stores an exact photocopy of that bill, exactly as
   QuickBooks sent it — same field names, same structure, nothing changed.
   This is your safety net: if we ever find we mis-read something, the
   original is still sitting there untouched.
4. The **translator** (called "the mapper" in the code) reads that
   photocopy and writes a translated version.
5. **`records`** ends up with: a "Vendor" row for ABC Supplies (if it didn't
   already exist), and an "expense" row for $50 of flour — tagged as
   belonging to Riverside Bistro, and tagged "this came from QuickBooks,
   here's the QuickBooks bill it matches" (so we can always trace it back).
6. The dashboard, the findings engine, and "Ask Ordaraa" only ever look at
   step 5 — the translated version. They never touch QuickBooks' original
   language at all.

If Riverside Bistro later also connects Xero, the exact same five steps
happen again, just with a Xero photocopy and a Xero translator — landing in
the *same* `records` tables, sitting right alongside the QuickBooks data,
looking identical to anything downstream.

## The one-line summary of each module

| Module | Its one job |
|---|---|
| `organizations` | Says whose data this is |
| `providers` | Tracks which accounting software is connected, and the login keys to it |
| `quickbooks` | Keeps an exact, untranslated photocopy of everything QuickBooks sends |
| `records` | Holds the translated, shared-language version everything else in the app reads |
