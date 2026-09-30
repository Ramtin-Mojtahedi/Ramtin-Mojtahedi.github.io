# LinkedIn feed: connection and operating boundary

The website now accepts original LinkedIn embeds or a connected personal-profile
feed widget. It no longer renders rewritten research headlines, summaries, or
profile-photo substitutes as news. Existing publication records are untouched.

## Current state

- The public personal LinkedIn activity feed could not be accessed.
- No original post or widget connection has been verified or imported.
- `items` is empty; the website displays a direct LinkedIn link, not a fake feed.
- Previous curated news is preserved verbatim in `_data/news_archive.json`.
- A five-minute browser refresh only refreshes `/news.json`; it does NOT discover
  new LinkedIn posts. Eight-second rotation only rotates verified native embeds.

## One-time automatic-feed connection (not per-post maintenance)

SociableKIT documents a **LinkedIn Profile Posts** widget with carousel layout,
automatic syncing on paid plans, and manual syncing on its free plan:
https://www.sociablekit.com/linkedin-profile-posts-widget/

The owner must create or authorize their own widget. No account, subscription,
trial, payment, or private authentication has been created by this change.
Use the existing profile https://www.linkedin.com/in/ramtin-mojtahedi/ as the only
source, choose a single-column carousel with original media and full post text,
disable character limits/rewriting, and review its actual preview against LinkedIn.
Set newest-first ordering and enable automatic sync in the service. Confirm its
current price and sync cadence before purchasing; do not promise real-time sync.

Provide the service's actual generated **iframe embed code** once. Do not provide
passwords, session cookies, OAuth secrets, or tokens. After inspecting that exact
widget, set `_data/news.json` -> `widget` to an object with these fields:
- provider: sociablekit
- author_profile: the exact profile URL above
- embed_url: the real HTTPS iframe URL from widgets.sociablekit.com under
  /linkedin-profile-posts/ (not an invented id or a public demo)
- verified: true only after confirming ownership and the actual rendered feed
- original_content: true only after comparing full text and original media

The renderer embeds that one widget; the provider, not a search-based task,
collects subsequent posts. Its own carousel controls layout and rotation.
Nothing is connected until the real widget exists and the source is verified.

## Native full-post embeds (supported, not an automatic profile feed)

For public personal posts that have been directly verified, `items` accepts:
`kind=linkedin-embed`, stable `id`, exact `author_profile`, exact `source_url`,
exact LinkedIn-provided full `embed_url`, verified ISO `published_at`,
`source_verified=true`, `embed_verified=true`, `embed_full=true`.
No summary, substitute headline, or image fallback is used. IDs and embed URLs
must come from the actual post and its **Embed full post** code, never guessed.
Use published_at from the original source; do not fabricate a date from search
snippets or a numeric id. Latest verified posts are sorted first.

Official embedding instructions and format limitations:
https://www.linkedin.com/help/linkedin/answer/a529065
https://www.linkedin.com/help/linkedin/answer/a7486069

Cross-origin LinkedIn embeds own the text and media. Visitors can scroll within
the compact frame and open the complete original post. Multi-photo posts and
reposts with commentary may not support native embedding. Never substitute
another format or image and call it exact. Deleted/private/unavailable posts
must not be copied around the restriction.

## Tests and validation

The browser test uses clearly labelled local fixtures (never published as user
posts) to test empty state, rejection of rewritten/forged entries, native-embed
source fidelity, ordering, controls, reduced motion, external-widget safeguards,
responsive layout, and failed-feed fallback. Fixture success is NOT proof of
live LinkedIn access or a working user widget. Verify the public source separately.
