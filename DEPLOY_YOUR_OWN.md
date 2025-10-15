# Deploy Your Own konkokt.xyz

Since you don't have access to the previous Netlify deployment, here's how to deploy your own version that YOU control:

## Option 1: Vercel (Recommended - Easiest)

1. **Sign up/Login to Vercel with YOUR account:**
   - Go to https://vercel.com/signup
   - Use your own email or GitHub account

2. **Import this project:**
   - Click "Add New" → "Project"
   - If using GitHub: Push this code to your GitHub repo first, then import
   - If not using GitHub: Use Vercel CLI (see below)

3. **Set Environment Variables in Vercel:**
   Go to Project Settings → Environment Variables and add:
   ```
   VITE_SUPABASE_URL=your-supabase-url
   VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
   VITE_XAI_API_KEY=your-xai-api-key
   VITE_HUGGINGFACE_API_KEY=your-huggingface-api-key
   ```

4. **Add your custom domain:**
   - Go to Project Settings → Domains
   - Add "konkokt.xyz"
   - Follow their DNS instructions

### Vercel CLI Method (No GitHub needed):

```bash
npm install -g vercel
vercel login
vercel --prod
```

Then add environment variables when prompted, and connect your domain in the dashboard.

---

## Option 2: Netlify (Your Own Account)

1. **Sign up with YOUR account:**
   - Go to https://app.netlify.com/signup
   - Use YOUR email or GitHub

2. **Deploy via drag & drop:**
   - Click "Add new site" → "Deploy manually"
   - Drag the `dist` folder

3. **Set Environment Variables:**
   Site settings → Environment variables → Add the same variables as above

4. **Add your custom domain:**
   - Site settings → Domain management → Add custom domain
   - Enter "konkokt.xyz"
   - Update DNS as instructed

---

## Option 3: GitHub + Auto Deploy (Best Long-term)

1. Push this code to a NEW GitHub repo under YOUR account
2. Connect that repo to Vercel or Netlify
3. Environment variables get set in the dashboard
4. Every push to main = automatic deployment

---

## Your DNS Settings for konkokt.xyz

Once you pick a platform, you'll need to update your domain's DNS:

**For Vercel:**
- Add A record: `76.76.21.21`
- Add CNAME for www: `cname.vercel-dns.com`

**For Netlify:**
- They'll give you custom DNS servers OR
- Add A record to their IP
- Add CNAME for www

---

## What's Already Done:
✅ App is built and ready (`dist` folder)
✅ All APIs configured and working
✅ Supabase edge function deployed
✅ Database schema ready
✅ Config files for both Vercel and Netlify included

You just need to deploy it under YOUR account!
