# Frontend (static HTML/CSS/JS)

`index.html`, `style.css`, `script.js` — no build step, no framework.

## Deadline countdown

The "Deadline" field is now a date picker (not a day number). The task
table shows the real deadline date plus a live countdown badge ("3 days
left", "Due today", "Overdue by 2 days") sourced from the backend's
`days_left` / `countdown_label` fields. `script.js` re-fetches tasks every
60 seconds (`setInterval(loadTasks, 60 * 1000)`) so the countdown stays
correct automatically — e.g. if the tab is left open past midnight — with
no manual refresh needed.

`script.js` calls the API with relative paths (e.g. `/api/tasks`), so it
expects to be served from the same origin as the Flask backend.

## Easiest option
Copy these three files into `backend/static/` and run the Flask app —
it'll serve this frontend at `/`.

## Standalone option
To host separately from the backend, change the `API` constant near the
top of `script.js` from a relative path to the backend's full URL:

```js
const API = "https://your-backend-host.com/api";
```

and enable CORS on the Flask backend (`pip install flask-cors`, then
`from flask_cors import CORS; CORS(app)`).