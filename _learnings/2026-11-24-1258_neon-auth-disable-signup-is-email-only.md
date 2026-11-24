# Neon Auth's "disable sign-up" closes only email and password; Google sign-in stays open to anyone

**Symptom:** nemeceren had "sign-up closed" since 2026-09-29 (DECISIONS.md #52), and the app showed no Google button. It looked as if nobody could create an account.

**Cause:** the setting lives in the email/password config only, and Neon turns Google on by default with its shared credentials. Checked 2026-11-24:

```
$ neon neon-auth oauth-provider list --project-id aged-violet-98333413 --output json   (secrets filtered out)
{'id': 'google', 'type': 'shared'}

$ neon neon-auth config email-password get --project-id aged-violet-98333413 --output json
{ "enabled": true, ..., "disable_sign_up": true, ... }
```

Neon's docs (Authentication flow page): "Anyone can sign up for your application by default. Support for restricted signups is coming soon." The CLI has no sign-up switch for OAuth providers (`oauth-provider add/update` take only the provider id, client id and secret).

**Consequences:**
- Anyone who calls the auth server's Google flow gets a login (name, email, picture, Google id, sessions with IP addresses) whether the app shows a button or not. Only the API decides what such an account may do: in nemeceren first the allowlist (403), since #118 the usage and row limits.
- Sign-ins and session checks go straight to Neon Auth, whose tables live in the project's own database (`neon_auth` schema), so they wake the compute and no API-side limit counts them. Watch the monthly CU-hours (`compute_time_seconds` / 3600) when an app is open to strangers.
- For a new Neon Auth app that must stay closed: gate in the API, and consider removing the Google provider (`neon neon-auth oauth-provider delete`) if it isn't used.
