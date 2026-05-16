# Danka Game — Prototype 5.0 Deployment Ready

This version is based on the stable Prototype 4.3 UI and is prepared for online deployment.

## What changed in 5.0

- Frontend can connect to an online backend using `VITE_SERVER_URL`.
- Backend supports hosted CORS configuration using `CLIENT_ORIGIN`.
- Local testing still works using `localhost`.

## Local run

Open two terminals.

### Backend

```bash
cd server
npm install
npm run dev
```

### Frontend

```bash
cd client
npm install
npm run dev
```

Open:

```txt
http://localhost:5173
```

## Deployment notes

Backend hosting will use the `server` folder.
Frontend hosting will use the `client` folder.

Frontend environment variable required for online deployment:

```txt
VITE_SERVER_URL=https://YOUR-BACKEND-URL
```

Backend environment variable for early testing:

```txt
CLIENT_ORIGIN=*
```
