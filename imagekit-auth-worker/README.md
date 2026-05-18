# ImageKit Auth Worker

This Cloudflare Worker signs ImageKit uploads and deletes replaced/removed images without Firebase Functions or the Firebase Blaze plan.

The React app sends the signed-in user's Firebase ID token to this Worker. The Worker reads the pack through Firestore REST with that token and only allows image operations when the user owns the question pack.

The app stores unused upload-auth responses in `sessionStorage` for the active browser session and clears them on logout. ImageKit upload tokens are short-lived and single-use, so the app consumes a cached response before an upload attempt instead of reusing it after ImageKit has seen it.

## Requirements

- A Cloudflare account with Workers enabled.
- An ImageKit account.
- Your Firebase project id.
- Node.js and npm available locally.

## 1. Get ImageKit Values

In ImageKit, open **Developer options** and copy:

- Public key
- Private key
- URL endpoint

The Worker stores these values as Cloudflare secrets. Do not put the private key in the React app.

## 2. Install Wrangler

Install Cloudflare's Worker CLI:

```sh
npm install --global wrangler
```

Sign in:

```sh
wrangler login
```

## 3. Create Worker Config

Create `imagekit-auth-worker/wrangler.toml`:

```toml
name = "team-quiz-imagekit-auth"
main = "worker.js"
compatibility_date = "2026-05-18"
```

You can choose a different `name`; it affects the deployed Worker URL.

## 4. Add Secrets

Run these commands from `imagekit-auth-worker/`:

```sh
wrangler secret put IMAGEKIT_PUBLIC_KEY
wrangler secret put IMAGEKIT_PRIVATE_KEY
wrangler secret put IMAGEKIT_URL_ENDPOINT
wrangler secret put FIREBASE_PROJECT_ID
```

Use your Firebase project id for `FIREBASE_PROJECT_ID`, for example:

```text
team-quiz-345fb
```

## 5. Deploy

Deploy the Worker:

```sh
wrangler deploy
```

Wrangler prints the deployed URL, usually like:

```text
https://team-quiz-imagekit-auth.<your-subdomain>.workers.dev
```

## 6. Configure The React App

Add the Worker URL to `.env.local` in the repo root:

```env
VITE_IMAGEKIT_AUTH_ENDPOINT=https://team-quiz-imagekit-auth.<your-subdomain>.workers.dev
```

Include `https://` in the endpoint URL. The app also normalizes bare hostnames, but using the full URL avoids confusing localhost-relative requests during development.

Restart the Vite dev server after changing `.env.local`.

## 7. Verify

1. Sign in to the app.
2. Open a question pack that you own.
3. Attach an image to a question or answer.
4. Save the pack.
5. Confirm the file appears in ImageKit under `/TeamQuiz`.
6. Replace or remove the image and save again.

Uploaded file names use:

```text
{packId}-{timestamp}.{ext}
```

## Troubleshooting

`ImageKit auth endpoint is not configured.`

`VITE_IMAGEKIT_AUTH_ENDPOINT` is missing or the dev server was not restarted after editing `.env.local`.

Auth request goes to `http://localhost:5173/...workers.dev`.

The endpoint was configured as a bare hostname and the running dev server has not picked up the latest code/env. Set `VITE_IMAGEKIT_AUTH_ENDPOINT` to the full `https://...workers.dev` URL and restart Vite.

`Only the question pack owner can manage images.`

The signed-in user does not own the pack, or Firestore denied the Worker request made with that user's Firebase ID token.

`Question pack was not found or cannot be read.`

Check `FIREBASE_PROJECT_ID`, confirm Firestore rules are deployed, and confirm the pack exists in the same Firebase project used by the React app.

`ImageKit upload authorization failed.`

Check the Worker logs:

```sh
wrangler tail
```

Then verify the ImageKit secrets were entered correctly.

`Your requests contains invalid signature parameter.`

The Worker generated a signature, but ImageKit rejected it. Re-enter the ImageKit secrets and redeploy:

```sh
wrangler secret put IMAGEKIT_PUBLIC_KEY
wrangler secret put IMAGEKIT_PRIVATE_KEY
wrangler secret put IMAGEKIT_URL_ENDPOINT
wrangler deploy
```

Use the exact values from ImageKit **Developer options**:

- `IMAGEKIT_PUBLIC_KEY` should be the public key, usually starting with `public_`.
- `IMAGEKIT_PRIVATE_KEY` should be the private key, usually starting with `private_`.
- `IMAGEKIT_URL_ENDPOINT` should be the ImageKit URL endpoint, usually like `https://ik.imagekit.io/<imagekit-id>`.

Do not wrap secret values in quotes when pasting them into `wrangler secret put`. Make sure the public and private key are from the same ImageKit account.
