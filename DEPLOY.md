# Cloudflare Deployment Guide

This guide assumes you have the Cloudflare Workers CLI (`wrangler`) installed and authenticated (`npx wrangler login`).

## 1. Backend Deployment (Cloudflare Workers)

1.  **Navigate to the backend directory:**
    ```bash
    cd backend
    ```

2.  **Initialize D1 Database:**
    If you haven't created the database yet:
    ```bash
    npx wrangler d1 create motolap-db
    ```
    *Copy the `database_id` from the output and update `wrangler.toml`.*

3.  **Apply Schema:**
    ```bash
    npx wrangler d1 execute motolap-db --file=schema.sql --remote
    ```

4.  **Deploy Worker:**
    ```bash
    npx wrangler deploy
    ```
    *Note the URL of your deployed Worker (e.g., `https://motolap-backend.<your-subdomain>.workers.dev`).*

## 2. Frontend Deployment (Cloudflare Workers + Assets)

We are using **Cloudflare Workers with Assets** (formerly Pages logic integrated into Workers) to serve the SPA.

1.  **Navigate to the frontend directory:**
    ```bash
    cd frontend
    ```

2.  **Environment Configuration:**
    The frontend needs to know your Backend URL to make API calls.
    - Since this is a static build, we need to bake the variable into the build time or configure it if SSR were used.
    - **For SPA (Static Client):**
        - Create a `.env.production` file (or just rely on local build env vars):
        ```
        VITE_API_URL=https://motolap-backend.<your-subdomain>.workers.dev
        ```
        - OR pass it during build:
        ```bash
        VITE_API_URL=https://motolap-backend.YOUR_SUBDOMAIN.workers.dev npm run build
        ```

3.  **Build and Deploy:**
    ```bash
    # 1. Build the static assets (Vite)
    # Make sure to set the VITE_API_URL!
    npm run build

    # 2. Deploy the Worker (which serves the assets)
    npx wrangler deploy
    ```

## 3. CI/CD with GitHub Actions

The repository includes a workflow in `.github/workflows/deploy.yml` that automatically deploys on push to `main`.

### Prerequisites

You must set the following **Secrets** and **Variables** in your GitHub Repository Settings > Secrets and variables > Actions.

#### Secrets
-   `CLOUDFLARE_API_TOKEN`: Create this in your Cloudflare Dashboard (My Profile > API Tokens).
    -   Template: **Edit Cloudflare Workers**
-   `CLOUDFLARE_ACCOUNT_ID`: Find this on the right side of your Cloudflare Dashboard Workers/Pages overview.

#### Variables (or Secrets)
-   `VITE_API_URL`: The URL of your deployed Backend Worker (e.g., `https://motolap-backend.YOUR_SUBDOMAIN.workers.dev`).

## Local Development

To run locally with the frontend talking to the local backend:

1.  **Backend:**
    ```bash
    cd backend
    npx wrangler dev
    ```
    *Runs on `http://localhost:8787` by default.*

2.  **Frontend:**
    Ensure `frontend/.env` exists and contains:
    ```
    VITE_API_URL=http://localhost:8787
    ```
    Then run:
    ```bash
    cd frontend
    npm run dev
    ```
