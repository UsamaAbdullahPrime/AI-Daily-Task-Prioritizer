# Frontend (static HTML/CSS/JS)

`index.html`, `style.css`, `script.js` — no build step, no framework.

`script.js` calls the API with relative paths (e.g. `/api/tasks`), so it
expects to be served from the same origin as the Flask backend.

## Easiest option
Copy these three files into `backend/static/` and run the Flask app as
before — it'll serve this frontend at `/`.

## Standalone option
To host this separately from the backend (e.g. on Netlify/Vercel/GitHub
Pages) while the backend runs elsewhere, open `script.js` and change the
`API` constant near the top from a relative path to the backend's full URL,
e.g.:

```js
const API = "https://your-backend-host.com/api";
```

and enable CORS on the Flask backend (`pip install flask-cors`, then
`from flask_cors import CORS; CORS(app)`).
