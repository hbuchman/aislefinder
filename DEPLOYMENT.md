# Aisle Finder Deployment Guide

## Environment Variables Setup

### Required Environment Variables

#### For Railway (Backend):
```
KROGER_CLIENT_SECRET=your_actual_kroger_client_secret
FLASK_ENV=production
```

#### For Vercel (Frontend):
```
REACT_APP_API_URL=https://api.aislefinder3000.com
```

### Getting Kroger API Credentials

1. Go to [Kroger Developer Portal](https://developer.kroger.com/)
2. Create an account and register your application
3. Get your Client ID and Client Secret
4. The Client ID is already in the code (`aislefinder4000-bbc6d2p3`)
5. Set the Client Secret as an environment variable

## Deployment Steps

### 1. Backend Deployment (Railway)

1. Push code to GitHub
2. Go to [railway.app](https://railway.app)
3. Create new project from GitHub repo
4. Add environment variable: `KROGER_CLIENT_SECRET`
5. Railway will automatically detect Python and deploy
6. Note your Railway URL (e.g., `https://your-app.railway.app`)

### 2. Frontend Deployment (Vercel)

1. Go to [vercel.com](https://vercel.com)
2. Import GitHub repository
3. Add environment variable: `REACT_APP_API_URL` = your Railway URL
4. Deploy
5. Note your Vercel URL

### 3. Domain Configuration

Point your DNS records:
- `aislefinder3000.com` → Vercel deployment
- `api.aislefinder3000.com` → Railway deployment

## Security Notes

- ✅ Secrets are now stored as environment variables
- ✅ .env files are gitignored
- ✅ CORS is configured for production domains
- ✅ No hardcoded credentials in source code

## Local Development

1. Copy `.env.example` to `.env`
2. Fill in your actual Kroger client secret
3. Run `source venv/bin/activate && python api_server.py`
4. Run `npm start` for frontend

## Files Created/Modified for Security

- `api.py`: Updated to use `os.getenv('KROGER_CLIENT_SECRET')`
- `api_server.py`: Added dotenv loading
- `.env.example`: Template with required variables
- `.gitignore`: Prevents committing secrets
- `requirements.txt`: Added python-dotenv