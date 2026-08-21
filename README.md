# Govt Exam Notes

Image-based revision notes for UPSC, SSC and RRB aspirants.

## Run locally

1. Set a secure password:

   ```powershell
   $env:ADMIN_PASSWORD = "replace-this-with-a-long-unique-password"
   ```

2. Start the site:

   ```powershell
   npm start
   ```

3. Open `http://127.0.0.1:4173`.

## Deploy on Render

1. Create a private GitHub repository and upload this project.
2. In Render, choose **New → Blueprint** and select the repository. Render will read `render.yaml`.
3. Choose the **Free** plan to test the site without a card. Free services pause after inactivity and lose new uploads whenever they restart or redeploy. For a public site where uploads must remain, later move to a paid service with persistent storage or cloud image storage.
4. In the Render service's **Environment** tab, set `ADMIN_PASSWORD` to your own strong, unique password. Do not use the generated value if you need to remember the password.
5. Deploy. Confirm the Render URL loads and that the admin upload flow works.

## Connect govtexamnotes.online in GoDaddy

1. In Render, open the service **Settings → Custom Domains** and add:
   - `govtexamnotes.online`
   - `www.govtexamnotes.online`
2. Render will show the exact DNS records it needs. In GoDaddy, open **My Products → Domains → govtexamnotes.online → DNS → Manage DNS**.
3. Copy the records from Render exactly. Usually this is a `CNAME` record for `www`; use the specific apex-domain record that Render displays for `@`.
4. Remove only conflicting `@` or `www` records if GoDaddy asks you to replace them.
5. Wait for DNS verification and HTTPS issuance in Render. This can take minutes to several hours.

## Important production note

This first version stores note records and uploaded JPG files on the server. Keep a backup of the `data/` and `uploads/` folders. For a larger public site, move uploads to cloud storage such as Cloudinary, Supabase Storage, or Amazon S3.
