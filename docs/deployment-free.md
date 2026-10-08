# Free cloud deployment (Hugging Face Spaces + Neon + MongoDB Atlas)

This deploys YieldSense AI to the internet at no cost and without a credit card, using three free services:

| Part | Service | What runs there |
| --- | --- | --- |
| App (web + API in one container) | **Hugging Face Spaces**, Docker, free CPU tier | Nginx serves the React app and forwards `/api` to FastAPI |
| PostgreSQL | **Neon**, free plan | Users, farms, crop records, predictions, tasks, audit |
| MongoDB | **MongoDB Atlas**, free M0 cluster | Uploads, soil tests, caches |

Free tiers change; check each provider's current limits when you sign up. At the time of writing the free Space has 2 vCPU and 16 GB RAM and **goes to sleep after about 48 hours without visitors**: the first visit after that takes 1–2 minutes while it starts.

The same image was tested locally from an empty database: healthy after about 40 seconds, and the browser test passed (38/38 checks, 0 console errors).

---

## Step 1 — PostgreSQL on Neon (5 minutes)

1. Go to **https://neon.tech** → **Sign up** (GitHub or Google sign-in is fastest).
2. Create a project: name `yieldsense`, PostgreSQL version 16 or later, region closest to you (e.g. *AWS Asia Pacific (Singapore)* or *Mumbai* if listed).
3. On the project dashboard click **Connect**. Copy the **connection string**; it looks like
   `postgresql://neondb_owner:xxxx@ep-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`
4. Keep it for Step 4. You don't need to create tables; the app does that on first start.

## Step 2 — MongoDB on Atlas (7 minutes)

1. Go to **https://www.mongodb.com/cloud/atlas/register** → sign up.
2. Create a cluster → choose **M0 (Free)**, any provider, a nearby region → **Create**.
3. **Security quickstart:**
   - *Database user:* username `yieldsense`, click **Autogenerate secure password**, **copy the password**, then **Create user**.
   - *Network access:* add **`0.0.0.0/0`** (allow access from anywhere). Hugging Face doesn't have fixed IP addresses, so this is required; the database is still protected by the user and password.
4. **Connect** → **Drivers** → copy the connection string, e.g.
   `mongodb+srv://yieldsense:<db_password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`
5. Replace `<db_password>` with the password you copied. If the password contains `@ : / ? #`, autogenerate a new one without symbols.

## Step 3 — Hugging Face account and token (3 minutes)

1. Go to **https://huggingface.co/join** → sign up and confirm your email.
2. Profile picture → **Settings** → **Access Tokens** → **Create new token** → type **Write** → name `yieldsense-deploy` → **Create** → copy the token (starts with `hf_`).
3. Note your username (shown in the top-right menu).

## Step 4 — Fill in the deployment settings (2 minutes)

In PowerShell, in the project folder:

```powershell
cd "C:\INFOSYS 7.0"
copy deploy\huggingface\space.env.example deploy\huggingface\space.env
notepad deploy\huggingface\space.env
```

Fill in:

```
HF_TOKEN=hf_...                       # from Step 3
HF_SPACE=<your-hf-username>/yieldsense-ai
DATABASE_URL=postgresql://...         # from Step 1 (paste as-is)
MONGO_URL=mongodb+srv://...           # from Step 2, with the password filled in
```

Leave `SECRET_KEY` empty (a random one is generated). `space.env` is gitignored, so it never goes into the repository.

## Step 5 — Deploy (1 command, then about 10 minutes of building)

```powershell
pip install huggingface_hub
python deploy/huggingface/deploy_space.py
```

The script:

1. builds a bundle of only the files the image needs (no `.env` files, tests or raw data);
2. creates the Space;
3. stores `DATABASE_URL`, `MONGO_URL` and `SECRET_KEY` as **Space secrets**, so they are not visible in the Space's files;
4. uploads the bundle and prints the app URL.

Open the printed Space page (`https://huggingface.co/spaces/<user>/yieldsense-ai`). The status goes **Building** → **Running** in about 10 minutes. The **Logs** tab shows the build and then the start-up: migrations, `crop_records: inserted 28,242 reference rows`, demo users and farms, then `listening on port 7860`.

## Step 6 — Check it

- App: **`https://<user>-yieldsense-ai.hf.space`** (the script prints the exact address)
- Health: add `/api/health` to that address; it should show `"status": "healthy"` with `database`, `mongo` and `model_loaded` all `true`.
- Sign in with `farmer / farmer123` and follow `docs/demo-script.md`.

Optional, from the project folder, using the address the script printed:

```powershell
python scripts/load_test.py --base https://<user>-yieldsense-ai.hf.space --users 5 --seconds 30
```

## Updating after code changes

Run `python deploy/huggingface/deploy_space.py` again. It uploads the new files and the Space rebuilds. The data in Neon and Atlas is kept; seeding only adds what is missing.

## Troubleshooting

| What you see | Fix |
| --- | --- |
| Logs: `databases not reachable` with a Mongo error | Atlas *Network Access* must include `0.0.0.0/0`, and the password in `MONGO_URL` must be the database user's password (not your Atlas login) |
| Logs: `password authentication failed` (Postgres) | Copy the Neon connection string again; reset the role password in Neon if needed |
| Space shows **Runtime error** | Open **Logs**; the last lines name the problem. Fix `space.env` and run the script again |
| App takes 1–2 minutes to open | The Space was asleep after 48 h without visitors; it wakes on the first visit. Open it a few minutes before a demo |
| Soil panel shows an error for a new farm | SoilGrids is slow; demo farms are pre-cached during start-up |
| `401` from the deploy script | The token needs **Write** access |

## What this is (and isn't) compared with the VM setup

- It **is** a cloud deployment of the full platform with managed databases, HTTPS (Hugging Face provides it), secrets kept out of the code, and repeatable one-command deploys.
- It is **not** the AWS/Azure VM named in the specification. The VM route (`docs/deployment.md`) stays available if you later get cloud credits.
- Free-tier limits: the Space sleeps when idle, Neon's free compute suspends when idle (adds about a second on the next query), and Atlas M0 has 512 MB of storage, far more than this app uses.
